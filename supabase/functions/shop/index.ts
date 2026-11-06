// POST { action: 'buy' | 'equip' | 'sell' | 'sell_all', rodId?, ids? }
// Prices come from the shared catalogue on the server, never from the client.
import { serve, json, adminClient, requireUser, HttpError, must } from '../_shared/http.ts';
import { G } from '../_shared/rules.ts';
const { RODS_BY_ID } = G;

serve(async (req, body) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const action = String(body.action ?? '');

  if (action === 'buy') {
    const rod = RODS_BY_ID[String(body.rodId)];
    if (!rod || rod.hidden || rod.price === null) throw new HttpError(400, 'unknown_rod');
    const out = must(await admin.rpc('fn_purchase_rod', { p_user: user.id, p_rod: rod.id, p_price: rod.price }), 'buy');
    return json({ ok: true, rodId: rod.id, ...(out as object) });
  }
  if (action === 'equip') {
    const rod = RODS_BY_ID[String(body.rodId)];
    if (!rod || rod.hidden) throw new HttpError(400, 'unknown_rod');
    const out = must(await admin.rpc('fn_equip_rod', { p_user: user.id, p_rod: rod.id }), 'equip');
    return json({ ok: true, ...(out as object) });
  }
  if (action === 'sell' || action === 'sell_all') {
    let ids: string[] = [];
    if (action === 'sell_all') {
      const rows = must(await admin.from('fish_inventory').select('id').eq('user_id', user.id).eq('sold', false), 'inv') as { id: string }[];
      ids = rows.map((r) => r.id);
    } else {
      ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 500);
    }
    if (!ids.length) return json({ ok: true, earned: 0, count: 0 });
    const out = must(await admin.rpc('fn_sell_fish', { p_user: user.id, p_ids: ids }), 'sell');
    return json({ ok: true, ...(out as object) });
  }
  throw new HttpError(400, 'unknown_action');
});
