import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES, SPECIES_BY_ID, RODS, RODS_BY_ID, PVP_ROD, generateBeats, idealAt, evaluateFight,
  rollCatch, createRng, fishValue, eventFor, rateError, RATINGS,
} from '../supabase/functions/_shared/game/index.js';

// Simulated player: aims at the ideal direction with gaussian noise (deg).
function play(seed, species, weight, rod, noise, missRate = 0) {
  const beats = generateBeats(seed, species, weight, rod);
  const rng = createRng(seed + 99);
  const actions = [];
  for (const b of beats) {
    if (rng.chance(missRate)) continue;
    const t = b.w0 + (b.w1 - b.w0) * rng.range(0.2, 0.8);
    const id = idealAt(b, t);
    actions.push({ i: b.i, t, yaw: id.yaw + rng.gauss() * noise, pitch: id.pitch + rng.gauss() * noise });
  }
  return evaluateFight(seed, species, weight, rod, 'none', actions);
}

test('more than 100 unique species', () => {
  assert.ok(SPECIES.length > 100);
  assert.equal(new Set(SPECIES.map((s) => s.id)).size, SPECIES.length);
});

test('fight is deterministic', () => {
  const s = SPECIES_BY_ID.largemouth_bass;
  const a = play(42, s, 2, RODS[0], 6);
  const b = play(42, s, 2, RODS[0], 6);
  assert.deepEqual(a.state, b.state);
});

test('skilled player usually lands common fish with starter rod', () => {
  let caught = 0;
  for (let i = 0; i < 50; i++) {
    const c = rollCatch(1000 + i, 'lake', 0, null);
    const s = SPECIES_BY_ID[c.speciesId];
    const r = play(1000 + i, s, c.weightKg, RODS_BY_ID.willow_starter, 5);
    if (r.state.result === 'caught') caught++;
  }
  assert.ok(caught >= 30, 'caught ' + caught);
});

test('idle player never lands a fish', () => {
  const s = SPECIES_BY_ID.rainbow_trout;
  const r = evaluateFight(7, s, 2, RODS[0], 'none', []);
  assert.notEqual(r.state.result, 'caught');
});

test('rejects actions outside of windows and duplicates', () => {
  const s = SPECIES_BY_ID.rainbow_trout;
  const beats = generateBeats(5, s, 2, RODS[0]);
  assert.equal(evaluateFight(5, s, 2, RODS[0], 'none', [{ i: 0, t: beats[0].w1 + 1, yaw: 0, pitch: 0 }]).error, 'action_outside_window');
  const a = { i: 0, t: beats[0].w0 + 0.1, yaw: 0, pitch: 0 };
  assert.equal(evaluateFight(5, s, 2, RODS[0], 'none', [a, a]).error, 'duplicate_action');
});

test('perfect aimbot is flagged', () => {
  const s = SPECIES_BY_ID.blue_marlin;
  const r = play(77, s, 300, PVP_ROD, 0);
  assert.ok(r.state.actions >= 8);
  assert.equal(r.suspicious, true);
});

test('ratings ordered', () => {
  assert.equal(rateError(1, 1).key, 'PERFECT');
  assert.equal(rateError(9, 1).key, 'AMAZING');
  assert.equal(rateError(100, 1).key, 'FAILED');
  assert.equal(RATINGS.length, 6);
});

test('value and events are sane', () => {
  const s = SPECIES_BY_ID.blue_marlin;
  assert.ok(fishValue(s, s.avgWeight, 'normal', 1, null) > 1000);
  assert.ok(eventFor('lake', Date.now()).id);
});
