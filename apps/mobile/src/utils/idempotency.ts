/**
 * Generates an idempotency key for client-initiated mutations.
 * Used by React Query mutation hooks and passed to edge functions as
 * a header so Stripe / server writes can dedupe retries.
 */
export function newIdempotencyKey(): string {
  const g = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (g?.randomUUID) return g.randomUUID();
  // Fallback (RFC4122-ish) for environments without crypto.randomUUID.
  const rand = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${rand(8)}-${rand(4)}-4${rand(3)}-${((8 + Math.floor(Math.random() * 4)) | 0).toString(
    16,
  )}${rand(3)}-${rand(12)}`;
}
