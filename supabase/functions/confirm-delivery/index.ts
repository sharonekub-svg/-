import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';
import { CONNECTED_ACCOUNT_ID, stripe } from '../_shared/stripe.ts';

type Body = { orderId: string; idempotency_key?: string };

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
      .select('id, status, max_participants, stripe_transfer_group, shipping_status')
      .eq('id', body.orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw httpError(404, 'order_not_found');

    const { data: me, error: meErr } = await admin
      .from('participants')
      .select('id, status, delivered_to_user_at, received_confirmed_at')
      .eq('order_id', order.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (meErr) throw meErr;
    if (!me) throw httpError(403, 'not_order_participant');
    if (order.status === 'completed') return json({ ok: true, completed: true });
    if (order.status !== 'delivered' || order.shipping_status !== 'ready_for_distribution') {
      throw httpError(409, 'order_not_ready_for_receipt_confirmation');
    }
    if (me.status !== 'paid') throw httpError(409, 'participant_not_paid');
    if (!me.delivered_to_user_at) throw httpError(409, 'item_not_marked_delivered_to_user');

    if (!me.received_confirmed_at) {
      const { error: updateErr } = await admin
        .from('participants')
        .update({ received_confirmed_at: new Date().toISOString() })
        .eq('id', me.id);
      if (updateErr) throw updateErr;
    }

    const { data: participants, error: pErr } = await admin
      .from('participants')
      .select('id, status, amount_agorot, stripe_payment_intent_id, delivered_to_user_at, received_confirmed_at')
      .eq('order_id', order.id);
    if (pErr) throw pErr;

    const paidParticipants = (participants ?? []).filter((p) => p.status === 'paid');
    const allPaid = paidParticipants.length >= order.max_participants;
    const allDelivered = paidParticipants.every((p) => Boolean(p.delivered_to_user_at));
    const allReceived = paidParticipants.every((p) =>
      p.id === me.id ? true : Boolean(p.received_confirmed_at),
    );

    if (!allPaid || !allDelivered || !allReceived) {
      return json({ ok: true, completed: false });
    }

    for (const p of paidParticipants) {
      if (!p.stripe_payment_intent_id) continue;
      await stripe.paymentIntents.capture(p.stripe_payment_intent_id, undefined, {
        idempotencyKey: `capture_${p.id}`,
      });
      if (CONNECTED_ACCOUNT_ID) {
        await stripe.transfers.create(
          {
            amount: p.amount_agorot,
            currency: 'ils',
            destination: CONNECTED_ACCOUNT_ID,
            transfer_group: order.stripe_transfer_group ?? `order_${order.id}`,
            metadata: { order_id: order.id, participant_id: p.id },
          },
          { idempotencyKey: `xfer_${p.id}` },
        );
      }
    }

    await admin
      .from('orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return json({ ok: true, completed: true });
  } catch (e) {
    return errorJson(e);
  }
});
