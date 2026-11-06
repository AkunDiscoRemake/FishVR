// POST { sessionId, strikeT, actions:[{i,t,yaw,pitch}] }
// Re-simulates the whole PERFECT! fight on the server from the action log.
// The client's own opinion of the result is ignored.
import { serve, json, adminClient, requireUser, HttpError, must } from '../_shared/http.ts';
import { G } from '../_shared/rules.ts';
const { SPECIES_BY_ID, RODS_BY_ID, RARITIES, EVENTS, GAME, evaluateFight, fishValue } = G;

serve(async (req, body) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const sessionId = String(body.sessionId ?? '');
  const session = must(
    await admin.from('fishing_sessions').select('*').eq('id', sessionId).eq('user_id', user.id).maybeSingle(),
    'session',
  ) as any;
  if (!session) throw new HttpError(404, 'session_not_found');
  if (session.status !== 'active') throw new HttpError(409, 'session_already_closed');

  const elapsed = (Date.now() - new Date(session.started_at).getTime()) / 1000;
  const species = SPECIES_BY_ID[session.species_id];
  const rod = RODS_BY_ID[session.rod_id];
  const weight = Number(session.weight_kg);
  const biteDelay = Number(session.bite_delay);
  const event = EVENTS[session.event_id] ?? EVENTS.none;

  const close = async (status: string, result: Record<string, unknown>, value = 0, xp = 0, score = 0, perfects = 0) => {
    const out = must(await admin.rpc('fn_complete_catch', {
      p_session: session.id, p_status: status, p_result: result,
      p_value: value, p_xp: xp, p_score: score, p_perfects: perfects,
    }), 'complete') as any;
    return json({ ...out, total_xp: out.xp, status, ...result, value, xp });
  };

  if (elapsed > GAME.SESSION_TTL_SEC) return close('expired', { reason: 'session_expired' });

  const strikeT = typeof body.strikeT === 'number' ? body.strikeT : null;
  if (strikeT === null || strikeT < 0 || strikeT > GAME.STRIKE_WINDOW + 0.05) {
    if (elapsed < biteDelay - GAME.TIME_TOLERANCE) return close('abandoned', { reason: 'reeled_in_early' });
    return close('missed', { reason: 'no_strike' });
  }

  const actions = Array.isArray(body.actions) ? body.actions : [];
  const ev = evaluateFight(Number(session.seed), species, weight, rod, session.event_id, actions);
  if (!ev.ok) return close('rejected', { reason: ev.error });

  const st = ev.state;
  // Fight clock starts after bite + strike window. Nobody can finish faster than real time.
  const lastT = Math.max(st.finishT ?? 0, ...actions.map((a: any) => a.t));
  const required = biteDelay + GAME.STRIKE_WINDOW + lastT - GAME.TIME_TOLERANCE;
  if (elapsed < required) return close('rejected', { reason: 'too_fast', elapsed, required });
  if (ev.suspicious) return close('rejected', { reason: 'suspicious_precision' });

  const summary = {
    ratings: ev.ratings, counts: st.counts, score: st.score, perfects: st.perfects,
    maxCombo: st.maxCombo, finishT: st.finishT, meanError: ev.meanError,
  };
  if (st.result !== 'caught') {
    const xp = Math.round(st.perfects * 2);
    return close(st.result ?? 'escaped', summary, 0, xp, st.score, st.perfects);
  }
  const avgQ = st.actions ? st.qualitySum / st.actions : 0;
  const value = fishValue(species, weight, session.variant, avgQ, event);
  const xp = RARITIES[species.rarity].xp + st.perfects * 2;
  return close('caught', summary, value, xp, st.score, st.perfects);
});
