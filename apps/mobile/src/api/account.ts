import { useMutation } from '@tanstack/react-query';

import { invokeFn } from '@/lib/supabase';
import { newIdempotencyKey } from '@/utils/idempotency';

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      return invokeFn<{ ok: true }>('delete-account', {
        idempotency_key: newIdempotencyKey(),
      });
    },
  });
}
