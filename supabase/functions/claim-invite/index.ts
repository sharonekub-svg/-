import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';

type Body = { token: string; idempotency_key?: string };

const CODE_STATUS: Record<string, number> = {
  invite_not_found: 404,
  invite_revoked: 410,
  invite_expired: 410,
  invite_exhausted: 410,
  order_closed: 409,
  order_full: 409,
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const userId = await authedUserId(req);
    const { token } = await readJson<Body>(req);
    if (!token || typeof token !== 'string') throw httpError(400, 'missing_token');

    const { data, error } = await admin.rpc('claim_invite', {
      p_token: token,
      p_user_id: userId,
    });

    if (error) {
      const code = error.message?.match(/[a-z_]+/)?.[0] ?? 'claim_failed';
      const status = CODE_STATUS[code] ?? 400;
      throw httpError(status, code, error.message);
    }

    return json(data);
  } catch (e) {
    return errorJson(e);
  }
});
