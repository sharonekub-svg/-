import PostHog from 'posthog-react-native';
import { env } from './env';

let client: PostHog | null = null;

export async function initPostHog(): Promise<PostHog | null> {
  if (client) return client;
  if (!env.posthogKey) return null;

  client = new PostHog(env.posthogKey, {
    host: env.posthogHost,
    flushAt: 20,
    flushInterval: 10_000,
    captureNativeAppLifecycleEvents: true,
    enableSessionReplay: false,
  });
  return client;
}

export function getPostHog(): PostHog | null {
  return client;
}

export type ShakanaEvent =
  | 'start_order_clicked'
  | 'invite_sent'
  | 'join_success'
  | 'payment_completed'
  | 'delivery_status_updated'
  | 'order_timer_locked'
  | 'order_completed'
  | 'cart_item_added';

export function track(event: ShakanaEvent, props?: Record<string, unknown>): void {
  client?.capture(event, props as never);
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  client?.identify(userId, traits as never);
}

export function resetAnalytics(): void {
  client?.reset();
}
