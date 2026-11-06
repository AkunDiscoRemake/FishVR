// PvP fishing duels. All authority lives here: room lifecycle, shared fish,
// result validation (full fight re-simulation) and winner determination.
//
// POST { action, ... }
//  create  { name?, isPrivate?, worldId?, maxPlayers? }
//  join    { roomId? , code? }
//  leave   { roomId }
//  ready   { roomId, ready }
//  start   { roomId }                 (host only)
//  submit  { roomId, actions }        (fight log, t relative to starts_at)
//  finalize{ roomId }
//  invite  { roomId, toUser }
//  respond { inviteId, accept }
import { serve, json, adminClient, requireUser, HttpError, must } from '../_shared/http.ts';
import { G } from '../_shared/rules.ts';
const { SPECIES, SPECIES_BY_ID, WORLDS_BY_ID, PVP_ROD, GAME, evaluateFight, weightForLength, createRng, randomSeed } = G;
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Room = Record<string, any>;

async function getRoom(admin: SupabaseClient, id: string): Promise<Room> {
  const room = must(await admin.from('pvp_rooms').select('*').eq('id', id).maybeSingle(), 'room') as Room | null;
  if (!room) throw new HttpError(404, 'room_not_found');
  return room;
}

async function participants(admin: SupabaseClient, roomId: string) {
  return must(await admin.from('pvp_participants').select('*').eq('room_id', roomId), 'participants') as any[];
}

async function username(admin: SupabaseClient, uid: string): Promise<string> {
  const p = must(await admin.from('profiles').select('username').eq('id', uid).single(), 'profile') as any;
  return p.username;
}

async function leaveLobbies(admin: SupabaseClient, uid: string, exceptRoom?: string) {
  const rows = must(await admin.from('pvp_participants').select('room_id, pvp_rooms!inner(status, host_id)')
    .eq('user_id', uid).eq('pvp_rooms.status', 'lobby'), 'mine') as any[];
  for (const r of rows) {
    if (r.room_id === exceptRoom) continue;
    await doLeave(admin, uid, r.room_id);
  }
}

async function doLeave(admin: SupabaseClient, uid: string, roomId: string) {
  const room = await getRoom(admin, roomId);
  if (room.status === 'lobby') {
    await admin.from('pvp_participants').delete().eq('room_id', roomId).eq('user_id', uid);
    const rest = await participants(admin, roomId);
    if (!rest.length) {
      await admin.from('pvp_rooms').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', roomId);
    } else if (room.host_id === uid) {
      await admin.from('pvp_rooms').update({ host_id: rest[0].user_id }).eq('id', roomId);
    }
  } else if (room.status === 'active') {
    // leaving a running duel = forfeit
    await admin.from('pvp_participants').update({
      submitted: true, result: 'forfeit', valid: false, submitted_at: new Date().toISOString(),
    }).eq('room_id', roomId).eq('user_id', uid).eq('submitted', false);
    await maybeFinalize(admin, roomId, false);
  }
}

function newCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/** Decide winner & placements once everyone submitted or time ran out. */
async function maybeFinalize(admin: SupabaseClient, roomId: string, force: boolean) {
  const room = await getRoom(admin, roomId);
  if (room.status !== 'active') return room;
  const parts = await participants(admin, roomId);
  const timeUp = room.ends_at && Date.now() > new Date(room.ends_at).getTime() + 10_000;
  const allIn = parts.every((p) => p.submitted);
  if (!allIn && !(force && timeUp)) return room;

  if (timeUp) {
    for (const p of parts.filter((x) => !x.submitted)) {
      await admin.from('pvp_participants').update({ submitted: true, result: 'timeout', valid: false })
        .eq('room_id', roomId).eq('user_id', p.user_id);
      p.submitted = true; p.result = 'timeout'; p.valid = false;
    }
  }
  const qualified = parts.filter((p) => p.valid && p.result === 'caught' && p.score >= room.min_score)
    .sort((a, b) => Number(a.finish_t) - Number(b.finish_t) || b.score - a.score);
  const rest = parts.filter((p) => qualified.indexOf(p) < 0).sort((a, b) => (b.valid ? 1 : 0) - (a.valid ? 1 : 0) || b.score - a.score);
  const ordered = [...qualified, ...rest];
  const placements = ordered.map((p, i) => ({ user_id: p.user_id, placement: i + 1 }));
  const winner = qualified.length ? qualified[0].user_id : null;
  must(await admin.rpc('fn_pvp_finalize', { p_room: roomId, p_winner: winner, p_prize: room.prize, p_placements: placements }), 'finalize');
  return await getRoom(admin, roomId);
}

serve(async (req, body) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const action = String(body.action ?? '');
  const now = Date.now();

  switch (action) {
    case 'create': {
      await leaveLobbies(admin, user.id);
      const worldId = WORLDS_BY_ID[body.worldId] ? body.worldId : 'lake';
      const maxPlayers = Math.max(2, Math.min(8, Number(body.maxPlayers) || 4));
      const name = String(body.name ?? 'Fishing Duel').replace(/[^\w !?.-]/g, '').slice(0, 32) || 'Fishing Duel';
      let room: Room | null = null;
      for (let i = 0; i < 6 && !room; i++) {
        const res = await admin.from('pvp_rooms').insert({
          code: newCode(), name, host_id: user.id, is_private: !!body.isPrivate, max_players: maxPlayers,
          world_id: worldId, min_score: GAME.PVP_MIN_SCORE,
        }).select('*').single();
        if (!res.error) room = res.data;
      }
      if (!room) throw new HttpError(500, 'could_not_create_room');
      must(await admin.from('pvp_participants').insert({
        room_id: room.id, user_id: user.id, username: await username(admin, user.id), ready: true,
      }), 'join host');
      return json({ ok: true, room, serverTime: Date.now() });
    }

    case 'join': {
      let room: Room | null = null;
      if (body.code) {
        room = must(await admin.from('pvp_rooms').select('*').eq('code', String(body.code)).in('status', ['lobby']).maybeSingle(), 'room') as Room | null;
      } else if (body.roomId) {
        room = await getRoom(admin, String(body.roomId));
        if (room.is_private) {
          const inv = must(await admin.from('pvp_invites').select('id').eq('room_id', room.id).eq('to_user', user.id).limit(1), 'inv') as any[];
          if (!inv.length) throw new HttpError(403, 'private_room');
        }
      }
      if (!room) throw new HttpError(404, 'room_not_found');
      if (room.status !== 'lobby') throw new HttpError(409, 'room_not_open');
      const parts = await participants(admin, room.id);
      if (parts.some((p) => p.user_id === user.id)) return json({ ok: true, room, serverTime: Date.now() });
      if (parts.length >= room.max_players) throw new HttpError(409, 'room_full');
      await leaveLobbies(admin, user.id, room.id);
      must(await admin.from('pvp_participants').insert({
        room_id: room.id, user_id: user.id, username: await username(admin, user.id),
      }), 'join');
      return json({ ok: true, room, serverTime: Date.now() });
    }

    case 'leave': {
      await doLeave(admin, user.id, String(body.roomId));
      return json({ ok: true });
    }

    case 'ready': {
      const room = await getRoom(admin, String(body.roomId));
      if (room.status !== 'lobby') throw new HttpError(409, 'room_not_open');
      must(await admin.from('pvp_participants').update({ ready: !!body.ready })
        .eq('room_id', room.id).eq('user_id', user.id), 'ready');
      return json({ ok: true });
    }

    case 'start': {
      const room = await getRoom(admin, String(body.roomId));
      if (room.host_id !== user.id) throw new HttpError(403, 'only_host_can_start');
      if (room.status !== 'lobby') throw new HttpError(409, 'room_not_open');
      const parts = await participants(admin, room.id);
      if (parts.length < 2) throw new HttpError(409, 'need_two_players');
      if (parts.some((p) => !p.ready && p.user_id !== room.host_id)) throw new HttpError(409, 'players_not_ready');

      // Every competitor fights the same fish (same seed, species, weight): equal difficulty.
      const seed = randomSeed() & 0x7fffffff;
      const rng = createRng(seed);
      const pool = SPECIES.filter((s: any) => s.worlds.indexOf(room.world_id) >= 0 && (s.rarity === 'U' || s.rarity === 'R'));
      const species = rng.pick(pool);
      const len = Math.round((species.lenMin + (species.lenMax - species.lenMin) * rng.range(0.45, 0.75)) * 10) / 10;
      const weight = Math.round(weightForLength(species, len) * 1000) / 1000;
      const startsAt = new Date(now + GAME.PVP_COUNTDOWN_SEC * 1000);
      const endsAt = new Date(startsAt.getTime() + GAME.PVP_MAX_DURATION_SEC * 1000);
      const updated = must(await admin.from('pvp_rooms').update({
        status: 'active', seed, species_id: species.id, weight_kg: weight, length_cm: len,
        starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      }).eq('id', room.id).eq('status', 'lobby').select('*').single(), 'start') as Room;
      await admin.from('pvp_invites').update({ status: 'expired' }).eq('room_id', room.id).eq('status', 'pending');
      return json({ ok: true, room: updated, serverTime: Date.now() });
    }

    case 'submit': {
      const room = await getRoom(admin, String(body.roomId));
      if (room.status !== 'active') throw new HttpError(409, 'room_not_active');
      const me = must(await admin.from('pvp_participants').select('*').eq('room_id', room.id).eq('user_id', user.id).maybeSingle(), 'me') as any;
      if (!me) throw new HttpError(403, 'not_in_room');
      if (me.submitted) throw new HttpError(409, 'already_submitted');
      const elapsed = (now - new Date(room.starts_at).getTime()) / 1000;
      const actions = Array.isArray(body.actions) ? body.actions : [];
      const species = SPECIES_BY_ID[room.species_id];
      const ev = evaluateFight(Number(room.seed), species, Number(room.weight_kg), PVP_ROD, 'none', actions);
      let patch: Record<string, unknown>;
      if (!ev.ok) {
        patch = { result: 'rejected', valid: false, score: 0 };
      } else {
        const st = ev.state;
        const lastT = Math.max(st.finishT ?? 0, ...actions.map((a: any) => a.t));
        const tooFast = elapsed < lastT - GAME.TIME_TOLERANCE;
        const valid = !tooFast && !ev.suspicious;
        patch = {
          result: valid ? st.result ?? 'escaped' : 'rejected', valid, score: st.score, perfects: st.perfects,
          finish_t: st.finishT,
        };
      }
      must(await admin.from('pvp_participants').update({ ...patch, submitted: true, submitted_at: new Date().toISOString() })
        .eq('room_id', room.id).eq('user_id', user.id), 'submit');
      const after = await maybeFinalize(admin, room.id, false);
      return json({ ok: true, ...patch, room: after });
    }

    case 'finalize': {
      const room = await getRoom(admin, String(body.roomId));
      const parts = await participants(admin, room.id);
      if (!parts.some((p) => p.user_id === user.id)) throw new HttpError(403, 'not_in_room');
      const after = await maybeFinalize(admin, room.id, true);
      return json({ ok: true, room: after });
    }

    case 'invite': {
      const room = await getRoom(admin, String(body.roomId));
      if (room.status !== 'lobby') throw new HttpError(409, 'room_not_open');
      const parts = await participants(admin, room.id);
      if (!parts.some((p) => p.user_id === user.id)) throw new HttpError(403, 'not_in_room');
      const to = String(body.toUser ?? '');
      if (to === user.id) throw new HttpError(400, 'cannot_invite_self');
      const target = must(await admin.from('profiles').select('id').eq('id', to).maybeSingle(), 'target');
      if (!target) throw new HttpError(404, 'player_not_found');
      const recent = must(await admin.from('pvp_invites').select('id').eq('room_id', room.id).eq('to_user', to).eq('status', 'pending'), 'dupe') as any[];
      if (recent.length) return json({ ok: true, duplicate: true });
      must(await admin.from('pvp_invites').insert({
        room_id: room.id, from_user: user.id, from_username: await username(admin, user.id), to_user: to,
      }), 'invite');
      return json({ ok: true });
    }

    case 'respond': {
      const inv = must(await admin.from('pvp_invites').select('*').eq('id', String(body.inviteId)).eq('to_user', user.id).maybeSingle(), 'invite') as any;
      if (!inv) throw new HttpError(404, 'invite_not_found');
      if (inv.status !== 'pending') throw new HttpError(409, 'invite_closed');
      await admin.from('pvp_invites').update({ status: body.accept ? 'accepted' : 'declined' }).eq('id', inv.id);
      if (!body.accept) return json({ ok: true });
      const room = await getRoom(admin, inv.room_id);
      if (room.status !== 'lobby') throw new HttpError(409, 'room_not_open');
      const parts = await participants(admin, room.id);
      if (parts.length >= room.max_players) throw new HttpError(409, 'room_full');
      await leaveLobbies(admin, user.id, room.id);
      if (!parts.some((p) => p.user_id === user.id)) {
        must(await admin.from('pvp_participants').insert({ room_id: room.id, user_id: user.id, username: await username(admin, user.id) }), 'join');
      }
      return json({ ok: true, room, serverTime: Date.now() });
    }

    case 'time':
      return json({ serverTime: Date.now() });

    default:
      throw new HttpError(400, 'unknown_action');
  }
});
