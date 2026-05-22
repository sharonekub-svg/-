import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';

type Body = {
  productUrl: string;
  productTitle: string;
  productPriceAgorot: number;
  productImage?: string;
  storeKey: string;
  storeLabel: string;
  estimatedShippingAgorot: number;
  freeShippingThresholdAgorot: number;
  timerMinutes: number;
  maxParticipants: number;
  pickupResponsibleUserId: string;
  preferredPickupLocation: string;
  idempotency_key?: string;
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const userId = await authedUserId(req);
    const body = await readJson<Body>(req);

    if (!body.productUrl || !/^https?:\/\//i.test(body.productUrl)) {
      throw httpError(400, 'invalid_url');
    }
    if (!body.productTitle || body.productTitle.trim().length < 2) {
      throw httpError(400, 'invalid_title');
    }
    if (!Number.isInteger(body.productPriceAgorot) || body.productPriceAgorot <= 0) {
      throw httpError(400, 'invalid_price');
    }
    if (
      !Number.isInteger(body.maxParticipants) ||
      body.maxParticipants < 2 ||
      body.maxParticipants > 12
    ) {
      throw httpError(400, 'invalid_participants');
    }
    // 0 = no timer (manual close); positive = timer minutes (5–10080)
    if (body.timerMinutes !== 0 && (!Number.isInteger(body.timerMinutes) || body.timerMinutes < 5 || body.timerMinutes > 10080)) {
      throw httpError(400, 'invalid_timer');
    }
    if (!Number.isInteger(body.estimatedShippingAgorot) || body.estimatedShippingAgorot < 0) {
      throw httpError(400, 'invalid_shipping');
    }
    if (!Number.isInteger(body.freeShippingThresholdAgorot) || body.freeShippingThresholdAgorot < 0) {
      throw httpError(400, 'invalid_free_shipping_threshold');
    }
    const storeKey = (body.storeKey || 'manual').trim().slice(0, 40);
    const storeLabel = (body.storeLabel || storeKey).trim().slice(0, 80);
    if (storeLabel.length < 2) throw httpError(400, 'invalid_store');
    if (body.pickupResponsibleUserId !== userId) {
      throw httpError(400, 'pickup_manager_must_be_creator_initially');
    }
    const pickupLocation = body.preferredPickupLocation?.trim() ?? '';
    if (pickupLocation.length < 3 || pickupLocation.length > 160) {
      throw httpError(400, 'invalid_pickup_location');
    }

    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('building_id, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();
    if (profErr) throw profErr;
    const pickupName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();

    const transferGroup = `order_${crypto.randomUUID()}`;
    const hasTimer = body.timerMinutes > 0;
    const closesAt = hasTimer ? new Date(Date.now() + body.timerMinutes * 60_000) : null;
    const editLocksAt = closesAt ? new Date(closesAt.getTime() - 15_000) : null;

    const orderInsert = {
      creator_id: userId,
      building_id: profile?.building_id ?? null,
      product_url: body.productUrl,
      product_title: body.productTitle.trim(),
      product_image: body.productImage ?? null,
      product_price_agorot: body.productPriceAgorot,
      max_participants: body.maxParticipants,
      stripe_transfer_group: transferGroup,
      status: 'open',
      store_key: storeKey,
      store_label: storeLabel,
      estimated_shipping_agorot: body.estimatedShippingAgorot,
      free_shipping_threshold_agorot: body.freeShippingThresholdAgorot,
      closes_at: closesAt?.toISOString() ?? null,
      edit_locks_at: editLocksAt?.toISOString() ?? null,
      founder_checkout_url: body.productUrl,
      pickup_responsible_user_id: userId,
      pickup_responsible_name: pickupName || 'Order creator',
      preferred_pickup_location: pickupLocation,
    };

    const { data: order, error: insErr } = await admin
      .from('orders')
      .insert(orderInsert)
      .select('*')
      .single();

    if (insErr) throw insErr;
    if (!order) throw httpError(500, 'order_insert_failed');

    // Creator is always the first participant.
    const amount = body.productPriceAgorot + body.estimatedShippingAgorot;
    const { data: participant, error: partErr } = await admin.from('participants').insert({
      order_id: order.id,
      user_id: userId,
      status: 'joined',
      amount_agorot: amount,
    }).select('id').single();
    if (partErr) throw partErr;

    const { error: itemErr } = await admin.from('order_items').insert({
      order_id: order.id,
      participant_id: participant.id,
      title: body.productTitle.trim(),
      ref: body.productUrl,
      size: null,
      price_agorot: body.productPriceAgorot,
    });
    if (itemErr) throw itemErr;

    return json({ order });
  } catch (e) {
    return errorJson(e);
  }
});
