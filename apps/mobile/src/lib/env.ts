const required = (name: string, value: string | undefined): string => {
  if (!value) {
    if (__DEV__) {
      console.warn(`[env] Missing ${name}. Set it in .env / EAS secrets.`);
    }
    return '';
  }
  return value;
};

export const env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  stripePublishableKey: required('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  stripeMerchantId: process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID ?? 'merchant.app.shakana',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
  appScheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? 'shakana',
  universalHost: process.env.EXPO_PUBLIC_UNIVERSAL_LINK_HOST ?? 'shakana1.vercel.app',
} as const;
