import { useMutation } from '@tanstack/react-query';

// Web build: Stripe React Native PaymentSheet doesn't run in the browser.
// Native iOS/Android use the real implementation in payments.ts. On web
// we expose the same hook signature but reject with a friendly error so
// any UI that lands on the pay screen surfaces it instead of crashing.
export function usePayForOrder(_orderId: string) {
  return useMutation({
    mutationFn: async () => {
      throw new Error('התשלום זמין רק באפליקציה הניידת.');
    },
  });
}
