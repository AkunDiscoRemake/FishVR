// Fish behaviour: wandering, curiosity/approach to the lure, nibbling, biting,
// fleeing from splashes, and being driven by the fight when hooked.
import * as THREE from 'three';
import { createFish } from './FishModelFactory.js';
import { SPECIES, SPECIES_BY_ID } from '@game/species.js';

const UP = new THREE.Vector3(0, 1, 0);

export class FishAgent {
  constructor(species, opts, world) {
    this.species = species;
    this.world = world;
    this.model = createFish(species, opts);
    this.object = this.model.object;
    this.pos = this.object.position;
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.state = 'wander';
    this.timer = 0;
    this.speedNorm = 0.3;
    this.maxSpeed = 0.5 + species.speed * 2.2;
    this.turnRate = 1.2 + species.speed * 2.5;
    this.heading = new THREE.Vector3(0, 0, 1);
    this.bend = 0;
    this.drivenTarget = null; // hooked: externally driven target
    this.jumpT = -1;
    this.visibleAlpha = 1;
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
  }

  minDepth() { return -0.25 - this.model.lengthM * 0.15; }
  floorAt(x, z) {
    const d = this.world.waterDepth(x, z);
    return -Math.max(0.3, d - 0.3);
  }

  pickWanderTarget(center, radius) {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      const d = this.world.waterDepth(x, z);
      if (d > 1.0) {
        const y = -0.4 - Math.random() * Math.min(3.5, d - 0.6);
        this.target.set(x, y, z);
        return;
      }
    }
    this.target.copy(this.pos);
  }

  steer(dt, desiredSpeed) {
    const to = this.target.clone().sub(this.pos);
    const dist = to.length();
    if (dist > 1e-3) to.divideScalar(dist);
    const arrive = Math.min(1, dist / 1.5);
    const desired = to.multiplyScalar(desiredSpeed * arrive);
    const prevHeading = this.heading.clone();
    this.vel.lerp(desired, Math.min(1, dt * this.turnRate));
    this.pos.addScaledVector(this.vel, dt);
    const sp = this.vel.length();
    if (sp > 0.02) {
      this.heading.copy(this.vel).normalize();
      const cross = prevHeading.x * this.heading.z - prevHeading.z * this.heading.x;
      this.bend = THREE.MathUtils.clamp(-cross / Math.max(dt, 1e-3) * 0.6, -1, 1);
    }
    this.speedNorm = THREE.MathUtils.clamp(sp / this.maxSpeed, 0, 1);
    return dist;
  }

  orient(dt) {
    const h = this.heading.clone();
    h.y = THREE.MathUtils.clamp(h.y, -0.5, 0.5);
    if (h.lengthSq() < 1e-4) return;
    this._m.lookAt(new THREE.Vector3(), h.normalize().negate(), UP);
    this._q.setFromRotationMatrix(this._m);
    this.object.quaternion.slerp(this._q, Math.min(1, dt * 6));
  }

  constrain() {
    const floor = this.floorAt(this.pos.x, this.pos.z);
    if (this.jumpT < 0) this.pos.y = THREE.MathUtils.clamp(this.pos.y, floor, this.minDepth());
    if (this.world.waterDepth(this.pos.x, this.pos.z) < 0.4 && this.state !== 'hooked' && this.state !== 'landed') {
      // stepped onto land: push back along velocity
      this.pos.addScaledVector(this.vel, -0.05);
      this.vel.multiplyScalar(-0.5);
      this.pickWanderTarget(this.pos, 8);
    }
  }

  update(dt, ctx) {
    this.timer += dt;
    switch (this.state) {
      case 'wander': {
        if (this.timer > 4 + Math.random() * 6 || this.pos.distanceTo(this.target) < 0.6) {
          this.pickWanderTarget(ctx.home, ctx.radius);
          this.timer = 0;
        }
        this.steer(dt, this.maxSpeed * 0.3);
        break;
      }
      case 'flee': {
        this.steer(dt, this.maxSpeed);
        if (this.timer > 2.5) { this.state = 'wander'; this.timer = 0; }
        break;
      }
      case 'approach': {
        // swim toward the bait, slowing as it arrives
        this.target.copy(ctx.lure).add(this.approachOffset);
        const d = this.steer(dt, this.maxSpeed * (this.approachUrgency || 0.45));
        if (d < 0.4) { this.state = 'nibble'; this.timer = 0; }
        break;
      }
      case 'nibble': {
        const a = this.timer * 2.2;
        this.target.set(ctx.lure.x + Math.cos(a) * 0.45, ctx.lure.y - 0.45, ctx.lure.z + Math.sin(a) * 0.45);
        this.steer(dt, this.maxSpeed * 0.25);
        break;
      }
      case 'bite': {
        this.target.set(ctx.lure.x, ctx.lure.y - 0.2, ctx.lure.z);
        this.steer(dt, this.maxSpeed * 1.2);
        break;
      }
      case 'hooked': {
        if (this.drivenTarget) this.target.copy(this.drivenTarget);
        const k = this.jumpT >= 0 ? 0 : 1;
        if (k) this.steer(dt, this.maxSpeed * 1.4 + 1);
        if (this.jumpT >= 0) this._jump(dt);
        break;
      }
      case 'landed': {
        // dangling from the line in front of the player: wiggle
        this.pos.lerp(ctx.landPos, Math.min(1, dt * 4));
        this.speedNorm = 1;
        this.bend = Math.sin(this.timer * 9) * 0.8;
        this.heading.set(0, -1, 0.01);
        this.object.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, ctx.landYaw, 0, 'YXZ')), Math.min(1, dt * 4));
        this.model.update(dt, 1, this.bend);
        return;
      }
      case 'leave': {
        this.steer(dt, this.maxSpeed);
        break;
      }
      default: break;
    }
    if (this.state !== 'landed') {
      this.constrain();
      this.orient(dt);
    }
    this.model.update(dt, this.speedNorm, this.bend);
  }

  startJump(height) {
    this.jumpT = 0;
    this.jumpH = height;
    this.jumpStart = this.pos.clone();
    this.jumpVel = new THREE.Vector3(this.heading.x, 0, this.heading.z).normalize().multiplyScalar(1.5);
  }

  _jump(dt) {
    this.jumpT += dt;
    const T = 1.0;
    const t = this.jumpT / T;
    this.pos.x += this.jumpVel.x * dt;
    this.pos.z += this.jumpVel.z * dt;
    this.pos.y = this.jumpStart.y + (4 * this.jumpH * t * (1 - t)) + (t > 0.5 ? -0.3 * (t - 0.5) : 0);
    this.heading.set(this.jumpVel.x, (1 - 2 * t) * 1.2, this.jumpVel.z).normalize();
    this.speedNorm = 1;
    this.bend = Math.sin(this.jumpT * 25) * 0.8;
    if (t >= 1) { this.jumpT = -1; if (this.onJumpEnd) this.onJumpEnd(this.pos.clone()); }
  }

  dispose() {
    this.model.dispose();
  }
}

/** Owns ambient fish and the session's biting fish. */
export class FishManager {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'fish';
    scene.add(this.group);
    this.ambient = [];
    this.biter = null;
    this.world = null;
  }

  setWorld(world) {
    this.clear();
    this.world = world;
    const pool = SPECIES.filter((s) => s.worlds.indexOf(world.id) >= 0 && (s.rarity === 'C' || s.rarity === 'U') && s.lenMax < 160);
    const home = new THREE.Vector3(world.spawn.x, 0, world.spawn.z - 10);
    for (let i = 0; i < this.quality.ambientFish; i++) {
      const sp = pool[i % pool.length];
      const len = sp.lenMin + (sp.lenMax - sp.lenMin) * Math.random() * 0.6;
      const a = new FishAgent(sp, { detail: Math.min(1, this.quality.fishDetail), lengthCm: len, standard: this.quality.standardMaterials }, world);
      a.pickWanderTarget(home, 25);
      a.pos.copy(a.target);
      a.home = home;
      this.group.add(a.object);
      this.ambient.push(a);
    }
    this.home = home;
  }

  clear() {
    for (const a of this.ambient) { this.group.remove(a.object); a.dispose(); }
    this.ambient = [];
    this.removeBiter();
  }

  spawnBiter(roll, lurePos, biteDelay) {
    this.removeBiter();
    const sp = SPECIES_BY_ID[roll.speciesId];
    const a = new FishAgent(sp, { detail: this.quality.fishDetail, lengthCm: roll.lengthCm, variant: roll.variant, standard: this.quality.standardMaterials, shadows: this.quality.shadows }, this.world);
    // start a few metres away, in the water, ideally behind the lure
    const dist = THREE.MathUtils.clamp(biteDelay * 0.8, 2.5, 9);
    for (let k = 0; k < 16; k++) {
      const ang = Math.random() * Math.PI * 2;
      const x = lurePos.x + Math.cos(ang) * dist, z = lurePos.z + Math.sin(ang) * dist;
      if (this.world.waterDepth(x, z) > 1) { a.pos.set(x, -Math.min(2.5, this.world.waterDepth(x, z) - 0.5), z); break; }
      a.pos.set(lurePos.x, -1.5, lurePos.z - 1);
    }
    a.state = 'approach';
    a.approachOffset = new THREE.Vector3(0.6, -0.5, 0.6);
    a.approachUrgency = THREE.MathUtils.clamp(dist / Math.max(1, biteDelay - 1.2) / a.maxSpeed, 0.2, 1);
    this.group.add(a.object);
    this.biter = a;
    return a;
  }

  removeBiter() {
    if (this.biter) {
      this.group.remove(this.biter.object);
      this.biter.dispose();
      this.biter = null;
    }
  }

  /** Startle fish near a splash. */
  startle(p, radius) {
    for (const a of this.ambient) {
      const d = a.pos.distanceTo(p);
      if (d < radius) {
        a.state = 'flee';
        a.timer = 0;
        const away = a.pos.clone().sub(p).setY(0).normalize().multiplyScalar(6);
        a.target.copy(a.pos).add(away);
      }
    }
  }

  update(dt, lurePos, landPos, landYaw) {
    const ctx = { home: this.home, radius: 26, lure: lurePos, landPos, landYaw };
    for (const a of this.ambient) a.update(dt, ctx);
    if (this.biter) this.biter.update(dt, ctx);
  }
}
