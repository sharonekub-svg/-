import type { ShakanaEvent } from './posthog';

let client: null = null;

export async function initPostHog(): Promise<null> {
  return client;
}

export function getPostHog(): null {
  return client;
}

export function track(_event: ShakanaEvent, _props?: Record<string, unknown>): void {}

export function identify(_userId: string, _traits?: Record<string, unknown>): void {}

export function resetAnalytics(): void {}
