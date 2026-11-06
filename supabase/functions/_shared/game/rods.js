// Rod catalogue. Every rod trades something away: there is no "best" rod.
// Stats are 0..1. Prices are validated by the server (shop Edge Function).
//
// precision  -> widens the angular tolerance of the PERFECT! system
// strength   -> how much line tension the rod/line survives before snapping
// control    -> damage dealt to fish stamina per good action / resists fish pulls
// elasticity -> absorbs tension spikes, but wastes some reeling energy
// stability  -> longer action windows and less tip sway
// reel       -> line recovered per good action, but adds tension when reeling hard
export const RODS = [
  {
    id: 'willow_starter', name: 'Willow Starter', price: 0, tier: 1,
    desc: 'A forgiving hand-me-down. Soft and stable, but weak and slow.',
    stats: { precision: 0.45, strength: 0.35, control: 0.4, elasticity: 0.7, stability: 0.65, reel: 0.35 },
    maxLine: 60, luck: 0.0, castPower: 0.7,
    look: { blank: 0x7a5a32, wrap: 0x2a5a2a, grip: 'cork', reel: 0x8a8a8a, length: 1.9, guides: 5 },
  },
  {
    id: 'reed_featherlight', name: 'Reed Featherlight', price: 650, tier: 2,
    desc: 'Ultralight fly rod. Superb precision and feel, snaps under heavy fish.',
    stats: { precision: 0.85, strength: 0.22, control: 0.45, elasticity: 0.8, stability: 0.55, reel: 0.4 },
    maxLine: 55, luck: 0.02, castPower: 0.75,
    look: { blank: 0x3a6a4a, wrap: 0xd0b060, grip: 'cork', reel: 0xc0a050, length: 2.4, guides: 7 },
  },
  {
    id: 'ironbull_heavy', name: 'Iron Bull Heavy', price: 900, tier: 2,
    desc: 'Pure stopping power. Barely bends, terrible feedback, slow reel.',
    stats: { precision: 0.3, strength: 0.9, control: 0.8, elasticity: 0.15, stability: 0.5, reel: 0.3 },
    maxLine: 80, luck: 0.0, castPower: 0.85,
    look: { blank: 0x2a2a2a, wrap: 0xb02a2a, grip: 'eva', reel: 0x3a3a3a, length: 1.8, guides: 5 },
  },
  {
    id: 'carbon_sprint', name: 'Carbon Sprint', price: 1200, tier: 2,
    desc: 'Lightning reel and quick action, but nervous and twitchy in hand.',
    stats: { precision: 0.6, strength: 0.45, control: 0.5, elasticity: 0.35, stability: 0.25, reel: 0.9 },
    maxLine: 65, luck: 0.0, castPower: 0.95,
    look: { blank: 0x1a1a22, wrap: 0x2ad0ff, grip: 'eva', reel: 0x2a2a3a, length: 2.1, guides: 6 },
  },
  {
    id: 'lucky_bamboo', name: 'Lucky Bamboo', price: 1500, tier: 2,
    desc: 'Hand-split bamboo with a jade charm. Rare fish seem drawn to it.',
    stats: { precision: 0.5, strength: 0.4, control: 0.45, elasticity: 0.6, stability: 0.55, reel: 0.45 },
    maxLine: 60, luck: 0.18, castPower: 0.75,
    look: { blank: 0xc8a860, wrap: 0x2a8a4a, grip: 'cork', reel: 0x2a8a4a, length: 2.2, guides: 6, nodes: true },
  },
  {
    id: 'glass_noodle', name: 'Glass Noodle', price: 1800, tier: 3,
    desc: 'Fibreglass that bends double. Almost impossible to snap, hard to steer.',
    stats: { precision: 0.5, strength: 0.6, control: 0.3, elasticity: 1.0, stability: 0.6, reel: 0.5 },
    maxLine: 70, luck: 0.0, castPower: 0.8,
    look: { blank: 0xe8d050, wrap: 0x2a2a2a, grip: 'eva', reel: 0x5a5a5a, length: 2.0, guides: 6 },
  },
  {
    id: 'seamaster_troller', name: 'SeaMaster Troller', price: 2600, tier: 3,
    desc: 'Offshore stand-up rod. Strong and steady, but imprecise and stiff.',
    stats: { precision: 0.4, strength: 0.85, control: 0.7, elasticity: 0.35, stability: 0.85, reel: 0.55 },
    maxLine: 120, luck: 0.02, castPower: 0.9,
    look: { blank: 0x1a3a7a, wrap: 0xf0f0f0, grip: 'eva', reel: 0xd0d0d8, length: 1.75, guides: 6, big: true },
  },
  {
    id: 'hunter_graphite', name: 'Hunter Graphite', price: 3400, tier: 3,
    desc: 'Tournament bass rod. Great precision and control, modest backbone.',
    stats: { precision: 0.78, strength: 0.5, control: 0.75, elasticity: 0.45, stability: 0.65, reel: 0.65 },
    maxLine: 70, luck: 0.03, castPower: 0.9,
    look: { blank: 0x4a2a1a, wrap: 0xe0a030, grip: 'cork', reel: 0x8a5a2a, length: 2.1, guides: 7 },
  },
  {
    id: 'coral_whip', name: 'Coral Whip', price: 4200, tier: 4,
    desc: 'Tropical spinning rod with a fast tip. Fantastic reel, fragile against brutes.',
    stats: { precision: 0.72, strength: 0.4, control: 0.6, elasticity: 0.55, stability: 0.45, reel: 0.95 },
    maxLine: 75, luck: 0.06, castPower: 1.0,
    look: { blank: 0xe86a5a, wrap: 0x2ad0c0, grip: 'eva', reel: 0xf0f0f0, length: 2.2, guides: 7 },
  },
  {
    id: 'abyss_spear', name: 'Abyss Spear', price: 6500, tier: 4,
    desc: 'Deep-drop rod with miles of line. Heavy, slow, unshakeable.',
    stats: { precision: 0.55, strength: 0.95, control: 0.75, elasticity: 0.3, stability: 0.9, reel: 0.35 },
    maxLine: 160, luck: 0.05, castPower: 0.8,
    look: { blank: 0x2a1a4a, wrap: 0x8a4aff, grip: 'eva', reel: 0x4a2a8a, length: 1.7, guides: 6, big: true, glow: 0x8a4aff },
  },
  {
    id: 'zephyr_pro', name: 'Zephyr Pro X', price: 9000, tier: 5,
    desc: 'Featherweight competition blank. Peak precision and stability; light line.',
    stats: { precision: 1.0, strength: 0.42, control: 0.7, elasticity: 0.5, stability: 0.95, reel: 0.7 },
    maxLine: 70, luck: 0.06, castPower: 0.95,
    look: { blank: 0xf0f0f4, wrap: 0x1a6aff, grip: 'carbon', reel: 0xe0e0e8, length: 2.3, guides: 8 },
  },
  {
    id: 'leviathan', name: 'Leviathan', price: 15000, tier: 5,
    desc: 'Built for monsters. Colossal strength and control; slow and hard to aim.',
    stats: { precision: 0.32, strength: 1.0, control: 0.9, elasticity: 0.25, stability: 0.55, reel: 0.4 },
    maxLine: 200, luck: 0.08, castPower: 1.0,
    look: { blank: 0x1a1a1a, wrap: 0xffb020, grip: 'carbon', reel: 0xffb020, length: 1.9, guides: 7, big: true, glow: 0xffb020 },
  },
  {
    id: 'golden_fortune', name: 'Golden Fortune', price: 22000, tier: 5,
    desc: 'Gilded collector rod. Huge luck, mediocre everything else.',
    stats: { precision: 0.55, strength: 0.55, control: 0.5, elasticity: 0.55, stability: 0.55, reel: 0.55 },
    maxLine: 90, luck: 0.35, castPower: 0.85,
    look: { blank: 0xe0b030, wrap: 0xf8f0d0, grip: 'carbon', reel: 0xf0c040, length: 2.1, guides: 7, glow: 0xffd040 },
  },
];

export const RODS_BY_ID = Object.fromEntries(RODS.map((r) => [r.id, r]));

// Standardised rod used by everybody in PvP duels so only skill decides.
export const PVP_ROD = {
  id: 'tournament_standard', name: 'Tournament Standard', price: null, tier: 0, hidden: true,
  desc: 'Regulation duel rod. Identical for every competitor.',
  stats: { precision: 0.6, strength: 0.6, control: 0.6, elasticity: 0.55, stability: 0.6, reel: 0.6 },
  maxLine: 90, luck: 0, castPower: 0.9,
  look: { blank: 0xf0f0f0, wrap: 0xff3a3a, grip: 'eva', reel: 0xd0d0d0, length: 2.0, guides: 6 },
};
RODS_BY_ID[PVP_ROD.id] = PVP_ROD;
