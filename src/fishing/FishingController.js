// Fishing state machine: idle -> charging -> flying -> waiting -> bite -> hookset -> fight -> landed/lost.
// The fight uses the shared deterministic PERFECT! model (same code the server uses to validate).
import * as THREE from 'three';
import {
  GAME, RATING_BY_KEY, SPECIES_BY_ID, RODS_BY_ID, fightParams, generateBeats, idealAt, angularError,
  rateError, initialState, applyBeat,
} from '@game/index.js';
import { RodModel } from '../rods/RodModel.js';
import { VerletLine } from '../physics/VerletLine.js';
import { Lure } from '../physics/Lure.js';
import { FightGuide } from './FightGuide.js';
import { RatingFeedback } from './RatingFeedback.js';
import { audio } from '../audio/AudioEngine.js';
import { bus } from '../core/EventBus.js';
import { settings } from '../core/Settings.js';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

export class FishingController {
  constructor(ctx) {
    this.ctx = ctx; // { scene, input, camera, quality, particles, fish, hud, backendRef(), worldRef(), water }
    this.state = 'idle';
    this.time = 0;
    this.rod = null;
    this.rodModel = null;
    this.line = new VerletLine(ctx.quality.lineSegments);
    this.line.waterHeight = (x, z) => ctx.water.heightAt(x, z);
    ctx.scene.add(this.line.mesh);
    this.lure = new Lure(ctx.quality);
    ctx.scene.add(this.lure.object);
    this.guide = new FightGuide(ctx.scene);
    this.feedback = new RatingFeedback(ctx.scene, ctx.particles);
    this.guidePath = [];
    this.tip = new THREE.Vector3();
    this.session = null;
    this.fight = null;
    this.enabled = true;
    this.lineOut = 1;
    this.tensionVis = 0;
    this.reelVis = 0;
    this.chargeT = 0;
    this.maxSwing = 0;
    this.mode = 'solo'; // solo | duel
  }

  setRod(rodId) {
    const rod = RODS_BY_ID[rodId] || RODS_BY_ID.willow_starter;
    if (this.rodModel) { this.rodModel.root.parent && this.rodModel.root.parent.remove(this.rodModel.root); this.rodModel.dispose(); }
    this.rod = rod;
    this.rodModel = new RodModel(rod, this.ctx.quality);
    this.ctx.input.hand.add(this.rodModel.root);
    this.resetLure();
  }

  get world() { return this.ctx.worldRef(); }
  get backend() { return this.ctx.backendRef(); }
  get busy() { return this.state !== 'idle'; }

  resetLure() {
    this.state = 'idle';
    this.lure.state = 'held';
    this.lure.dip = 0; this.lure.dipTarget = 0;
    this.rodModel.root.updateMatrixWorld(true);
    this.rodModel.tipWorld(this.tip);
    this.lure.pos.copy(this.tip).add(new THREE.Vector3(0, -0.4, 0));
    this.lure.vel.set(0, 0, 0);
    this.line.reset(this.tip, this.lure.pos);
    this.line.length = 0.45;
    this.guide.group.visible = false;
    this.ctx.hud.setFight(null);
    this.ctx.hud.setPower(null);
    this.ctx.fish.removeBiter();
    this.fight = null;
  }

  /** Abort whatever is happening (menu/world change). Closes the server session if open. */
  abort() {
    if (this.session && !this.session.closed && this.mode === 'solo') this._submit(null, []).catch(() => {});
    this.session = null;
    this.mode = 'solo';
    this.resetLure();
  }

  // ---------------------------------------------------------------- helpers
  _head() { return this.ctx.camera.getWorldPosition(new THREE.Vector3()); }
  _rodDir() { return this.ctx.input.rodDirection(new THREE.Vector3()); }
  _yawPitch(dir) {
    const f = this.fight.forward, r = this.fight.right;
    const yaw = Math.atan2(dir.dot(r), dir.dot(f)) / DEG;
    const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / DEG;
    return { yaw, pitch };
  }
  _dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
    const f = this.fight.forward, r = this.fight.right;
    const cy = Math.cos(yaw * DEG), sy = Math.sin(yaw * DEG), cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG);
    return out.copy(f).multiplyScalar(cy * cp).addScaledVector(r, sy * cp).addScaledVector(UP, sp).normalize();
  }

  // ---------------------------------------------------------------- casting
  _startCharge() {
    this.state = 'charging';
    this.chargeT = 0;
    this.maxSwing = 0;
  }

  _release() {
    const input = this.ctx.input;
    const charge = 1 - Math.abs(((this.chargeT / 1.4) % 2) - 1); // triangle 0..1..0
    const swing = THREE.MathUtils.clamp((this.maxSwing - 1.5) / 6, 0, 1);
    const power = Math.max(charge, swing, 0.12);
    const dir = this._rodDir();
    const flat = dir.clone().setY(0);
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1).applyQuaternion(this.ctx.camera.getWorldQuaternion(new THREE.Quaternion())).setY(0);
    flat.normalize();
    const elev = THREE.MathUtils.clamp(Math.asin(dir.y), 0.15, 0.9) * 0.6 + 0.25;
    const speed = (5 + power * 15) * this.rod.castPower;
    const v = flat.multiplyScalar(Math.cos(elev) * speed).add(new THREE.Vector3(0, Math.sin(elev) * speed, 0));
    this.rodModel.tipWorld(this.tip);
    this.lure.launch(this.tip, v);
    this.line.reset(this.tip, this.tip);
    this.line.length = 0.5;
    this.state = 'flying';
    this.ctx.hud.setPower(null);
    audio.cast(power);
    input.pulse(0.4, 40);
    bus.emit('cast', { power });
  }

  // ---------------------------------------------------------------- server session
  async _beginSession() {
    const world = this.world;
    this.session = { pending: true, closed: false };
    const sess = this.session;
    try {
      const roll = await this.backend.startFishing(world.id);
      if (sess !== this.session) return; // aborted meanwhile
      Object.assign(sess, roll, { pending: false, receivedAt: this.time });
      sess.biteAt = this.time + roll.biteDelay;
      const biter = this.ctx.fish.spawnBiter(roll, this.lure.pos, roll.biteDelay);
      sess.biter = biter;
      sess.nextNibble = sess.biteAt - 2.4 + Math.random() * 0.4;
    } catch (e) {
      if (sess !== this.session) return;
      this.session = null;
      this.ctx.hud.toast(errorText(e.message), '#ff8a7a');
      audio.error();
      this.state = 'retrieving';
    }
  }

  async _submit(strikeT, actions) {
    const s = this.session;
    if (!s || s.closed || !s.sessionId) return null;
    s.closed = true;
    return this.backend.completeFishing(s.sessionId, strikeT, actions);
  }

  // ---------------------------------------------------------------- fight
  _beginFight(opts) {
    const species = opts.species;
    const rod = opts.rod || this.rod;
    const head = this._head();
    const toLure = opts.forward || this.lure.pos.clone().sub(head).setY(0);
    if (toLure.lengthSq() < 1e-4) toLure.set(0, 0, -1);
    toLure.normalize();
    const params = fightParams(species, opts.weightKg, rod, opts.eventId || 'none');
    this.fight = {
      species, rod, params,
      beats: generateBeats(opts.seed, species, opts.weightKg, rod),
      state: initialState(params),
      actions: [],
      startAt: opts.startAt,
      origin: head,
      forward: toLure,
      right: new THREE.Vector3(-toLure.z, 0, toLure.x),
      dispDistance: params.startDistance,
      fishYaw: 0,
      lastRatingAt: -10,
      pendingBeat: -1,
      hapticAcc: 0,
      ended: false,
      onAction: opts.onAction,
      onDone: opts.onDone,
    };
    this.state = 'fight';
  }

  _resolveBeat(beat, action) {
    const f = this.fight;
    let rating;
    let err = null;
    if (action) {
      const ideal = idealAt(beat, action.t);
      err = angularError(action.yaw, action.pitch, ideal.yaw, ideal.pitch);
      rating = rateError(err, f.params.tolerance);
      f.actions.push(action);
    } else rating = RATING_BY_KEY.FAILED;
    applyBeat(f.state, beat, rating, f.params);
    // feedback
    const handPos = this.ctx.input.hand.getWorldPosition(new THREE.Vector3());
    const ideal = idealAt(beat, action ? action.t : beat.w1);
    const pos = handPos.addScaledVector(this._dirFromYawPitch(ideal.yaw, ideal.pitch), 3.2);
    pos.y += 0.35;
    this.feedback.show(rating, pos, this._head(), f.state.combo);
    audio.rating(rating.key);
    const hapt = { PERFECT: [1, 80], AMAZING: [0.8, 60], GOOD: [0.6, 45], NOTGOOD: [0.4, 30], BAD: [0.5, 90], FAILED: [1, 160] }[rating.key];
    this.ctx.input.pulse(hapt[0], hapt[1]);
    f.lastRatingAt = this.time;
    f.lastRating = rating;
    if (this.mode === 'duel' && f.onAction) f.onAction(f.state, rating);
    bus.emit('rating', { rating, state: f.state, err });
    if (f.state.done) this._endFight();
  }

  _endFight() {
    const f = this.fight;
    if (f.ended) return;
    f.ended = true;
    this.ctx.hud.setFight(null);
    const result = f.state.result;
    this.guide.group.visible = false;
    const biter = this.ctx.fish.biter;
    if (result === 'caught') {
      this.state = 'landing';
      this.landT = 0;
      if (biter) { biter.state = 'landed'; biter.timer = 0; }
      audio.catchFanfare(f.species.rarity);
      this.ctx.particles.splash(this.lure.pos.clone().setY(0), 1.4);
    } else {
      this.state = 'lost';
      this.lostT = 0;
      if (result === 'snapped') { audio.snap(); this.ctx.hud.prompt('LINE SNAPPED!', '#ff5a4a', 2.2); this.ctx.input.pulse(1, 200); }
      else { audio.escape(); this.ctx.hud.prompt('THE FISH ESCAPED', '#ffb07a', 2.2); }
      if (biter) {
        biter.state = 'leave'; biter.timer = 0;
        biter.target.copy(biter.pos).add(f.forward.clone().multiplyScalar(30)).setY(-3);
      }
    }
    if (this.mode === 'duel') {
      if (f.onDone) f.onDone(f.state, f.actions);
      return;
    }
    const strikeT = this.session ? this.session.strikeT : null;
    const actions = f.actions.map((a) => ({ i: a.i, t: round3(a.t), yaw: round3(a.yaw), pitch: round3(a.pitch) }));
    const summary = { species: f.species, local: f.state, roll: this.session };
    this._submit(strikeT, actions).then((res) => {
      bus.emit('fish-result', Object.assign({ res }, summary));
    }).catch((e) => {
      bus.emit('fish-result', Object.assign({ res: { status: 'error', reason: e.message } }, summary));
    });
  }

  /** PvP: start a scripted duel fight with the shared fish. startAt is local time (this.time units). */
  startDuel(opts) {
    this.abort();
    this.mode = 'duel';
    const head = this._head();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ctx.camera.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const lurePos = head.clone().addScaledVector(fwd, 14).setY(0);
    this.lure.pos.copy(lurePos);
    this.lure.state = 'underwater';
    this.lure.dipTarget = 0.5;
    const roll = { speciesId: opts.species.id, lengthCm: opts.lengthCm, variant: 'normal' };
    const biter = this.ctx.fish.spawnBiter(roll, lurePos, 1);
    biter.state = 'hooked';
    biter.pos.copy(lurePos).setY(-1.2);
    this._beginFight(Object.assign({}, opts, { forward: fwd }));
    this.state = 'duel-countdown';
  }

  // ---------------------------------------------------------------- per frame
  update(dt, uiConsumed) {
    this.time += dt;
    const input = this.ctx.input;
    const world = this.world;
    if (!this.rodModel || !world) return;
    this.rodModel.root.updateMatrixWorld(true);
    this.rodModel.tipWorld(this.tip);
    const waterH = (x, z) => this.ctx.water.heightAt(x, z);
    const groundH = (x, z) => {
      const g = world.groundHeight(x, z);
      if (g !== null) return g;
      const t = world.terrainHeight(x, z);
      return t > 0.05 ? t : null;
    };
    const isWater = (x, z) => world.isWater(x, z);
    const trigPressed = this.enabled && !uiConsumed && input.triggerPressed;
    const trigDown = this.enabled && !uiConsumed && input.triggerDown;
    const trigReleased = this.enabled && input.triggerReleased;
    let tension = 0.05;
    let reel = 0;
    let lineEnd = null;
    let pullDir = null;

    switch (this.state) {
      case 'idle': {
        // lure dangles below the tip
        const target = this.tip.clone().add(new THREE.Vector3(0, -0.42, 0));
        this.lure.vel.addScaledVector(target.sub(this.lure.pos), dt * 60);
        this.lure.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
        this.lure.vel.y -= 2 * dt;
        this.lure.pos.addScaledVector(this.lure.vel, dt);
        this.lure.state = 'held';
        this.line.length = 0.45;
        lineEnd = this.lure.pos;
        if (trigPressed && this.mode === 'solo') this._startCharge();
        break;
      }
      case 'charging': {
        this.chargeT += dt;
        const w = input.angularVelocity.length();
        this.maxSwing = Math.max(this.maxSwing * Math.pow(0.02, dt), w);
        const charge = 1 - Math.abs(((this.chargeT / 1.4) % 2) - 1);
        this.ctx.hud.setPower(Math.max(charge, THREE.MathUtils.clamp((this.maxSwing - 1.5) / 6, 0, 1)));
        const target = this.tip.clone().add(new THREE.Vector3(0, -0.42, 0));
        this.lure.pos.lerp(target, Math.min(1, dt * 12));
        lineEnd = this.lure.pos;
        if (!input.trigger.down) this._release();
        break;
      }
      case 'flying': {
        const ev = this.lure.update(dt, waterH, groundH, isWater);
        this.line.length = Math.max(this.line.length, this.tip.distanceTo(this.lure.pos) * 1.05);
        reel = 0.6;
        if (trigPressed) this.lure.vel.multiplyScalar(0.25); // thumb the spool to stop the cast short
        lineEnd = this.lure.pos;
        if (ev === 'water') {
          audio.splash(0.6);
          this.ctx.particles.splash(this.lure.pos, 0.5);
          this.ctx.fish.startle(this.lure.pos, 3);
          this.state = 'waiting';
          this.waitStart = this.time;
          if (this.mode === 'solo') this._beginSession();
        } else if (ev === 'ground') {
          this.ctx.hud.toast('Landed on the shore - reel in and cast to the water', '#ffd9a0');
          this.state = 'retrieving';
        } else if (this.lure.pos.y < -20 || this.lure.pos.distanceTo(this.tip) > this.rod.maxLine) {
          this.state = 'retrieving';
        }
        break;
      }
      case 'waiting': {
        this.lure.update(dt, waterH, groundH, isWater);
        lineEnd = this.lure.pos;
        const s = this.session;
        tension = 0.08;
        if (trigDown) {
          // reel the bait back in (cancels the session if nothing bit yet)
          reel = 0.8;
          const head = this._head();
          const d = this.lure.pullToward(head, 2.2 + this.rod.stats.reel * 2, dt);
          this.line.length = Math.max(0.6, this.tip.distanceTo(this.lure.pos) * 1.02);
          tension = 0.25;
          if (d < 2.2 || !world.isWater(this.lure.pos.x, this.lure.pos.z)) {
            if (s && !s.pending) this._submit(null, []).catch(() => {});
            this.session = null;
            this.ctx.fish.removeBiter();
            this.resetLure();
            break;
          }
        }
        if (s && !s.pending) {
          if (this.time >= s.nextNibble && this.time < s.biteAt - 0.3) {
            this.lure.dipTarget = 0.035 + Math.random() * 0.03;
            s.nibbleEnd = this.time + 0.12;
            s.nextNibble = this.time + 0.35 + Math.random() * 0.7;
            audio.plop();
            input.pulse(0.15, 15);
          }
          if (s.nibbleEnd && this.time > s.nibbleEnd) { this.lure.dipTarget = 0; s.nibbleEnd = 0; }
          if (this.time >= s.biteAt) {
            this.state = 'bite';
            this.biteTime = this.time;
            this.lure.dipTarget = 0.3;
            this.lure.state = 'underwater';
            audio.bite();
            this.ctx.particles.splash(this.lure.pos.clone(), 0.35);
            input.pulse(1, 120);
            this.ctx.hud.prompt('STRIKE!', '#ffd23f', GAME.STRIKE_WINDOW);
            if (s.biter) { s.biter.state = 'bite'; }
          }
        }
        break;
      }
      case 'bite': {
        this.lure.update(dt, waterH, groundH, isWater);
        lineEnd = this.lure.pos;
        tension = 0.5;
        const since = this.time - this.biteTime;
        // trigger OR a sharp upward flick of the rod sets the hook
        const flick = input.angularVelocity.length() > 5 && this._rodDir().y > 0.15;
        if (trigPressed || flick) {
          this.session.strikeT = Math.round(Math.min(since, GAME.STRIKE_WINDOW) * 1000) / 1000;
          audio.strike();
          input.pulse(1, 60);
          this.ctx.hud.prompt('HOOKED!', '#7dff6a', 1);
          const s = this.session;
          const species = SPECIES_BY_ID[s.speciesId];
          this._beginFight({ species, weightKg: s.weightKg, seed: s.seed, eventId: s.eventId, startAt: this.biteTime + GAME.STRIKE_WINDOW });
          this.state = 'hookset';
          if (s.biter) { s.biter.state = 'hooked'; }
        } else if (since > GAME.STRIKE_WINDOW) {
          this.ctx.hud.prompt('MISSED! The fish stole the bait', '#ffb07a', 2);
          this._submit(null, []).catch(() => {});
          if (this.session && this.session.biter) { const b = this.session.biter; b.state = 'leave'; b.timer = 0; b.target.copy(b.pos).add(new THREE.Vector3(10, -2, -10)); }
          this.lure.dipTarget = 0;
          this.lure.state = 'floating';
          this.state = 'retrieving';
        }
        break;
      }
      case 'duel-countdown':
      case 'hookset':
      case 'fight': {
        const f = this.fight;
        const ft = this.time - f.startAt;
        if (this.state !== 'fight' && ft >= 0) this.state = 'fight';
        this._updateFight(dt, Math.max(0, ft), trigPressed);
        const fish = this.ctx.fish.biter;
        lineEnd = fish ? fish.object.localToWorld(new THREE.Vector3(0, 0, 0.5)) : this.lure.pos;
        this.lure.pos.copy(lineEnd);
        tension = this.tensionVis;
        reel = this.reelVis;
        pullDir = lineEnd.clone().sub(this.tip).normalize();
        this.line.length = this.tip.distanceTo(lineEnd) * 1.01;
        break;
      }
      case 'landing': {
        this.landT += dt;
        const head = this._head();
        const fwd = this.fight.forward;
        const side = new THREE.Vector3(fwd.z, 0, -fwd.x); // to the player's left (the catch card sits on the right)
        const landPos = head.clone().addScaledVector(fwd, 1.25).addScaledVector(side, 0.35).add(new THREE.Vector3(0, -0.3, 0));
        this.landPos = landPos;
        this.landYaw = Math.atan2(-fwd.x, -fwd.z);
        const fish = this.ctx.fish.biter;
        lineEnd = fish ? fish.object.localToWorld(new THREE.Vector3(0, 0, 0.5)) : this.tip.clone().add(new THREE.Vector3(0, -0.5, 0));
        this.line.length = this.tip.distanceTo(lineEnd);
        reel = this.landT < 1 ? 1 : 0;
        tension = 0.3;
        break;
      }
      case 'lost': {
        this.lostT += dt;
        // line goes slack and the lure floats back up
        this.lure.state = 'floating';
        this.lure.dipTarget = 0;
        this.lure.update(dt, waterH, groundH, isWater);
        lineEnd = this.fight && this.fight.state.result === 'snapped' ? null : this.lure.pos;
        if (this.lostT > 2.2) {
          this.ctx.fish.removeBiter();
          if (this.mode === 'duel') { this.state = 'duel-done'; }
          else if (this.fight && this.fight.state.result === 'snapped') { this.session = null; this.resetLure(); }
          else { this.state = 'retrieving'; this.session = null; }
        }
        break;
      }
      case 'retrieving': {
        reel = 1;
        this.lure.state = this.lure.state === 'landed' ? 'landed' : 'floating';
        const head = this._head();
        const to = this.tip.clone().sub(this.lure.pos);
        const dist = to.length();
        this.lure.pos.addScaledVector(to.normalize(), Math.min(dist, dt * 9));
        if (this.lure.state === 'floating') this.lure.pos.y = Math.max(this.lure.pos.y, waterH(this.lure.pos.x, this.lure.pos.z) - 0.02);
        this.lure.object.position.copy(this.lure.pos);
        this.line.length = Math.max(0.45, dist);
        lineEnd = this.lure.pos;
        if (dist < 0.6) { this.session = null; this.ctx.fish.removeBiter(); this.resetLure(); }
        void head;
        break;
      }
      case 'result':
      case 'duel-done':
        lineEnd = this.ctx.fish.biter ? this.ctx.fish.biter.object.localToWorld(new THREE.Vector3(0, 0, 0.5)) : this.tip.clone().add(new THREE.Vector3(0, -0.4, 0));
        this.line.length = this.tip.distanceTo(lineEnd);
        break;
      default: break;
    }
    if (this.state !== 'flying' && this.state !== 'waiting' && this.state !== 'bite' && this.state !== 'lost') this.lure.object.position.copy(this.lure.pos);
    this.lure.object.visible = !(this.state === 'fight' || this.state === 'hookset' || this.state === 'landing' || this.state === 'duel-countdown' || this.state === 'result' || this.state === 'duel-done');

    // line simulation + rendering
    if (lineEnd) {
      this.line.simulate(dt, this.tip, lineEnd, this.state === 'fight' ? 8 : 5);
      this.line.mesh.visible = true;
    } else {
      this.line.simulate(dt, this.tip, null, 3);
      this.line.length = Math.max(0.3, this.line.length - dt * 6);
    }
    this.rodModel.guidePath(this.guidePath);
    this.line.updateMesh(this.guidePath, tension);
    // rod bend toward the line
    const pd = pullDir || (lineEnd ? lineEnd.clone().sub(this.tip).normalize() : new THREE.Vector3(0, -1, 0));
    this.rodModel.setBend(tension, pd, dt);
    this.rodModel.spinReel(dt, reel);
    audio.updateLine(dt, reel, tension);

    const camPos = this._head();
    this.feedback.update(dt, camPos);
    const fish = this.ctx.fish.biter;
    this.ctx.fish.update(dt, this.lure.pos, this.landPos || camPos, this.landYaw || 0);
    void fish;
  }

  _updateFight(dt, ft, trigPressed) {
    const f = this.fight;
    const st = f.state;
    const input = this.ctx.input;
    const beats = f.beats;
    let beat = beats[st.beatIndex];
    if (!st.done && beat) {
      // window passed without an action -> Failed!
      if (this.state === 'fight' && ft > beat.w1 + 0.02) {
        this._resolveBeat(beat, null);
        beat = beats[st.beatIndex];
      }
    }
    const rodDir = this._rodDir();
    const yp = this._yawPitch(rodDir);
    let phase = 'idle', progress = 0, ideal = { yaw: 0, pitch: 15 };
    if (!st.done && beat) {
      if (ft >= beat.t0 && ft < beat.w0) { phase = 'telegraph'; progress = (ft - beat.t0) / (beat.w0 - beat.t0); ideal = idealAt(beat, beat.w0); }
      else if (ft >= beat.w0 && ft <= beat.w1) { phase = 'window'; progress = (ft - beat.w0) / (beat.w1 - beat.w0); ideal = idealAt(beat, ft); }
      else ideal = idealAt(beat, beat.w0);
      if (phase === 'window' && trigPressed && this.state === 'fight') {
        this._resolveBeat(beat, { i: beat.i, t: ft, yaw: yp.yaw, pitch: yp.pitch });
      }
    }
    // ---- visuals driven by the authoritative state
    const tol = f.params.tolerance;
    const idealDir = this._dirFromYawPitch(ideal.yaw, ideal.pitch);
    const handPos = input.hand.getWorldPosition(new THREE.Vector3());
    this.guide.update(handPos, idealDir, rodDir, 5 * tol, 17 * tol, st.done ? 'idle' : phase, progress, this._head(),
      -ideal.yaw, settings.get('showGuide') && !st.done && this.state === 'fight');
    if (this.state !== 'fight') this.guide.group.visible = false;

    f.dispDistance += (st.distance - f.dispDistance) * Math.min(1, dt * 2.5);
    const targetFishYaw = phase === 'idle' ? f.fishYaw * 0.98 : -ideal.yaw * 0.75;
    f.fishYaw += (targetFishYaw - f.fishYaw) * Math.min(1, dt * (1 + f.species.speed * 2));
    const fish = this.ctx.fish.biter;
    const kind = beat ? beat.kind : 'rest';
    if (fish) {
      // keep the hooked fish over water: shrink its lateral angle, then its distance, if needed
      let yawUse = f.fishYaw, distUse = f.dispDistance;
      const world = this.world;
      const dir = this._dirFromYawPitch(yawUse, 0);
      let target = f.origin.clone().addScaledVector(dir, distUse);
      for (let k = 0; k < 6 && world.waterDepth(target.x, target.z) < 1.2; k++) {
        if (k < 3) yawUse *= 0.5; else distUse = Math.max(4, distUse * 0.8);
        target = f.origin.clone().addScaledVector(this._dirFromYawPitch(yawUse, 0), distUse);
      }
      const depth = kind === 'dive' && phase !== 'idle' ? -3.5 : -0.9 - (st.hp / st.hpMax) * 0.8;
      target.y = depth;
      fish.drivenTarget = target;
      if (kind === 'jump' && phase === 'window' && fish.jumpT < 0 && f.jumpedBeat !== beat.i) {
        f.jumpedBeat = beat.i;
        fish.pos.y = -0.2;
        fish.startJump(0.8 + f.species.speed * 1.2);
        audio.splash(1.2);
        this.ctx.particles.splash(fish.pos.clone().setY(0), 1.2);
        fish.onJumpEnd = (p) => { audio.splash(1.4); this.ctx.particles.splash(p.setY(0), 1.4); };
      }
      if (Math.random() < dt * 3) this.ctx.particles.bubbles(fish.pos.clone(), 2);
      if (fish.pos.y > -0.6 && Math.random() < dt * 4) this.ctx.particles.splash(fish.pos.clone().setY(0), 0.25);
    }
    const sinceRating = this.time - f.lastRatingAt;
    const lastQ = f.lastRating ? f.lastRating.q : 0;
    let errBoost = 0;
    if (phase === 'window') {
      const err = angularError(yp.yaw, yp.pitch, ideal.yaw, ideal.pitch);
      errBoost = THREE.MathUtils.clamp(err / (40 * tol), 0, 1) * 0.18 * (beat ? beat.pull : 0.5);
    }
    const target = THREE.MathUtils.clamp(st.tension + errBoost + (phase === 'window' ? 0.05 : 0), 0, 1.1);
    this.tensionVis += (target - this.tensionVis) * Math.min(1, dt * 6);
    this.reelVis = sinceRating < 0.7 ? lastQ : 0;
    // haptics: rumble with tension
    f.hapticAcc += dt;
    if (f.hapticAcc > 0.18 && this.tensionVis > 0.45 && !st.done) { f.hapticAcc = 0; input.pulse(Math.min(1, this.tensionVis * 0.6), 30); }
    this.ctx.hud.setFight({
      species: f.species, tension: this.tensionVis, stamina: st.hp / st.hpMax, distance: f.dispDistance, maxLine: f.params.maxLine,
      score: st.score, combo: st.combo, perfects: st.perfects, counts: st.counts, phase, beatKind: kind,
      countdown: this.state === 'duel-countdown' ? -(this.time - f.startAt) : null,
    });
  }

  /** Called by the game once the player closes the catch card. */
  finishLanding() {
    this.mode = 'solo';
    this.ctx.fish.removeBiter();
    this.session = null;
    this.resetLure();
  }
}

function round3(v) { return Math.round(v * 1000) / 1000; }

export function errorText(code) {
  const map = {
    world_locked: 'This world is locked - level up first.',
    too_many_casts: 'Slow down! Too many casts per minute.',
    server_not_configured: 'Online server not configured.',
    invalid_token: 'Session expired - please sign in again.',
    missing_token: 'Please sign in to play online.',
    not_enough_coins: 'Not enough coins.',
    already_owned: 'You already own this rod.',
    not_owned: 'You do not own this rod.',
    'Failed to fetch': 'Network error - check your connection.',
  };
  return map[code] || ('Error: ' + code);
}
