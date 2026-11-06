// POST { worldId } -> starts a server-authoritative fishing session.
// The server (not the client) decides species, size, variant and bite delay.
import { serve, json, adminClient, requireUser, HttpError, must } from '../_shared/http.ts';
import { G } from '../_shared/rules.ts';
const { WORLDS_BY_ID, RODS_BY_ID, eventFor, computeLuck, rollCatch, randomSeed, levelFromXp } = G;

serve(async (req, body) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const worldId = String(body.worldId ?? '');
  const world = WORLDS_BY_ID[worldId];
  if (!world) throw new HttpError(400, 'unknown_world');

  const profile = must(
    await admin.from('profiles').select('id, xp, equipped_rod').eq('id', user.id).single(),
    'profile',
  ) as { id: string; xp: number; equipped_rod: string };
  if (levelFromXp(profile.xp) < world.unlockLevel) throw new HttpError(403, 'world_locked');
  const rod = RODS_BY_ID[profile.equipped_rod] ?? RODS_BY_ID.willow_starter;

  // Rate limit: at most 15 casts per minute per player.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from('fishing_sessions').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('started_at', since);
  if ((count ?? 0) >= 15) throw new HttpError(429, 'too_many_casts');

  // Only one active session: abandon previous ones without reward.
  await admin.from('fishing_sessions').update({ status: 'abandoned', completed_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('status', 'active');

  const now = Date.now();
  const event = eventFor(worldId, now);
  const luck = computeLuck(rod, profile.xp);
  const seed = randomSeed() & 0x7fffffff;
  const roll = rollCatch(seed, worldId, luck, event);

  const session = must(
    await admin.from('fishing_sessions').insert({
      user_id: user.id, world_id: worldId, rod_id: rod.id, seed,
      species_id: roll.speciesId, rarity: roll.rarity, length_cm: roll.lengthCm, weight_kg: roll.weightKg,
      variant: roll.variant, bite_delay: roll.biteDelay, event_id: event.id, luck,
    }).select('id, started_at').single(),
    'insert session',
  ) as { id: string; started_at: string };

  return json({
    sessionId: session.id,
    seed,
    speciesId: roll.speciesId,
    rarity: roll.rarity,
    lengthCm: roll.lengthCm,
    weightKg: roll.weightKg,
    variant: roll.variant,
    biteDelay: roll.biteDelay,
    eventId: event.id,
    rodId: rod.id,
    luck,
    serverTime: Date.now(),
  });
});
