import { ReactNode } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { stripeConfig } from '@/lib/stripe';

export function StripeProviderShim({ children }: { children: ReactNode }) {
  return (
    <StripeProvider
      publishableKey={stripeConfig.publishableKey}
      merchantIdentifier={stripeConfig.merchantIdentifier}
      urlScheme={stripeConfig.urlScheme}
    >
      <>{children}</>
    </StripeProvider>
  );
}
