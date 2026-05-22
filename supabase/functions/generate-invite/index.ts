import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';

type Body = { orderId: string; idempotency_key?: string };

const DEFAULT_TTL_HOURS = 24;
const DEFAULT_MAX_USES = 20;

function randomToken(): string {
  // 128 bits of entropy, URL-safe base64.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let b64 = '';
  for (const byte of bytes) b64 += String.fromCharCode(byte);
  return btoa(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const userId = await authedUserId(req);
    const { orderId } = await readJson<Body>(req);
    if (!orderId) throw httpError(400, 'missing_orderId');

    const { data: order, error } = await admin
      .from('orders')
      .select('id, creator_id, status')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw httpError(404, 'order_not_found');
    if (order.creator_id !== userId) throw httpError(403, 'only_creator_can_invite');
    if (!['open', 'paying'].includes(order.status)) {
      throw httpError(409, 'order_not_open');
    }

    const token = randomToken();
    const expires_at = new Date(Date.now() + DEFAULT_TTL_HOURS * 3600_000).toISOString();

    const { data: inv, error: insErr } = await admin
      .from('invites')
      .insert({
        order_id: order.id,
        token,
        created_by: userId,
        expires_at,
        max_uses: DEFAULT_MAX_USES,
      })
      .select('token, expires_at')
      .single();
    if (insErr) throw insErr;

    return json(inv);
  } catch (e) {
    return errorJson(e);
  }
});
