// Core tunables shared by client and server.

export const RATINGS = [
  // key, label, max angular error (deg, before tolerance scaling), points, quality(0..1), color
  { key: 'PERFECT', label: 'PERFECT!', maxErr: 5, points: 100, q: 1.0, color: '#ffd23f' },
  { key: 'AMAZING', label: 'Amazing!', maxErr: 10, points: 70, q: 0.8, color: '#5cf2ff' },
  { key: 'GOOD', label: 'Good!', maxErr: 17, points: 40, q: 0.55, color: '#7dff6a' },
  { key: 'NOTGOOD', label: 'Not very good.', maxErr: 26, points: 15, q: 0.3, color: '#d9d9d9' },
  { key: 'BAD', label: 'BAD!', maxErr: 38, points: 5, q: 0.12, color: '#ff8c3a' },
  { key: 'FAILED', label: 'Failed!', maxErr: Infinity, points: 0, q: 0, color: '#ff3a3a' },
];
export const RATING_BY_KEY = Object.fromEntries(RATINGS.map((r) => [r.key, r]));

export const RARITIES = {
  C: { key: 'C', name: 'Common', weight: 62, color: '#c8c8c8', xp: 10, difficulty: 0.0 },
  U: { key: 'U', name: 'Uncommon', weight: 24, color: '#5ddc5d', xp: 20, difficulty: 0.08 },
  R: { key: 'R', name: 'Rare', weight: 9.5, color: '#4aa8ff', xp: 45, difficulty: 0.16 },
  E: { key: 'E', name: 'Epic', weight: 3.6, color: '#c46bff', xp: 110, difficulty: 0.26 },
  L: { key: 'L', name: 'Legendary', weight: 0.9, color: '#ffb020', xp: 400, difficulty: 0.38 },
};

export const GAME = {
  STARTING_COINS: 250,
  STARTER_ROD: 'willow_starter',
  STRIKE_WINDOW: 1.1, // seconds to set the hook after a bite
  MAX_BEATS: 90,
  COMBO_STEP: 0.1, // +10% per consecutive PERFECT
  COMBO_MAX: 2.0,
  CATCH_DISTANCE: 1.6, // metres: fish landed
  SESSION_TTL_SEC: 900, // a fishing session expires after 15 min
  TIME_TOLERANCE: 1.25, // seconds of clock slack accepted by the server
  PVP_MIN_SCORE: 600, // minimum score to win a duel
  PVP_COUNTDOWN_SEC: 6,
  PVP_MAX_DURATION_SEC: 150,
};

export function levelFromXp(xp) {
  // level n requires 100 * n^1.6 cumulative xp
  let lvl = 1;
  while (xp >= Math.floor(100 * Math.pow(lvl, 1.6))) lvl++;
  return lvl;
}
