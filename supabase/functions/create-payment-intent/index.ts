import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';
import { CONNECTED_ACCOUNT_ID, stripe } from '../_shared/stripe.ts';
import { idempotencyKeyFrom } from '../_shared/idempotency.ts';

type Body = { orderId: string; idempotency_key?: string };

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
    const idemp = idempotencyKeyFrom(body, req);

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('*')
      .eq('id', body.orderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw httpError(404, 'order_not_found');
    if (!['locked', 'escrow'].includes(order.status)) {
      throw httpError(409, 'order_not_payable');
    }

    const { data: participant, error: partErr } = await admin
      .from('participants')
      .select('*')
      .eq('order_id', order.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (partErr) throw partErr;
    if (!participant) throw httpError(403, 'not_a_participant');
    if (participant.status === 'paid') throw httpError(409, 'already_paid');

    const [{ data: participants, error: participantsErr }, { data: items, error: itemsErr }] = await Promise.all([
      admin
        .from('participants')
        .select('id, status')
        .eq('order_id', order.id)
        .in('status', ['joined', 'paid']),
      admin
        .from('order_items')
        .select('price_agorot')
        .eq('order_id', order.id),
    ]);
    if (participantsErr) throw participantsErr;
    if (itemsErr) throw itemsErr;

    const participantCount = Math.max(1, participants?.length ?? 1);
    const itemsTotalAgorot = sumOrderItems(items, order.product_price_agorot);
    const serverAmountAgorot = Math.ceil((itemsTotalAgorot + (order.estimated_shipping_agorot ?? 0)) / participantCount);
    if (!Number.isInteger(serverAmountAgorot) || serverAmountAgorot <= 0) {
      throw httpError(409, 'invalid_server_amount');
    }

    if (participant.amount_agorot !== serverAmountAgorot) {
      const { error: rebalanceErr } = await admin
        .from('participants')
        .update({ amount_agorot: serverAmountAgorot })
        .eq('order_id', order.id)
        .eq('status', 'joined');
      if (rebalanceErr) throw rebalanceErr;
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name, phone')
      .eq('id', userId)
      .maybeSingle();

    // Create / look up a Stripe customer for this user.
    let customerId: string | undefined = undefined;
    const existing = await stripe.customers.search({
      query: `metadata['shakana_user_id']:'${userId}'`,
      limit: 1,
    });
    if (existing.data[0]) {
      customerId = existing.data[0].id;
    } else {
      const cust = await stripe.customers.create(
        {
          name: profile ? `${profile.first_name} ${profile.last_name}` : undefined,
          phone: profile?.phone,
          metadata: { shakana_user_id: userId },
        },
        { idempotencyKey: `cust_${userId}` },
      );
      customerId = cust.id;
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2024-06-20' },
    );

    // Reuse existing uncaptured PI to prevent double-charge on retries.
    const REUSABLE_STATUSES = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'];
    if (participant.stripe_payment_intent_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(participant.stripe_payment_intent_id);
        if (REUSABLE_STATUSES.includes(existingPi.status)) {
          return json({
            clientSecret: existingPi.client_secret,
            ephemeralKey: ephemeralKey.secret,
            customer: customerId,
            publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '',
          });
        }
      } catch {
        // PI not found or invalid — fall through to create a new one.
      }
    }

    const pi = await stripe.paymentIntents.create(
      {
        amount: serverAmountAgorot,
        currency: 'ils',
        customer: customerId,
        capture_method: 'manual',
        transfer_group: order.stripe_transfer_group ?? `order_${order.id}`,
        metadata: {
          order_id: order.id,
          participant_id: participant.id,
          user_id: userId,
        },
        automatic_payment_methods: { enabled: true },
        ...(CONNECTED_ACCOUNT_ID
          ? { on_behalf_of: CONNECTED_ACCOUNT_ID }
          : {}),
      },
      { idempotencyKey: `pi_${participant.id}_${idemp}` },
    );

    await admin
      .from('participants')
      .update({ stripe_payment_intent_id: pi.id })
      .eq('id', participant.id);

    return json({
      clientSecret: pi.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId,
      publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '',
    });
  } catch (e) {
    return errorJson(e);
  }
});
