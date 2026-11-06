// In-memory stand-in for the subset of supabase-js used by our Edge Functions.
// Lets `deno test` exercise the real function handlers without a Supabase stack.
// RPCs mirror supabase/migrations/*_functions.sql (verified separately on PostgreSQL).
// deno-lint-ignore-file no-explicit-any
type Row = Record<string, any>;
export const db: Record<string, Row[]> = {
  profiles: [], player_rods: [], fishing_sessions: [], fish_inventory: [], fish_discoveries: [],
  pvp_rooms: [], pvp_participants: [], pvp_invites: [],
};
export function resetDb() { for (const k of Object.keys(db)) db[k] = []; }

const DEFAULTS: Record<string, () => Row> = {
  fishing_sessions: () => ({ id: crypto.randomUUID(), status: 'active', started_at: new Date().toISOString(), result: null }),
  fish_inventory: () => ({ id: crypto.randomUUID(), sold: false, caught_at: new Date().toISOString() }),
  pvp_rooms: () => ({ id: crypto.randomUUID(), status: 'lobby', created_at: new Date().toISOString(), winner_id: null, prize: 150, min_score: 600, is_private: false, max_players: 4 }),
  pvp_participants: () => ({ ready: false, submitted: false, score: 0, perfects: 0, result: null, valid: null, placement: null, joined_at: new Date().toISOString() }),
  pvp_invites: () => ({ id: crypto.randomUUID(), status: 'pending', created_at: new Date().toISOString() }),
};
const FK: Record<string, string> = { pvp_rooms: 'room_id' };

function get(row: Row, path: string) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), row); }

class Query {
  table: string; op = 'select'; filters: ((r: Row) => boolean)[] = []; payload: any = null;
  cols = '*'; countOpt = false; head = false; pick = 0; ord: [string, boolean] | null = null; lim = 0; returning = false;
  constructor(t: string) { this.table = t; }
  select(cols = '*', opts: any = {}) { if (this.op === 'select') this.cols = cols; else this.returning = true; this.countOpt = !!opts.count; this.head = !!opts.head; return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filters.push((r) => get(r, c) === v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => get(r, c) >= v); return this; }
  in(c: string, v: any[]) { this.filters.push((r) => v.includes(get(r, c))); return this; }
  order(c: string, o: any = {}) { this.ord = [c, o.ascending !== false]; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.pick = 1; return this; }
  single() { this.pick = 2; return this; }
  then(res: any, rej: any) { try { res(this.exec()); } catch (e) { rej(e); } }
  exec() {
    const T = db[this.table];
    if (this.op === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => ({ ...(DEFAULTS[this.table] ? DEFAULTS[this.table]() : {}), ...p }));
      if (this.table === 'pvp_rooms' && rows.some((r: Row) => T.some((x) => x.code === r.code))) return { data: null, error: { message: 'duplicate code' } };
      T.push(...rows);
      return this.finish(rows.map((r: Row) => ({ ...r })));
    }
    // embedded inner joins:  "room_id, pvp_rooms!inner(status, host_id)"
    let rows = T.map((r) => {
      const out = { ...r };
      const m = this.cols.match(/(\w+)!inner\(/);
      if (m) { const ref = db[m[1]].find((x) => x.id === r[FK[m[1]]]); if (!ref) return null; out[m[1]] = { ...ref }; }
      return out;
    }).filter(Boolean) as Row[];
    const idx = T.filter((_, i) => true);
    rows = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') {
      const ids = new Set(rows.map((r) => JSON.stringify([r.id, r.room_id, r.user_id])));
      const changed: Row[] = [];
      for (const r of T) if (ids.has(JSON.stringify([r.id, r.room_id, r.user_id])) && this.filters.every((f) => f(r))) { Object.assign(r, this.payload); changed.push({ ...r }); }
      return this.finish(changed);
    }
    if (this.op === 'delete') {
      db[this.table] = T.filter((r) => !this.filters.every((f) => f(r)));
      return { data: null, error: null };
    }
    void idx;
    if (this.ord) { const [c, asc] = this.ord; rows.sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
    if (this.lim) rows = rows.slice(0, this.lim);
    if (this.countOpt && this.head) return { data: null, count: rows.length, error: null };
    return this.finish(rows);
  }
  finish(rows: Row[]) {
    if (this.pick === 2) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'expected 1 row, got ' + rows.length } };
    if (this.pick === 1) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}

function prof(id: string) { const p = db.profiles.find((x) => x.id === id); if (!p) throw new Error('profile_not_found'); return p; }
const level = (xp: number) => { let l = 1; while (xp >= Math.floor(100 * Math.pow(l, 1.6))) l++; return l; };

const RPC: Record<string, (a: any) => any> = {
  fn_complete_catch(a) {
    const s = db.fishing_sessions.find((x) => x.id === a.p_session);
    if (!s) throw new Error('session_not_found');
    if (s.status !== 'active') throw new Error('session_already_closed');
    Object.assign(s, { status: a.p_status, result: a.p_result, completed_at: new Date().toISOString() });
    const p = prof(s.user_id);
    let inv = null, isNew = false;
    p.xp += Math.max(0, a.p_xp); p.level = level(p.xp); p.total_perfects += a.p_perfects;
    if (a.p_status === 'caught') {
      inv = crypto.randomUUID();
      db.fish_inventory.push({ id: inv, user_id: s.user_id, species_id: s.species_id, rarity: s.rarity, world_id: s.world_id, length_cm: s.length_cm, weight_kg: s.weight_kg, variant: s.variant, score: a.p_score, perfects: a.p_perfects, value: a.p_value, sold: false });
      isNew = !db.fish_discoveries.some((d) => d.user_id === s.user_id && d.species_id === s.species_id);
      if (isNew) db.fish_discoveries.push({ user_id: s.user_id, species_id: s.species_id, catch_count: 1 });
      p.total_catches++;
    }
    return { inventory_id: inv, new_discovery: isNew, coins: p.coins, xp: p.xp, level: p.level };
  },
  fn_purchase_rod(a) {
    if (db.player_rods.some((r) => r.user_id === a.p_user && r.rod_id === a.p_rod)) throw new Error('already_owned');
    const p = prof(a.p_user);
    if (p.coins < a.p_price) throw new Error('not_enough_coins');
    p.coins -= a.p_price; db.player_rods.push({ user_id: a.p_user, rod_id: a.p_rod });
    return { coins: p.coins };
  },
  fn_equip_rod(a) {
    if (!db.player_rods.some((r) => r.user_id === a.p_user && r.rod_id === a.p_rod)) throw new Error('not_owned');
    prof(a.p_user).equipped_rod = a.p_rod; return { equipped_rod: a.p_rod };
  },
  fn_sell_fish(a) {
    let earned = 0, count = 0;
    for (const f of db.fish_inventory) if (f.user_id === a.p_user && a.p_ids.includes(f.id) && !f.sold) { f.sold = true; earned += f.value; count++; }
    const p = prof(a.p_user); p.coins += earned; return { earned, count, coins: p.coins };
  },
  fn_pvp_finalize(a) {
    const r = db.pvp_rooms.find((x) => x.id === a.p_room) as Row;
    if (r.status === 'finished') return { already: true };
    for (const it of a.p_placements) { const pp = db.pvp_participants.find((x) => x.room_id === a.p_room && x.user_id === it.user_id); if (pp) pp.placement = it.placement; }
    Object.assign(r, { status: 'finished', winner_id: a.p_winner });
    for (const pp of db.pvp_participants.filter((x) => x.room_id === a.p_room)) {
      const p = prof(pp.user_id);
      if (pp.user_id === a.p_winner) { p.pvp_wins++; p.coins += a.p_prize; } else p.pvp_losses++;
    }
    return { winner_id: a.p_winner };
  },
};

export function createClient(_url: string, _key: string, _opts?: any) {
  return {
    from: (t: string) => new Query(t),
    rpc: async (name: string, args: any) => { try { return { data: RPC[name](args), error: null }; } catch (e) { return { data: null, error: { message: (e as Error).message } }; } },
    auth: {
      getUser: async (token: string) => token.startsWith('user:') ? { data: { user: { id: token.slice(5) } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } },
    },
  };
}
export type SupabaseClient = ReturnType<typeof createClient>;
export type User = { id: string };
