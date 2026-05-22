/**
 * Extracts the caller-provided idempotency key. Falls back to a generated
 * one if the caller omits it (Stripe itself is also idempotent at PI level,
 * but we use this key to prevent duplicate inserts in our own ledger).
 */
export function idempotencyKeyFrom(
  body: { idempotency_key?: string } | undefined,
  req: Request,
): string {
  return (
    body?.idempotency_key ??
    req.headers.get('Idempotency-Key') ??
    crypto.randomUUID()
  );
}
