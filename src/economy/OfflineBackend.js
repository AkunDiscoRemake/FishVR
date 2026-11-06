// Offline single-player backend. Uses exactly the same shared rules as the server
// (rollCatch / evaluateFight / fishValue). Progress is stored on this device only and is
// never sent to the global ranking.
import {
  RODS_BY_ID, SPECIES_BY_ID, RARITIES, GAME, EVENTS, WORLDS_BY_ID,
  eventFor, computeLuck, rollCatch, evaluateFight, fishValue, randomSeed, levelFromXp,
} from '@game/index.js';

const KEY = 'pfvr.offline.v1';

function blank() {
  return {
    id: 'offline', username: 'Angler', coins: GAME.STARTING_COINS, xp: 0, equippedRod: GAME.STARTER_ROD,
    ownedRods: [GAME.STARTER_ROD], discoveries: {}, inventory: [],
    stats: { totalCatches: 0, totalPerfects: 0, bestScore: 0, totalScore: 0, legendary: 0, pvpWins: 0, pvpLosses: 0 },
  };
}

export class OfflineBackend {
  constructor() {
    this.online = false;
    this.kind = 'offline';
    this.sessions = new Map();
    this.data = blank();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = Object.assign(blank(), JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }
  async init() { return this.profile; }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  get profile() {
    const d = this.data;
    return {
      id: d.id, username: d.username, coins: d.coins, xp: d.xp, level: levelFromXp(d.xp),
      equippedRod: d.equippedRod, ownedRods: new Set(d.ownedRods), discoveries: d.discoveries,
      inventory: d.inventory, stats: d.stats,
    };
  }

  async refresh() { return this.profile; }

  async startFishing(worldId) {
    const world = WORLDS_BY_ID[worldId];
    if (levelFromXp(this.data.xp) < world.unlockLevel) throw new Error('world_locked');
    const rod = RODS_BY_ID[this.data.equippedRod];
    const ev = eventFor(worldId, Date.now());
    const luck = computeLuck(rod, this.data.xp);
    const seed = randomSeed() & 0x7fffffff;
    const roll = rollCatch(seed, worldId, luck, ev);
    const sessionId = 'local-' + seed + '-' + Date.now();
    const s = Object.assign({ sessionId, seed, worldId, rodId: rod.id, eventId: ev.id, luck, startedAt: Date.now() }, roll);
    this.sessions.clear();
    this.sessions.set(sessionId, s);
    return s;
  }

  async completeFishing(sessionId, strikeT, actions) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error('session_not_found');
    this.sessions.delete(sessionId);
    if (strikeT === null || strikeT === undefined) return { status: 'missed', value: 0, xp: 0 };
    const species = SPECIES_BY_ID[s.speciesId];
    const rod = RODS_BY_ID[s.rodId];
    const ev = evaluateFight(s.seed, species, s.weightKg, rod, s.eventId, actions);
    if (!ev.ok) return { status: 'rejected', reason: ev.error, value: 0, xp: 0 };
    const st = ev.state;
    const d = this.data;
    const res = { status: st.result, score: st.score, perfects: st.perfects, counts: st.counts, maxCombo: st.maxCombo, value: 0, xp: 0 };
    d.stats.totalPerfects += st.perfects;
    if (st.result === 'caught') {
      const avgQ = st.actions ? st.qualitySum / st.actions : 0;
      res.value = fishValue(species, s.weightKg, s.variant, avgQ, EVENTS[s.eventId]);
      res.xp = RARITIES[species.rarity].xp + st.perfects * 2;
      const prev = d.discoveries[species.id];
      res.new_discovery = !prev;
      d.discoveries[species.id] = {
        count: (prev ? prev.count : 0) + 1,
        bestWeight: Math.max(prev ? prev.bestWeight : 0, s.weightKg),
        bestLength: Math.max(prev ? prev.bestLength : 0, s.lengthCm),
        bestScore: Math.max(prev ? prev.bestScore : 0, st.score),
        first: prev ? prev.first : Date.now(),
      };
      const item = { id: sessionId, speciesId: species.id, rarity: species.rarity, worldId: s.worldId, weightKg: s.weightKg, lengthCm: s.lengthCm, variant: s.variant, value: res.value, score: st.score, perfects: st.perfects, caughtAt: Date.now() };
      d.inventory.unshift(item);
      res.inventory_id = item.id;
      d.stats.totalCatches++;
      d.stats.totalScore += st.score;
      d.stats.bestScore = Math.max(d.stats.bestScore, st.score);
      if (species.rarity === 'L') d.stats.legendary++;
    } else {
      res.xp = st.perfects * 2;
    }
    d.xp += res.xp;
    res.level = levelFromXp(d.xp);
    res.coins = d.coins;
    this._save();
    return res;
  }

  async buyRod(rodId) {
    const rod = RODS_BY_ID[rodId];
    const d = this.data;
    if (!rod || rod.hidden) throw new Error('unknown_rod');
    if (d.ownedRods.indexOf(rodId) >= 0) throw new Error('already_owned');
    if (d.coins < rod.price) throw new Error('not_enough_coins');
    d.coins -= rod.price;
    d.ownedRods.push(rodId);
    this._save();
    return { coins: d.coins };
  }

  async equipRod(rodId) {
    if (this.data.ownedRods.indexOf(rodId) < 0) throw new Error('not_owned');
    this.data.equippedRod = rodId;
    this._save();
    return { equipped_rod: rodId };
  }

  async sellFish(ids) {
    const d = this.data;
    let earned = 0, count = 0;
    d.inventory = d.inventory.filter((f) => {
      if (ids.indexOf(f.id) >= 0) { earned += f.value; count++; return false; }
      return true;
    });
    d.coins += earned;
    this._save();
    return { earned, count, coins: d.coins };
  }

  async sellAll() { return this.sellFish(this.data.inventory.map((f) => f.id)); }

  async setUsername(name) { this.data.username = name; this._save(); }

  async leaderboard() {
    const d = this.data;
    return [{ username: d.username + ' (this device)', level: levelFromXp(d.xp), coins: d.coins, total_catches: d.stats.totalCatches, total_score: d.stats.totalScore, legendary_catches: d.stats.legendary, pvp_wins: 0, best_score: d.stats.bestScore }];
  }
}
