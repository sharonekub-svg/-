import { useMutation } from '@tanstack/react-query';
import { invokeFn } from '@/lib/supabase';
import { newIdempotencyKey } from '@/utils/idempotency';
import { track } from '@/lib/posthog';

export function useGenerateInvite() {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await invokeFn<{ token: string; expires_at: string }>(
        'generate-invite',
        {
          orderId,
          idempotency_key: newIdempotencyKey(),
        },
      );
      return res;
    },
  });
}

export function useClaimInvite() {
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await invokeFn<{ orderId: string; participantId: string }>(
        'claim-invite',
        { token, idempotency_key: newIdempotencyKey() },
      );
      track('join_success', { orderId: res.orderId });
      return res;
    },
  });
}

export function trackInviteSent(orderId: string): void {
  track('invite_sent', { orderId });
}
