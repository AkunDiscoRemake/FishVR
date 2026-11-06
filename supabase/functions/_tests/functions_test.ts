// Integration tests of the real Edge Function handlers (run: see README in this folder).
// deno-lint-ignore-file no-explicit-any
import { db, resetDb } from './mock_supabase.ts';
import { G } from '../_shared/rules.ts';

const handlers: Record<string, (req: Request) => Promise<Response>> = {};
let current = '';
Object.defineProperty(Deno, 'serve', { value: (h: any) => { handlers[current] = h; }, configurable: true, writable: true });
Deno.env.set('SUPABASE_URL', 'http://mock');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'mock-service-role');
for (const name of ['fishing-start', 'fishing-complete', 'shop', 'pvp']) {
  current = name;
  await import(`../${name}/index.ts`);
}

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

async function call(fn: string, uid: string | null, body: any) {
  const req = new Request('http://x/' + fn, {
    method: 'POST', body: JSON.stringify(body),
    headers: (uid ? { 'content-type': 'application/json', Authorization: 'Bearer user:' + uid } : { 'content-type': 'application/json' }) as Record<string, string>,
  });
  const res = await handlers[fn](req);
  return { status: res.status, body: await res.json() };
}

function seed() {
  resetDb();
  for (const [id, name] of [[A, 'Alice'], [B, 'Bob']]) {
    db.profiles.push({ id, username: name, coins: 250, xp: 0, level: 1, equipped_rod: 'willow_starter', total_catches: 0, total_perfects: 0, pvp_wins: 0, pvp_losses: 0 });
    db.player_rods.push({ user_id: id, rod_id: 'willow_starter' });
  }
}

/** Plays a fight like a decent human (gaussian aim noise, deg). */
function playFight(seed: number, species: any, weight: number, rod: any, noise = 4) {
  const beats = G.generateBeats(seed, species, weight, rod);
  const rng = G.createRng(seed + 7);
  const actions: any[] = [];
  const params = G.fightParams(species, weight, rod, 'none');
  const st = G.initialState(params);
  for (const b of beats) {
    const t = b.w0 + (b.w1 - b.w0) * rng.range(0.25, 0.75);
    const id = G.idealAt(b, t);
    const a = { i: b.i, t: Math.round(t * 1000) / 1000, yaw: id.yaw + rng.gauss() * noise, pitch: id.pitch + rng.gauss() * noise };
    actions.push(a);
    G.applyBeat(st, b, G.rateError(G.angularError(a.yaw, a.pitch, id.yaw, id.pitch), params.tolerance), params);
    if (st.done) break;
  }
  return { actions, st };
}

function assert(c: any, msg: string) { if (!c) throw new Error('assertion failed: ' + msg); }

Deno.test('rejects unauthenticated calls', async () => {
  seed();
  const r = await call('fishing-start', null, { worldId: 'lake' });
  assert(r.status === 401, 'status ' + r.status);
});

Deno.test('world lock is enforced by the server', async () => {
  seed();
  const r = await call('fishing-start', A, { worldId: 'deep' });
  assert(r.status === 403 && r.body.error === 'world_locked', JSON.stringify(r));
});

Deno.test('fishing: instant completion is rejected as too fast', async () => {
  seed();
  const s = (await call('fishing-start', A, { worldId: 'lake' })).body;
  const species = G.SPECIES_BY_ID[s.speciesId];
  const { actions } = playFight(s.seed, species, s.weightKg, G.RODS_BY_ID[s.rodId]);
  const r = await call('fishing-complete', A, { sessionId: s.sessionId, strikeT: 0.4, actions });
  assert(r.body.status === 'rejected' && r.body.reason === 'too_fast', JSON.stringify(r.body));
  assert(db.fish_inventory.length === 0, 'no fish granted');
});

Deno.test('fishing: a real-time fight is re-simulated and rewarded', async () => {
  seed();
  let caught = 0;
  for (let k = 0; k < 6; k++) {
    const s = (await call('fishing-start', A, { worldId: 'lake' })).body;
    const species = G.SPECIES_BY_ID[s.speciesId];
    const { actions, st } = playFight(s.seed, species, s.weightKg, G.RODS_BY_ID[s.rodId]);
    // pretend the fight took the real amount of time
    db.fishing_sessions.find((x) => x.id === s.sessionId)!.started_at = new Date(Date.now() - 600_000).toISOString();
    const r = await call('fishing-complete', A, { sessionId: s.sessionId, strikeT: 0.5, actions });
    assert(r.body.status === st.result, 'server agrees with client sim: ' + r.body.status + ' vs ' + st.result);
    assert(r.body.score === st.score, 'score matches');
    if (r.body.status === 'caught') { caught++; assert(r.body.value > 0 && r.body.inventory_id, 'value + inventory'); }
    const again = await call('fishing-complete', A, { sessionId: s.sessionId, strikeT: 0.5, actions });
    assert(again.status === 409, 'cannot complete twice');
  }
  assert(caught >= 3, 'caught ' + caught);
  assert(db.fish_inventory.length === caught, 'inventory rows');
  assert(db.profiles[0].total_catches === caught, 'stats');
});

Deno.test('fishing: forged log (fake perfect claims / bad windows) does not pay', async () => {
  seed();
  const s = (await call('fishing-start', A, { worldId: 'lake' })).body;
  db.fishing_sessions[0].started_at = new Date(Date.now() - 600_000).toISOString();
  const r = await call('fishing-complete', A, { sessionId: s.sessionId, strikeT: 0.5, actions: [{ i: 0, t: 0, yaw: 0, pitch: 0 }] });
  assert(r.body.status === 'rejected' && r.body.reason === 'action_outside_window', JSON.stringify(r.body));
  const s2 = (await call('fishing-start', A, { worldId: 'lake' })).body;
  db.fishing_sessions.find((x) => x.id === s2.sessionId)!.started_at = new Date(Date.now() - 600_000).toISOString();
  const r2 = await call('fishing-complete', A, { sessionId: s2.sessionId, strikeT: 0.5, actions: [] });
  assert(r2.body.status !== 'caught', 'idle player cannot catch');
});

Deno.test('fishing: aimbot precision is rejected', async () => {
  seed();
  db.profiles[0].xp = 100000;
  const s = (await call('fishing-start', A, { worldId: 'ocean' })).body;
  const species = G.SPECIES_BY_ID[s.speciesId];
  const { actions } = playFight(s.seed, species, s.weightKg, G.RODS_BY_ID[s.rodId], 0);
  db.fishing_sessions[0].started_at = new Date(Date.now() - 600_000).toISOString();
  const r = await call('fishing-complete', A, { sessionId: s.sessionId, strikeT: 0.5, actions });
  if (actions.length >= 8) assert(r.body.status === 'rejected' && r.body.reason === 'suspicious_precision', JSON.stringify(r.body));
});

Deno.test('shop: server prices, ownership and selling', async () => {
  seed();
  let r = await call('shop', A, { action: 'buy', rodId: 'zephyr_pro' });
  assert(r.body.error === 'not_enough_coins', JSON.stringify(r.body));
  r = await call('shop', A, { action: 'buy', rodId: 'tournament_standard' });
  assert(r.body.error === 'unknown_rod', 'hidden rod not for sale');
  r = await call('shop', A, { action: 'equip', rodId: 'leviathan' });
  assert(r.body.error === 'not_owned', JSON.stringify(r.body));
  db.fish_inventory.push({ id: 'f1', user_id: A, value: 500, sold: false }, { id: 'f2', user_id: B, value: 999, sold: false });
  r = await call('shop', A, { action: 'sell', ids: ['f1', 'f2'] });
  assert(r.body.earned === 500, 'only own fish sold: ' + JSON.stringify(r.body));
  r = await call('shop', A, { action: 'buy', rodId: 'reed_featherlight' });
  assert(r.body.ok && r.body.coins === 100, JSON.stringify(r.body));
  r = await call('shop', A, { action: 'equip', rodId: 'reed_featherlight' });
  assert(r.body.ok && db.profiles[0].equipped_rod === 'reed_featherlight', 'equipped');
});

Deno.test('pvp: full duel lifecycle with server-decided winner', async () => {
  seed();
  const room = (await call('pvp', A, { action: 'create', isPrivate: true, worldId: 'lake' })).body.room;
  assert(room.code && room.code.length === 6, 'code');
  let r = await call('pvp', B, { action: 'join', roomId: room.id });
  assert(r.body.error === 'private_room', 'private needs code or invite: ' + JSON.stringify(r.body));
  r = await call('pvp', B, { action: 'join', code: room.code });
  assert(r.body.ok, 'join by code');
  r = await call('pvp', A, { action: 'start', roomId: room.id });
  assert(r.body.error === 'players_not_ready', 'ready check');
  r = await call('pvp', B, { action: 'start', roomId: room.id });
  assert(r.body.error === 'only_host_can_start', 'host only');
  await call('pvp', B, { action: 'ready', roomId: room.id, ready: true });
  r = await call('pvp', A, { action: 'start', roomId: room.id });
  assert(r.body.ok && r.body.room.status === 'active', JSON.stringify(r.body));
  const live = r.body.room;
  const species = G.SPECIES_BY_ID[live.species_id];
  // both players fight the SAME fish: A plays well, B plays badly
  const good = playFight(Number(live.seed), species, Number(live.weight_kg), G.PVP_ROD, 4);
  const bad = playFight(Number(live.seed), species, Number(live.weight_kg), G.PVP_ROD, 20);
  // too early (countdown not over) -> rejected
  r = await call('pvp', A, { action: 'submit', roomId: room.id, actions: good.actions });
  assert(r.body.result === 'rejected' && r.body.valid === false, 'early submit rejected: ' + JSON.stringify(r.body));
  // reset A's submission and move the clock forward
  Object.assign(db.pvp_participants.find((p) => p.user_id === A)!, { submitted: false, result: null, valid: null });
  db.pvp_rooms[0].starts_at = new Date(Date.now() - 300_000).toISOString();
  r = await call('pvp', A, { action: 'submit', roomId: room.id, actions: good.actions });
  assert(r.body.valid === true && r.body.score === good.st.score, JSON.stringify(r.body));
  r = await call('pvp', B, { action: 'submit', roomId: room.id, actions: bad.actions });
  assert(r.body.room.status === 'finished', 'finalized when all submitted');
  const expectWinner = good.st.result === 'caught' && good.st.score >= 600 ? A : (bad.st.result === 'caught' && bad.st.score >= 600 ? B : null);
  assert(db.pvp_rooms[0].winner_id === expectWinner, 'winner ' + db.pvp_rooms[0].winner_id + ' expected ' + expectWinner);
  if (expectWinner === A) assert(db.profiles[0].pvp_wins === 1 && db.profiles[1].pvp_losses === 1 && db.profiles[0].coins === 400, 'stats + prize');
});

Deno.test('pvp: invites let a player into a private room', async () => {
  seed();
  const room = (await call('pvp', A, { action: 'create', isPrivate: true })).body.room;
  let r = await call('pvp', A, { action: 'invite', roomId: room.id, toUser: B });
  assert(r.body.ok, 'invite');
  const inv = db.pvp_invites[0];
  r = await call('pvp', B, { action: 'respond', inviteId: inv.id, accept: true });
  assert(r.body.ok && db.pvp_participants.length === 2, 'accepted');
  r = await call('pvp', B, { action: 'leave', roomId: room.id });
  assert(db.pvp_participants.length === 1, 'left');
  r = await call('pvp', A, { action: 'leave', roomId: room.id });
  assert(db.pvp_rooms[0].status === 'cancelled', 'empty room cancelled');
});
