import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
type SecureStoreModule = typeof import('expo-secure-store');
declare const require: (id: string) => SecureStoreModule;

async function getNativeSecureStore(): Promise<SecureStoreModule | null> {
  if (isWeb) return null;

  try {
    const secureStore = require('expo-secure-store');
    const available = await secureStore.isAvailableAsync().catch(() => false);
    return available ? secureStore : null;
  } catch {
    return null;
  }
}

export async function getStoredValue(key: string): Promise<string | null> {
  if (isWeb) {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  }

  const secureStore = await getNativeSecureStore();
  return secureStore ? secureStore.getItemAsync(key) : null;
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  if (isWeb) {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    return;
  }

  const secureStore = await getNativeSecureStore();
  if (!secureStore) return;
  await secureStore.setItemAsync(key, value, {
    keychainAccessible: secureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function removeStoredValue(key: string): Promise<void> {
  if (isWeb) {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    return;
  }

  const secureStore = await getNativeSecureStore();
  if (!secureStore) return;
  await secureStore.deleteItemAsync(key);
}

/**
 * Supabase auth storage adapter.
 * Mobile uses encrypted secure storage; web uses localStorage so the same browser remembers the session.
 */
export const secureAuthStorage = {
  getItem: getStoredValue,
  setItem: setStoredValue,
  removeItem: removeStoredValue,
};
