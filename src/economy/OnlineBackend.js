// Online backend: every economy-changing action goes through Edge Functions, which
// re-validate everything server-side. Reads come straight from tables protected by RLS.
import { supabase, invoke } from '../supabase/client.js';
import { levelFromXp } from '@game/index.js';

export class OnlineBackend {
  constructor(user) {
    this.online = true;
    this.kind = 'online';
    this.user = user;
    this.p = null;
  }

  async init() { await this.refresh(); return this.profile; }

  get profile() { return this.p; }

  async refresh() {
    const uid = this.user.id;
    const [prof, rods, disc, inv] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('player_rods').select('rod_id').eq('user_id', uid),
      supabase.from('fish_discoveries').select('*').eq('user_id', uid),
      supabase.from('fish_inventory').select('*').eq('user_id', uid).eq('sold', false).order('caught_at', { ascending: false }).limit(300),
    ]);
    if (prof.error) throw prof.error;
    const r = prof.data;
    const discoveries = {};
    for (const d of disc.data || []) {
      discoveries[d.species_id] = { count: d.catch_count, bestWeight: Number(d.best_weight_kg), bestLength: Number(d.best_length_cm), bestScore: d.best_score, first: d.first_caught_at };
    }
    this.p = {
      id: r.id, username: r.username, coins: r.coins, xp: r.xp, level: levelFromXp(r.xp), equippedRod: r.equipped_rod,
      ownedRods: new Set((rods.data || []).map((x) => x.rod_id)),
      discoveries,
      inventory: (inv.data || []).map((f) => ({
        id: f.id, speciesId: f.species_id, rarity: f.rarity, worldId: f.world_id, weightKg: Number(f.weight_kg), lengthCm: Number(f.length_cm),
        variant: f.variant, value: f.value, score: f.score, perfects: f.perfects, caughtAt: f.caught_at,
      })),
      stats: {
        totalCatches: r.total_catches, totalPerfects: r.total_perfects, bestScore: r.best_score, totalScore: Number(r.total_score),
        legendary: r.legendary_catches, pvpWins: r.pvp_wins, pvpLosses: r.pvp_losses,
      },
    };
    return this.p;
  }

  async startFishing(worldId) {
    const t0 = Date.now();
    const res = await invoke('fishing-start', { worldId });
    res.latency = Date.now() - t0;
    return res;
  }

  async completeFishing(sessionId, strikeT, actions) {
    const res = await invoke('fishing-complete', { sessionId, strikeT, actions });
    await this.refresh().catch(() => {});
    return res;
  }

  async buyRod(rodId) { const r = await invoke('shop', { action: 'buy', rodId }); await this.refresh(); return r; }
  async equipRod(rodId) { const r = await invoke('shop', { action: 'equip', rodId }); await this.refresh(); return r; }
  async sellFish(ids) { const r = await invoke('shop', { action: 'sell', ids }); await this.refresh(); return r; }
  async sellAll() { const r = await invoke('shop', { action: 'sell_all' }); await this.refresh(); return r; }

  async setUsername(name) {
    const { error } = await supabase.from('profiles').update({ username: name }).eq('id', this.user.id);
    if (error) throw error;
    await this.refresh();
  }

  async leaderboard(kind) {
    const col = { score: 'total_score', coins: 'coins', catches: 'total_catches', legendary: 'legendary_catches', wins: 'pvp_wins' }[kind] || 'total_score';
    const { data, error } = await supabase.from('leaderboard').select('*').order(col, { ascending: false }).limit(15);
    if (error) throw error;
    return data;
  }

  async matchHistory() {
    const { data, error } = await supabase.from('match_history').select('*').eq('user_id', this.user.id).order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    return data;
  }
}
