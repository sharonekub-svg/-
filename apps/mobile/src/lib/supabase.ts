import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { env } from './env';
import { secureAuthStorage } from './secureStorage';
import type { Database } from '@/types/database';

type SupabaseLike = SupabaseClient<Database> & {
  auth: SupabaseClient<Database>['auth'] & {
    startAutoRefresh: () => void;
    stopAutoRefresh: () => void;
  };
};

const createStubSupabase = (): SupabaseLike =>
  ({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
    },
    functions: {
      invoke: async () => ({ data: null, error: new Error('Supabase is not configured for this demo build.') }),
    },
  } as unknown as SupabaseLike);

export const supabase: SupabaseLike =
  env.supabaseUrl && env.supabaseAnonKey
    ? createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          storage: secureAuthStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
        global: {
          headers: { 'x-shk-client': 'mobile' },
        },
      })
    : createStubSupabase();

// Pause / resume auto-refresh based on app foreground state. Prevents
// background tokens from being refreshed on every wake.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export async function invokeFn<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(`Supabase is not configured. Cannot invoke ${name}.`);
  }
  if (Platform.OS === 'web') {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(`${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: env.supabaseAnonKey,
        authorization: `Bearer ${token ?? env.supabaseAnonKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) as T & { error?: string; message?: string } : null;
    if (!res.ok) {
      throw new Error(parsed?.message || parsed?.error || `Order service returned ${res.status}`);
    }
    if (!parsed) throw new Error(`Empty response from ${name}`);
    return parsed as T;
  }

  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    const message = error.message || String(error);
    if (/not found/i.test(message)) {
      throw new Error(
        `The ${name} order service is not deployed yet. Deploy the Supabase Edge Function and try again.`,
      );
    }
    if (/failed to send a request|functionsfetcherror/i.test(message)) {
      throw new Error(`Could not reach the ${name} order service. Refresh the app and try again.`);
    }
    throw error;
  }
  if (!data) throw new Error(`Empty response from ${name}`);
  return data;
}
