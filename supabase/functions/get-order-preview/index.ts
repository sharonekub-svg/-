import { json, errorJson } from '../_shared/json.ts';
import { admin, httpError } from '../_shared/supabaseAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) throw httpError(400, 'missing_token');

    const { data: invite, error: invErr } = await admin
      .from('invites')
      .select('order_id, expires_at, revoked_at, uses_count, max_uses')
      .eq('token', token)
      .maybeSingle();
    if (invErr) throw invErr;
    if (!invite) throw httpError(404, 'invite_not_found');

    const isExpired = new Date(invite.expires_at) < new Date();
    const isRevoked = !!invite.revoked_at;
    const isExhausted = invite.uses_count >= invite.max_uses;

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, product_title, product_image, product_price_agorot, store_label, estimated_shipping_agorot, free_shipping_threshold_agorot, closes_at, status, max_participants, creator_id')
      .eq('id', invite.order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw httpError(404, 'order_not_found');

    const isClosed =
      !['open', 'paying'].includes(order.status) || isExpired || isRevoked || isExhausted;

    const { data: founder } = await admin
      .from('profiles')
      .select('first_name, apt, floor')
      .eq('id', order.creator_id)
      .maybeSingle();

    const { count: participantsCount } = await admin
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id);

    const { data: participants } = await admin
      .from('participants')
      .select('user_id, joined_at')
      .eq('order_id', order.id)
      .order('joined_at', { ascending: true });

    let participantNames: string[] = [];
    if (participants && participants.length > 0) {
      const userIds = participants.map((p: { user_id: string }) => p.user_id);
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, first_name')
        .in('id', userIds);
      if (profiles) {
        const profileMap = new Map((profiles as { id: string; first_name: string }[]).map(p => [p.id, p.first_name]));
        participantNames = participants.map((p: { user_id: string }) => profileMap.get(p.user_id) ?? '').filter(Boolean);
      }
    }

    const body = JSON.stringify({
      order: {
        id: order.id,
        product_title: order.product_title,
        product_image: order.product_image,
        product_price_agorot: order.product_price_agorot,
        store_label: order.store_label,
        estimated_shipping_agorot: order.estimated_shipping_agorot,
        free_shipping_threshold_agorot: order.free_shipping_threshold_agorot,
        closes_at: order.closes_at,
        status: order.status,
        max_participants: order.max_participants,
      },
      founder: founder
        ? { first_name: founder.first_name, apt: founder.apt, floor: founder.floor }
        : null,
      participants_count: participantsCount ?? 0,
      participant_names: participantNames,
      is_closed: isClosed,
    });

    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && 'code' in e) {
      const he = e as { status: number; code: string; message: string };
      return new Response(JSON.stringify({ error: he.code, message: he.message }), {
        status: he.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('get-order-preview error', e);
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
