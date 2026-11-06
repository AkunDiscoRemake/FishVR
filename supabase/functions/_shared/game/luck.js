// Luck & spawn system. Luck shifts probabilities, it never guarantees anything.
import { createRng, hashString, clamp } from './rng.js';
import { RARITIES, levelFromXp } from './constants.js';
import { SPECIES, weightForLength } from './species.js';
import { EVENTS } from './worlds.js';

const RARITY_LUCK_FACTOR = { C: -0.55, U: 0.45, R: 1.4, E: 2.3, L: 3.2 };
const EVENT_SLOT_MS = 30 * 60 * 1000; // a new event roll every 30 minutes

/** Deterministic world event for a given wall-clock time (ms). */
export function eventFor(worldId, timeMs) {
  const slot = Math.floor(timeMs / EVENT_SLOT_MS);
  const rng = createRng(hashString(worldId + ':event:' + slot));
  const r = rng.next();
  let id = 'none';
  if (r < 0.5) id = 'none';
  else if (r < 0.66) id = 'frenzy';
  else if (r < 0.79) id = 'golden';
  else if (r < 0.9) id = 'rare_tide';
  else if (r < 0.97) id = 'storm';
  else id = 'legend';
  const slotEnd = (slot + 1) * EVENT_SLOT_MS;
  return { ...EVENTS[id], endsAt: slotEnd };
}

/** Total luck (0..~0.6) from rod, player level and charms. */
export function computeLuck(rod, xp) {
  const level = levelFromXp(xp || 0);
  return clamp((rod ? rod.luck : 0) + Math.min(0.15, (level - 1) * 0.0125), 0, 0.6);
}

/** Probability table for a world (used by the UI to show odds). */
export function rarityOdds(worldId, luck, event) {
  const ev = event || EVENTS.none;
  const pool = SPECIES.filter((s) => s.worlds.indexOf(worldId) >= 0);
  const present = new Set(pool.map((s) => s.rarity));
  const weights = {};
  let total = 0;
  for (const key of Object.keys(RARITIES)) {
    if (!present.has(key)) continue;
    let w = RARITIES[key].weight * Math.max(0.25, 1 + luck * RARITY_LUCK_FACTOR[key]);
    if (key !== 'C') w *= 1 + ev.rarityBoost * (key === 'U' ? 0.5 : 1);
    if (key === 'L') w *= 1 + ev.legendBoost;
    weights[key] = w;
    total += w;
  }
  for (const k of Object.keys(weights)) weights[k] /= total;
  return weights;
}

/**
 * Server-authoritative roll of what bites. `seed` must come from a secure source
 * on the server (or local RNG in offline mode).
 */
export function rollCatch(seed, worldId, luck, event) {
  const rng = createRng(seed ^ 0x5eed1234);
  const ev = event || EVENTS.none;
  const odds = rarityOdds(worldId, luck, ev);
  const rarity = rng.weighted(Object.keys(odds), (k) => odds[k]);
  const pool = SPECIES.filter((s) => s.worlds.indexOf(worldId) >= 0 && s.rarity === rarity);
  const species = rng.pick(pool);

  // Size: big fish are rarer; luck nudges the curve but never guarantees a trophy.
  const exponent = 1.7 - luck * 0.6;
  let t = Math.pow(rng.next(), exponent);
  let variant = 'normal';
  if (rng.chance(0.03 + luck * 0.05)) { t = 0.92 + rng.next() * 0.08; variant = 'trophy'; }
  if (rng.chance(0.004 + luck * 0.01)) variant = 'shiny';
  const lengthCm = Math.round((species.lenMin + (species.lenMax - species.lenMin) * t) * 10) / 10;
  const weightKg = Math.round(weightForLength(species, lengthCm) * 1000) / 1000;

  const rarityWait = { C: 0, U: 1, R: 2.5, E: 4, L: 6 }[rarity];
  const biteDelay = Math.round((3 + rng.next() * 7 + rarityWait) * ev.biteMul * 100) / 100;
  return { speciesId: species.id, rarity, lengthCm, weightKg, variant, biteDelay };
}

/** Coin value of a caught fish. avgQuality is 0..1 (mean PERFECT-system quality). */
export function fishValue(species, weightKg, variant, avgQuality, event) {
  const ev = event || EVENTS.none;
  const sizeMul = Math.pow(Math.max(0.05, weightKg / species.avgWeight), 0.85);
  const variantMul = variant === 'shiny' ? 3 : variant === 'trophy' ? 1.5 : 1;
  const skillMul = 0.75 + 0.5 * clamp(avgQuality, 0, 1);
  return Math.max(1, Math.round(species.baseValue * sizeMul * variantMul * skillMul * ev.valueMul));
}
