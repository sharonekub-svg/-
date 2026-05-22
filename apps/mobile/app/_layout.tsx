import { useEffect, useRef, useState } from 'react';
import { Stack, type Href, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';

import { useAppFonts } from '@/theme/fonts';
import { ensureLanguageDirection } from '@/theme/rtl';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { initSentry, identifySentryUser, Sentry } from '@/lib/sentry';
import { initPostHog, identify, resetAnalytics } from '@/lib/posthog';
import { StripeProviderShim } from '@/components/StripeProviderShim';
import { consumePendingInvite, parseInviteToken, stashPendingInvite } from '@/lib/deeplinks';
import { peekPendingSharedProduct, consumePendingSharedProduct } from '@/lib/sharedProduct';
import { colors } from '@/theme/tokens';
import { useProfile } from '@/api/profile';
import { loadStoredLanguage, useLocaleStore } from '@/i18n/locale';
import { useProfileDraftStore } from '@/stores/profileDraftStore';
import { ToastLayer } from '@/components/primitives/ToastLayer';

import '../global.css';

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}
initSentry();

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <SafeAreaProvider>
      <View style={styles.errorScreen}>
        <View style={styles.errorHalo} />
        <View style={styles.errorCard}>
          <View style={styles.errorLogoPill}>
            <Text style={styles.errorLogo}>shakana</Text>
          </View>
          <Text style={styles.errorTitle}>משהו נתקע בטעינת המסך</Text>
          <Text style={styles.errorBody}>
            תיקנו את המנגנון כדי שלא תישאר על מסך לבן. נסה לטעון שוב, ואם זה חוזר נמשיך מהשגיאה המדויקת.
          </Text>
          <Pressable accessibilityRole="button" onPress={retry} style={styles.errorButton}>
            <Text style={styles.errorButtonText}>נסה שוב</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
});

onlineManager.setEventListener((setOnline) => {
  const sub = AppState.addEventListener('change', (s) => setOnline(s === 'active'));
  return () => sub.remove();
});

function RootLayoutInner() {
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [bootstrapped, setBootstrapped] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const draft = useProfileDraftStore((s) => s.draft);
  const profileQuery = useProfile(session?.user.id);
  const profile = profileQuery.data;
  const fontsLoaded = useAppFonts();
  const navReady = !!rootNavigationState?.key;
  const navReadyRef = useRef(navReady);
  const pendingRoute = useRef<Href | null>(null);
  const pendingShareRoute = useRef<Href | null>(null);

  navReadyRef.current = navReady;

  // Boot: RTL, Sentry, PostHog, Supabase session, deep link intake.
  useEffect(() => {
    let authSub: { subscription: { unsubscribe: () => void } } | null = null;
    let linkSub: { remove: () => void } | null = null;
    let mounted = true;

    (async () => {
      const storedLanguage = await loadStoredLanguage();
      useLocaleStore.setState({ language: storedLanguage });
      await ensureLanguageDirection(storedLanguage);
      await initPostHog();
      await useProfileDraftStore.getState().loadDraft();

      const { data: current } = await supabase.auth.getSession();
      setSession(current.session ?? null);
      if (current.session?.user) {
        identifySentryUser(current.session.user.id);
        identify(current.session.user.id);
      }
      setHydrated(true);

      const { data } = supabase.auth.onAuthStateChange((_ev, newSession) => {
        setSession(newSession ?? null);
        if (newSession?.user) {
          identifySentryUser(newSession.user.id);
          identify(newSession.user.id);
        } else {
          identifySentryUser(null);
          resetAnalytics();
        }
      });
      authSub = data;

      const pendingShare = await peekPendingSharedProduct();
      if (pendingShare) {
        pendingShareRoute.current = `/order/new?${new URLSearchParams({
          url: pendingShare.url,
          title: pendingShare.title,
          source: pendingShare.source,
        }).toString()}` as Href;
      }

      // Cold-start deep link → stash token for post-login claim.
      const initialUrl = await Linking.getInitialURL();
      const coldToken = parseInviteToken(initialUrl);
      if (coldToken) await stashPendingInvite(coldToken);

      linkSub = Linking.addEventListener('url', async ({ url }) => {
        const t = parseInviteToken(url);
        if (t) {
          const hasSession = !!useAuthStore.getState().session;
          if (!hasSession) {
            await stashPendingInvite(t);
          }
          const nextRoute = (hasSession ? `/join/${t}` : '/login') as Href;
          if (!navReadyRef.current) {
            pendingRoute.current = nextRoute;
            return;
          }
          if (!hasSession) {
            router.replace(nextRoute);
          } else {
            router.push(nextRoute);
          }
        }
      });

      if (mounted) {
        setBootstrapped(true);
      }
    })()
      .catch((e) => {
        Sentry.captureException(e);
      })
      .finally(() => {
        if (mounted) {
          setBootstrapped(true);
        }
      });

    return () => {
      mounted = false;
      authSub?.subscription.unsubscribe();
      linkSub?.remove();
    };
  }, [router, setHydrated, setSession]);

  // Route gating.
  useEffect(() => {
    if (!navReady || !hydrated || !bootstrapped) return;
    const inAuth = segments[0] === '(auth)';
    const inCallback = segments[0] === 'auth-callback';
    const inShare = segments[0] === 'share';
    const inJoin = segments[0] === 'join';
    const inTabsBuilding = segments[0] === '(tabs)' && segments[1] === 'building';
    const inDemo =
      segments[0] === 'welcome' ||
      segments[0] === 'login' ||
      segments[0] === 'profile' ||
      segments[0] === 'user' ||
      segments[0] === 'store' ||
      inTabsBuilding;
    if (inCallback) return;
    if (inShare) return;
    if (inJoin && Platform.OS === 'web') return;
    if (inDemo) return;
    if (session && !profileQuery.isFetched && !profileQuery.isError) return;
    const profileComplete =
      !!profile &&
      profile.first_name.trim().length > 0 &&
      profile.last_name.trim().length > 0;
    const draftHasName =
      !!draft &&
      draft.first_name.trim().length > 0 &&
      draft.last_name.trim().length > 0;

    if (!session && !inAuth && !(Platform.OS === 'web' && inJoin)) {
      router.replace('/login');
    } else if (session && profileComplete && inAuth) {
      void consumePendingInvite().then((pending) => {
        router.replace((pending ? `/join/${pending}` : '/(tabs)/building') as Href);
      });
    } else if (session && !profileComplete) {
      const nextRoute = (draftHasName ? '/(auth)/address' : '/(auth)/name') as Href;
      if (!inAuth) {
        router.replace(nextRoute);
      } else if (segments[1] !== (draftHasName ? 'address' : 'name')) {
        router.replace(nextRoute);
      }
    }
  }, [bootstrapped, hydrated, navReady, session, profile, profileQuery.isFetched, profileQuery.isError, draft, segments, router]);

  useEffect(() => {
    setProfile(profile ?? null);
  }, [profile, setProfile]);

  useEffect(() => {
    if (!navReady || !pendingRoute.current) return;
    const nextRoute = pendingRoute.current;
    pendingRoute.current = null;
    router.replace(nextRoute as Href);
  }, [navReady, router]);

  useEffect(() => {
    if (!navReady || !session || !pendingShareRoute.current) return;
    const nextRoute = pendingShareRoute.current;
    pendingShareRoute.current = null;
    consumePendingSharedProduct().catch(() => {});
    router.replace(nextRoute as Href);
  }, [navReady, router, session]);

  // Query focus manager ties to AppState.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      focusManager.setFocused(s === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded && bootstrapped) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, bootstrapped]);

  const showSplash = Platform.OS !== 'web' && (!fontsLoaded || !bootstrapped);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="join/[token]" />
        <Stack.Screen name="login" />
        <Stack.Screen name="order" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="share" />
        <Stack.Screen name="store" />
        <Stack.Screen name="user" />
      </Stack>
      {showSplash ? <View pointerEvents="none" style={styles.splashOverlay} /> : null}
      <ToastLayer />
    </View>
  );
}

export default Sentry.wrap(function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StripeProviderShim>
          <RootLayoutInner />
        </StripeProviderShim>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  // errorScreen, errorCard etc. use colors.* so auto-update via tokens
  errorScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  errorHalo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.limeSoft,
    opacity: 0.9,
    transform: [{ translateY: -42 }],
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 36,
    padding: 28,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    alignItems: 'center',
    gap: 14,
    shadowColor: colors.navy,
    shadowOpacity: 0.08,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 6,
  },
  errorLogoPill: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
  },
  errorLogo: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -1,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.tx,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.mu,
    textAlign: 'center',
  },
  errorButton: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: colors.navy,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  errorButtonText: {
    color: colors.white,
    fontWeight: '800',
  },
});
