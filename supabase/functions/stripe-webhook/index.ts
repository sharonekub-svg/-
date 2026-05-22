import { admin } from '../_shared/supabaseAdmin.ts';
import { STRIPE_WEBHOOK_SECRET, stripe } from '../_shared/stripe.ts';

// No CORS (Stripe POSTs directly). No JWT verification — set per-function
// in config.toml (`verify_jwt = false`). Signature is the only auth.

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('missing signature', { status: 400 });

  const raw = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('invalid stripe signature', err);
    return new Response('invalid signature', { status: 400 });
  }

  // Idempotency: refuse to process an event twice.
  const { data: existing } = await admin
    .from('webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();
  if (existing) return new Response('already_processed', { status: 200 });

  try {
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated':
      case 'payment_intent.succeeded':
        await handlePaid(event);
        break;
      case 'payment_intent.canceled':
      case 'payment_intent.payment_failed':
        await handleFailed(event);
        break;
      default:
        break;
    }

    await admin.from('webhook_events').insert({
      stripe_event_id: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('webhook handler error', err);
    // Do NOT insert webhook_events row so Stripe can safely retry.
    return new Response('retry', { status: 500 });
  }
});

async function handlePaid(event: { data: { object: Record<string, unknown> } }): Promise<void> {
  const pi = event.data.object as {
    id: string;
    amount: number;
    metadata?: { order_id?: string; participant_id?: string };
    status: string;
  };

  const orderId = pi.metadata?.order_id;
  const participantId = pi.metadata?.participant_id;
  if (!orderId || !participantId) return;

  await admin.from('payments').upsert(
    {
      order_id: orderId,
      participant_id: participantId,
      stripe_pi_id: pi.id,
      amount_agorot: pi.amount,
      status: pi.status,
      raw: pi,
    },
    { onConflict: 'stripe_pi_id' },
  );

  await admin
    .from('participants')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', participantId);

  // Transition order to `escrow` if everyone paid.
  const { data: order } = await admin
    .from('orders')
    .select('id, max_participants, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return;

  const { count } = await admin
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('status', 'paid');

  if ((count ?? 0) >= order.max_participants && order.status !== 'escrow') {
    await admin.from('orders').update({ status: 'escrow' }).eq('id', orderId);
  } else if (order.status === 'open') {
    await admin.from('orders').update({ status: 'paying' }).eq('id', orderId);
  }
}

async function handleFailed(event: { data: { object: Record<string, unknown> } }): Promise<void> {
  const pi = event.data.object as {
    id: string;
    metadata?: { participant_id?: string };
    status: string;
  };
  const participantId = pi.metadata?.participant_id;
  if (!participantId) return;
  await admin
    .from('participants')
    .update({ status: 'joined', stripe_payment_intent_id: null })
    .eq('id', participantId);
}
