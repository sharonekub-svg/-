import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';

type DeliveryAction =
  | 'update_pickup'
  | 'mark_shipped'
  | 'mark_ready_for_pickup'
  | 'mark_picked_up'
  | 'mark_ready_for_distribution'
  | 'mark_delivered_to_user';

type Body = {
  orderId: string;
  action: DeliveryAction;
  participantId?: string;
  pickupResponsibleUserId?: string;
  preferredPickupLocation?: string;
};

type OrderRow = {
  id: string;
  creator_id: string;
  status: string;
  pickup_responsible_user_id: string | null;
  shipping_status: string;
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const userId = await authedUserId(req);
    const body = await readJson<Body>(req);
    if (!body.orderId) throw httpError(400, 'missing_orderId');
    if (!body.action) throw httpError(400, 'missing_action');

    const { data: order, error } = await admin
      .from('orders')
      .select('id, creator_id, status, pickup_responsible_user_id, shipping_status')
      .eq('id', body.orderId)
      .maybeSingle<OrderRow>();
    if (error) throw error;
    if (!order) throw httpError(404, 'order_not_found');

    const isCreator = order.creator_id === userId;
    const isPickupManager = order.pickup_responsible_user_id === userId;
    if (!isCreator && !isPickupManager) throw httpError(403, 'not_delivery_manager');
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw httpError(409, 'order_closed');
    }

    if (body.action === 'update_pickup') {
      return await updatePickup(order, body, isCreator);
    }

    if (order.status !== 'escrow' && order.status !== 'delivered') {
      throw httpError(409, 'order_not_ready_for_delivery_updates');
    }

    switch (body.action) {
      case 'mark_shipped':
        return await updateOrderStatus(order, ['not_shipped'], {
          shipping_status: 'shipped',
          shipped_at: new Date().toISOString(),
        });
      case 'mark_ready_for_pickup':
        return await updateOrderStatus(order, ['not_shipped', 'shipped'], {
          shipping_status: 'ready_for_pickup',
          ready_for_pickup_at: new Date().toISOString(),
        });
      case 'mark_picked_up':
        return await updateOrderStatus(order, ['ready_for_pickup'], {
          shipping_status: 'picked_up',
          picked_up_at: new Date().toISOString(),
        });
      case 'mark_ready_for_distribution':
        return await updateOrderStatus(order, ['picked_up'], {
          status: 'delivered',
          shipping_status: 'ready_for_distribution',
          ready_for_distribution_at: new Date().toISOString(),
          delivery_confirmed_at: new Date().toISOString(),
        });
      case 'mark_delivered_to_user':
        return await markDeliveredToUser(order, body);
      default:
        throw httpError(400, 'invalid_action');
    }
  } catch (e) {
    return errorJson(e);
  }
});

async function updatePickup(order: OrderRow, body: Body, isCreator: boolean): Promise<Response> {
  const updates: Record<string, unknown> = {};
  const location = body.preferredPickupLocation?.trim();

  if (location !== undefined) {
    if (location.length < 3 || location.length > 160) {
      throw httpError(400, 'invalid_pickup_location');
    }
    updates.preferred_pickup_location = location;
  }

  if (body.pickupResponsibleUserId && body.pickupResponsibleUserId !== order.pickup_responsible_user_id) {
    if (!isCreator) throw httpError(403, 'only_creator_can_change_pickup_manager');
    const { data: participant, error: partErr } = await admin
      .from('participants')
      .select('user_id')
      .eq('order_id', order.id)
      .eq('user_id', body.pickupResponsibleUserId)
      .maybeSingle();
    if (partErr) throw partErr;
    if (!participant) throw httpError(400, 'pickup_manager_must_be_participant');

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', body.pickupResponsibleUserId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    updates.pickup_responsible_user_id = body.pickupResponsibleUserId;
    updates.pickup_responsible_name =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || 'Pickup manager';
  }

  if (Object.keys(updates).length === 0) throw httpError(400, 'nothing_to_update');

  const { error } = await admin.from('orders').update(updates).eq('id', order.id);
  if (error) throw error;
  return json({ ok: true });
}

async function updateOrderStatus(
  order: OrderRow,
  allowedFrom: string[],
  updates: Record<string, unknown>,
): Promise<Response> {
  if (!allowedFrom.includes(order.shipping_status)) {
    throw httpError(409, 'invalid_delivery_transition');
  }
  const { error } = await admin.from('orders').update(updates).eq('id', order.id);
  if (error) throw error;
  return json({ ok: true });
}

async function markDeliveredToUser(order: OrderRow, body: Body): Promise<Response> {
  if (order.shipping_status !== 'ready_for_distribution' || order.status !== 'delivered') {
    throw httpError(409, 'order_not_ready_for_distribution');
  }
  if (!body.participantId) throw httpError(400, 'missing_participantId');
  const { data: participant, error: partErr } = await admin
    .from('participants')
    .select('id, order_id, status')
    .eq('id', body.participantId)
    .eq('order_id', order.id)
    .maybeSingle();
  if (partErr) throw partErr;
  if (!participant) throw httpError(404, 'participant_not_found');
  if (participant.status !== 'paid') throw httpError(409, 'participant_not_paid');

  const { error } = await admin
    .from('participants')
    .update({ delivered_to_user_at: new Date().toISOString() })
    .eq('id', participant.id);
  if (error) throw error;
  return json({ ok: true });
}
