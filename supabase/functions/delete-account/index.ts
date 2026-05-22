import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json } from '../_shared/json.ts';
import { admin, authedUserId, httpError } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const userId = await authedUserId(req);

    // Refuse deletion while the user has an order in escrow — they still
    // have funds held. They must refund / complete first.
    const { data: live } = await admin
      .from('orders')
      .select('id')
      .eq('creator_id', userId)
      .in('status', ['paying', 'escrow', 'delivered'])
      .limit(1);
    if (live && live.length) {
      throw httpError(409, 'open_orders', 'סגור תחילה את ההזמנות הפתוחות');
    }

    // Delete from auth → cascades to profiles / orders / participants via FK.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
});
