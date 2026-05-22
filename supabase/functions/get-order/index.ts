import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';

type Body = {
  orderId: string;
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const userId = await authedUserId(req);
    const { orderId } = await readJson<Body>(req);

    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      throw httpError(400, 'invalid_order_id');
    }

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) throw httpError(404, 'order_not_found');

    const { data: participants, error: participantsErr } = await admin
      .from('participants')
      .select('*')
      .eq('order_id', orderId)
      .order('joined_at', { ascending: true });

    if (participantsErr) throw participantsErr;

    const canRead =
      order.creator_id === userId ||
      (participants ?? []).some((participant) => participant.user_id === userId);

    if (!canRead) throw httpError(403, 'not_order_member');

    const { data: items, error: itemsErr } = await admin
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsErr) throw itemsErr;

    return json({
      order,
      participants: participants ?? [],
      items: items ?? [],
    });
  } catch (e) {
    return errorJson(e);
  }
});
