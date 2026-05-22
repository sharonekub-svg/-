import { ReactNode } from 'react';

// Stripe React Native isn't supported on web. We render children directly
// and let any payment screens degrade gracefully (the pay hook also has a
// .web.ts shadow that throws a friendly error if invoked).
export function StripeProviderShim({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
