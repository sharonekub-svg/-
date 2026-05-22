import * as Linking from 'expo-linking';
import { env } from './env';
import { getStoredValue, removeStoredValue, setStoredValue } from './secureStorage';

const PENDING_KEY = 'shk_pending_invite_token';

/**
 * Supports both shakana://join/{token} and https://shakana.app/join/{token}.
 */
export function parseInviteToken(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    if (parsed.path?.startsWith('join/')) {
      return parsed.path.slice('join/'.length).split('/')[0] ?? null;
    }
    if (parsed.hostname === 'join' && parsed.path) {
      return parsed.path.split('/')[0] ?? null;
    }
    // Fallback: regex the bare URL
    const m = url.match(/\/join\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function buildInviteUrl(token: string): string {
  return `https://${env.universalHost}/join/${encodeURIComponent(token)}`;
}

export function buildAppInviteUrl(token: string): string {
  return `${env.appScheme}://join/${encodeURIComponent(token)}`;
}

/**
 * Persist a token that was received while the user wasn't logged in yet.
 * It's claimed after successful onboarding.
 */
export async function stashPendingInvite(token: string): Promise<void> {
  await setStoredValue(PENDING_KEY, token);
}

export async function consumePendingInvite(): Promise<string | null> {
  const v = await getStoredValue(PENDING_KEY);
  if (v) await removeStoredValue(PENDING_KEY);
  return v;
}
