// Gameplay definition of each fishing world (visual presets live in the client).
export const WORLDS = [
  { id: 'lake', name: 'Misty Pine Lake', unlockLevel: 1, desc: 'Calm freshwater lake with a wooden dock.' },
  { id: 'river', name: 'Rushing Rapids', unlockLevel: 2, desc: 'Fast river with salmon runs and big sturgeon.' },
  { id: 'ocean', name: 'Saltwind Pier', unlockLevel: 4, desc: 'Coastal pier on the open ocean. Tuna and billfish roam.' },
  { id: 'tropical', name: 'Coral Lagoon', unlockLevel: 6, desc: 'Turquoise tropical lagoon with reef fish and giants.' },
  { id: 'deep', name: 'Abyssal Trench', unlockLevel: 8, desc: 'A boat above a black trench. Things glow down there.' },
];
export const WORLDS_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));

// Global fishing events: deterministic per world per hour, so every player and
// the server agree on which event is active without extra network traffic.
export const EVENTS = {
  none: { id: 'none', name: 'Calm Waters', desc: 'Normal conditions.', biteMul: 1, valueMul: 1, rarityBoost: 0, legendBoost: 0 },
  frenzy: { id: 'frenzy', name: 'Feeding Frenzy', desc: 'Fish bite much faster.', biteMul: 0.5, valueMul: 1, rarityBoost: 0.05, legendBoost: 0 },
  golden: { id: 'golden', name: 'Golden Hour', desc: 'Catches are worth 50% more.', biteMul: 1, valueMul: 1.5, rarityBoost: 0, legendBoost: 0 },
  rare_tide: { id: 'rare_tide', name: 'Rare Tide', desc: 'Rare and epic fish come closer.', biteMul: 1.1, valueMul: 1, rarityBoost: 0.35, legendBoost: 0.2 },
  legend: { id: 'legend', name: 'The Legend Stirs', desc: 'A legendary fish has been sighted.', biteMul: 1.25, valueMul: 1.1, rarityBoost: 0.15, legendBoost: 1.5 },
  storm: { id: 'storm', name: 'Storm Front', desc: 'Big fish are aggressive. Lines strain more.', biteMul: 0.8, valueMul: 1.25, rarityBoost: 0.2, legendBoost: 0.3, tensionMul: 1.15 },
};
