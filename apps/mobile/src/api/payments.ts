import { useMutation } from '@tanstack/react-query';
import { useStripe } from '@stripe/stripe-react-native';
import { invokeFn } from '@/lib/supabase';
import { newIdempotencyKey } from '@/utils/idempotency';
import { track } from '@/lib/posthog';

export function usePayForOrder(orderId: string) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  return useMutation({
    mutationFn: async () => {
      const res = await invokeFn<{
        clientSecret: string;
        ephemeralKey: string;
        customer: string;
        publishableKey: string;
      }>('create-payment-intent', {
        orderId,
        idempotency_key: newIdempotencyKey(),
      });

      const init = await initPaymentSheet({
        merchantDisplayName: 'Shakana',
        customerId: res.customer,
        customerEphemeralKeySecret: res.ephemeralKey,
        paymentIntentClientSecret: res.clientSecret,
        defaultBillingDetails: undefined,
        allowsDelayedPaymentMethods: false,
        returnURL: 'shakana://payment-return',
      });
      if (init.error) throw init.error;

      const paid = await presentPaymentSheet();
      if (paid.error) throw paid.error;

      track('payment_completed', { orderId });
      return { ok: true };
    },
  });
}
