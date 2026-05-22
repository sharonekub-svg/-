import { env } from './env';

export const stripeConfig = {
  publishableKey: env.stripePublishableKey,
  merchantIdentifier: env.stripeMerchantId,
  urlScheme: env.appScheme,
} as const;
