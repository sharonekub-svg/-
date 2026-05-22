import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';

type Body = { orderId: string };

function sumOrderItems(items: Array<{ price_agorot: number | null }> | null, fallbackAgorot: number): number {
  const total = (items ?? []).reduce((sum, item) => sum + Math.max(0, item.price_agorot ?? 0), 0);
  return total > 0 ? total : fallbackAgorot;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const userId = await authedUserId(req);
    const body = await readJson<Body>(req);
    if (!body.orderId) throw httpError(400, 'missing_orderId');

    const { data: order, error } = await admin
      .from('orders')
      .select('*')
      .eq('id', body.orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw httpError(404, 'order_not_found');
    if (order.status !== 'open' && order.status !== 'paying') {
      return json({ order, changed: false });
    }
    if (!order.closes_at) {
      // No-timer order: only the creator can close manually
      if (order.creator_id !== userId) throw httpError(403, 'only_creator_can_close');
    } else if (new Date(order.closes_at).getTime() > Date.now()) {
      throw httpError(409, 'timer_still_open');
    }

    const { count, error: countErr } = await admin
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id);
    if (countErr) throw countErr;
    const participantCount = Math.max(1, count ?? 1);
    const { data: items, error: itemsErr } = await admin
      .from('order_items')
      .select('price_agorot')
      .eq('order_id', order.id);
    if (itemsErr) throw itemsErr;
    const itemsTotal = sumOrderItems(items, order.product_price_agorot);
    const finalAmount = Math.ceil((itemsTotal + (order.estimated_shipping_agorot ?? 0)) / participantCount);

    const { data: locked, error: updateErr } = await admin
      .from('orders')
      .update({
        status: 'locked',
        locked_at: new Date().toISOString(),
        founder_checkout_url: order.founder_checkout_url || order.product_url,
      })
      .eq('id', order.id)
      .select('*')
      .single();
    if (updateErr) throw updateErr;

    const { error: amountErr } = await admin
      .from('participants')
      .update({ amount_agorot: finalAmount })
      .eq('order_id', order.id)
      .eq('status', 'joined');
    if (amountErr) throw amountErr;

    return json({ order: locked, changed: true });
  } catch (e) {
    return errorJson(e);
  }
});
