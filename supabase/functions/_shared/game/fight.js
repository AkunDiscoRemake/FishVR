// The PERFECT! fight model. Deterministic given (seed, species, weight, rod),
// so the Edge Functions can re-simulate any fight from the player's action log.
//
// Coordinates: fight-local frame. yaw 0 = horizontal direction from the player
// to the hooked fish at hook-set, positive yaw = to the player's right.
// pitch = degrees above the horizon. The ideal values are where the ROD must
// point: the player counters the fish (fish runs left -> rod sweeps right).
import { createRng, clamp, lerp, smoothstep } from './rng.js';
import { RATINGS, RATING_BY_KEY, GAME, RARITIES } from './constants.js';
import { BEHAVIORS, speciesDifficulty } from './species.js';
import { EVENTS } from './worlds.js';

const DEG = Math.PI / 180;

export function fightParams(species, weightKg, rod, eventId) {
  const ev = EVENTS[eventId] || EVENTS.none;
  const diff = speciesDifficulty(species, weightKg);
  const sizeRatio = clamp(weightKg / Math.max(0.01, species.avgWeight), 0.2, 3);
  const s = rod.stats;
  const rarityD = RARITIES[species.rarity].difficulty;
  return {
    difficulty: diff,
    tolerance: (0.8 + s.precision * 0.55) / (0.85 + diff * 0.45),
    hpMax: 100 * (0.6 + species.stamina * 0.9) * (0.7 + 0.3 * Math.min(2, sizeRatio)) * (1 + rarityD * 2.5),
    power: (0.35 + species.power * 0.65) * (0.8 + 0.2 * Math.min(2.5, sizeRatio)),
    startDistance: 12 + diff * 16,
    maxLine: rod.maxLine,
    tensionMul: ev.tensionMul || 1,
    rod: s,
  };
}

/** Generates the full deterministic beat schedule of a fight. */
export function generateBeats(seed, species, weightKg, rod) {
  const rng = createRng((seed ^ 0x0bea7000) >>> 0);
  const B = BEHAVIORS[species.behavior] || BEHAVIORS.runner;
  const stability = rod.stats.stability;
  const beats = [];
  let t = 1.4;
  let prevYaw = 0;
  let phaseLeft = rng.int(3, 6); // resistance phase length before an approach moment
  for (let i = 0; i < GAME.MAX_BEATS; i++) {
    let kind;
    if (phaseLeft <= 0) {
      kind = 'approach';
      phaseLeft = rng.int(3, 6);
    } else {
      phaseLeft--;
      const r = rng.next();
      if (r < B.rest * 0.5) kind = 'rest';
      else if (r < B.rest * 0.5 + B.jump) kind = 'jump';
      else if (r < B.rest * 0.5 + B.jump + B.dive) kind = 'dive';
      else if (r < B.rest * 0.5 + B.jump + B.dive + B.lateral) kind = 'lateral';
      else kind = 'run';
    }
    let win = 1.15 * B.tempo * (1.25 - species.speed * 0.45) * (0.82 + stability * 0.36);
    let tele = 0.8 * (0.8 + B.tempo * 0.3) * (1.15 - species.speed * 0.3);
    // switch side most of the time so the fish keeps "changing direction"
    const side = Math.abs(prevYaw) > 8 && rng.chance(0.72) ? -Math.sign(prevYaw) : rng.sign();
    let yaw0 = side * rng.range(0.35, 1) * B.yaw;
    let yaw1 = yaw0;
    let pitch0 = rng.range(6, 14 + B.pitch * 0.3);
    let pitch1 = pitch0;
    let pull = B.pull * rng.range(0.75, 1.1);
    switch (kind) {
      case 'lateral': {
        const sweep = -Math.sign(yaw0 || 1) * rng.range(18, 40);
        yaw1 = clamp(yaw0 + sweep, -60, 60);
        win *= 1.15;
        break;
      }
      case 'dive':
        pitch0 = rng.range(26, 40);
        pitch1 = clamp(pitch0 + rng.range(-4, 10), 20, 50);
        pull *= 1.15;
        break;
      case 'jump':
        pitch0 = rng.range(-8, 2);
        pitch1 = pitch0;
        yaw0 *= 0.6; yaw1 = yaw0;
        win *= 0.8;
        tele *= 0.85;
        break;
      case 'rest':
      case 'approach':
        yaw0 = rng.range(-12, 12);
        yaw1 = yaw0 + rng.range(-6, 6);
        pitch0 = rng.range(10, 20);
        pitch1 = pitch0;
        pull = kind === 'approach' ? 0.15 : 0.3;
        win *= 1.3;
        break;
      default:
        break;
    }
    win = clamp(win, 0.6, 2.2);
    tele = clamp(tele, 0.45, 1.2);
    const w0 = t + tele;
    const w1 = w0 + win;
    beats.push({
      i, kind, t0: round3(t), w0: round3(w0), w1: round3(w1),
      yaw0: round3(clamp(yaw0, -60, 60)), yaw1: round3(clamp(yaw1, -60, 60)),
      pitch0: round3(pitch0), pitch1: round3(pitch1), pull: round3(pull),
    });
    prevYaw = yaw1;
    t = w1 + rng.range(0.3, 0.7);
  }
  return beats;
}

function round3(v) { return Math.round(v * 1000) / 1000; }

/** Ideal rod direction at fight-time t inside a beat. */
export function idealAt(beat, t) {
  const u = smoothstep((t - beat.w0) / Math.max(0.001, beat.w1 - beat.w0));
  return { yaw: lerp(beat.yaw0, beat.yaw1, u), pitch: lerp(beat.pitch0, beat.pitch1, u) };
}

/** Angle (deg) between two yaw/pitch directions. */
export function angularError(yawA, pitchA, yawB, pitchB) {
  const ax = Math.cos(pitchA * DEG) * Math.sin(yawA * DEG);
  const ay = Math.sin(pitchA * DEG);
  const az = Math.cos(pitchA * DEG) * Math.cos(yawA * DEG);
  const bx = Math.cos(pitchB * DEG) * Math.sin(yawB * DEG);
  const by = Math.sin(pitchB * DEG);
  const bz = Math.cos(pitchB * DEG) * Math.cos(yawB * DEG);
  const d = clamp(ax * bx + ay * by + az * bz, -1, 1);
  return Math.acos(d) / DEG;
}

/** Rate an angular error with the fight's tolerance multiplier. */
export function rateError(errDeg, tolerance) {
  for (const r of RATINGS) {
    if (errDeg <= r.maxErr * tolerance) return r;
  }
  return RATING_BY_KEY.FAILED;
}

export function initialState(params) {
  return {
    hp: params.hpMax, hpMax: params.hpMax,
    distance: params.startDistance,
    tension: 0.15,
    combo: 0, maxCombo: 0,
    score: 0, perfects: 0,
    counts: { PERFECT: 0, AMAZING: 0, GOOD: 0, NOTGOOD: 0, BAD: 0, FAILED: 0 },
    qualitySum: 0, actions: 0,
    beatIndex: 0,
    done: false, result: null, finishT: null,
  };
}

/** Apply one rated beat to the fight state (mutates and returns the state). */
export function applyBeat(state, beat, rating, params) {
  if (state.done) return state;
  const rod = params.rod;
  const q = rating.q;
  const pullForce = beat.pull * params.power;

  // line tension
  const tensionAdd = pullForce * (1 - 0.8 * q) * (1 - 0.45 * rod.elasticity) * params.tensionMul * 0.75 / (0.4 + rod.strength * 0.9);
  const reelTension = q * rod.reel * 0.08;
  state.tension = state.tension * 0.55 + tensionAdd + reelTension;

  // fish stamina
  const kindMul = beat.kind === 'rest' || beat.kind === 'approach' ? 0.6 : 1;
  const damage = (8 + 14 * q) * q * (0.7 + rod.control * 0.6) * kindMul;
  state.hp = Math.max(0, state.hp - damage);
  const tired = 1 - state.hp / state.hpMax;

  // line distance
  const approachBonus = beat.kind === 'approach' ? 1.6 : 1;
  const reel = q * (1.2 + rod.reel * 2.6) * (1 - 0.3 * rod.elasticity) * (1 + tired * 0.8) * approachBonus;
  const pullOut = pullForce * (1 - q) * (4.5 - rod.control * 2.5) * ((1 - tired) * 0.6 + 0.4);
  state.distance = state.distance + pullOut - reel;
  if (state.hp > 0) state.distance = Math.max(3, state.distance);

  // score
  if (rating.key === 'PERFECT') {
    state.combo++;
    state.perfects++;
  } else {
    state.combo = 0;
  }
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const comboMul = Math.min(GAME.COMBO_MAX, 1 + Math.max(0, state.combo - 1) * GAME.COMBO_STEP);
  state.score += Math.round(rating.points * comboMul);
  state.counts[rating.key]++;
  state.qualitySum += q;
  state.actions++;
  state.beatIndex = beat.i + 1;

  if (state.tension >= 1) {
    state.done = true; state.result = 'snapped'; state.finishT = beat.w1;
  } else if (state.distance > params.maxLine) {
    state.done = true; state.result = 'escaped'; state.finishT = beat.w1;
  } else if (state.distance <= GAME.CATCH_DISTANCE && state.hp <= 0) {
    state.done = true; state.result = 'caught'; state.finishT = beat.w1;
    state.distance = GAME.CATCH_DISTANCE;
  } else if (beat.i >= GAME.MAX_BEATS - 1) {
    state.done = true; state.result = 'escaped'; state.finishT = beat.w1;
  }
  return state;
}

/**
 * Re-simulates a whole fight from an action log. Used by the server (authoritative)
 * and by the client for offline play.
 * actions: [{ i, t, yaw, pitch }] - at most one per beat.
 * Returns { ok, error, state, ratings, meanError, suspicious }
 */
export function evaluateFight(seed, species, weightKg, rod, eventId, actions) {
  const params = fightParams(species, weightKg, rod, eventId);
  const beats = generateBeats(seed, species, weightKg, rod);
  const byBeat = new Map();
  const list = Array.isArray(actions) ? actions : [];
  if (list.length > GAME.MAX_BEATS) return { ok: false, error: 'too_many_actions' };
  for (const a of list) {
    if (!a || typeof a.i !== 'number' || typeof a.t !== 'number' || typeof a.yaw !== 'number' || typeof a.pitch !== 'number') {
      return { ok: false, error: 'malformed_action' };
    }
    if (!isFinite(a.t) || !isFinite(a.yaw) || !isFinite(a.pitch)) return { ok: false, error: 'malformed_action' };
    if (a.i < 0 || a.i >= beats.length || (a.i | 0) !== a.i) return { ok: false, error: 'bad_beat_index' };
    if (byBeat.has(a.i)) return { ok: false, error: 'duplicate_action' };
    const b = beats[a.i];
    if (a.t < b.w0 - 0.05 || a.t > b.w1 + 0.05) return { ok: false, error: 'action_outside_window' };
    if (Math.abs(a.yaw) > 180 || Math.abs(a.pitch) > 90) return { ok: false, error: 'bad_direction' };
    byBeat.set(a.i, a);
  }
  const state = initialState(params);
  const ratings = [];
  let errSum = 0, errN = 0, tinyErr = 0;
  for (const b of beats) {
    const a = byBeat.get(b.i);
    let rating;
    if (a) {
      const ideal = idealAt(b, a.t);
      const err = angularError(a.yaw, a.pitch, ideal.yaw, ideal.pitch);
      rating = rateError(err, params.tolerance);
      errSum += err; errN++;
      if (err < 0.6) tinyErr++;
    } else {
      rating = RATING_BY_KEY.FAILED;
    }
    ratings.push(rating.key);
    applyBeat(state, b, rating, params);
    if (state.done) break;
  }
  // Humans holding a 3DoF controller never hit sub-0.6 degree accuracy every time.
  const suspicious = errN >= 8 && tinyErr / errN > 0.9;
  return { ok: true, state, ratings, meanError: errN ? errSum / errN : null, suspicious, params, lastBeat: beats[state.beatIndex - 1] || null };
}
