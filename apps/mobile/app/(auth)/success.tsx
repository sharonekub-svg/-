import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useAuthStore } from '@/stores/authStore';
import { consumePendingInvite } from '@/lib/deeplinks';
import { consumePendingSharedProduct, peekPendingSharedProduct } from '@/lib/sharedProduct';
import { useLocale } from '@/i18n/locale';

export default function Success() {
  const router = useRouter();
  const name = useAuthStore((s) => s.profile?.first_name ?? '');
  const { t } = useLocale();

  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        const pendingInvite = await consumePendingInvite();
        if (pendingInvite) {
          router.replace(`/join/${pendingInvite}` as any);
          return;
        }
        const shared = await peekPendingSharedProduct();
        if (shared) {
          await consumePendingSharedProduct().catch(() => {});
          router.replace({
            pathname: '/order/new',
            params: {
              url: shared.url,
              title: shared.title,
              source: shared.source,
            },
          });
          return;
        }
        router.replace('/(tabs)/building');
      })().catch(() => {
        router.replace('/(tabs)/building');
      });
    }, 2200);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.mark}>
        <Svg width={44} height={44} viewBox="0 0 44 44" fill="none">
          <Rect x="1" y="1" width="42" height="42" rx="12" stroke={colors.br} strokeWidth={1.5} />
          <Path
            d="M10 22l8 8 16-18"
            stroke={colors.white}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('auth.success.title', { first: name ? `, ${name}` : '' })}</Text>
        <Text style={styles.sub}>{t('auth.success.subtitle')}</Text>
      </View>
      <View style={styles.loadingRow}>
        <ActivityIndicator color={colors.acc} size="small" />
        <Text style={styles.loadingText}>{t('auth.success.routing')}</Text>
      </View>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  mark: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.br,
    ...shadow.card,
  },
  copy: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    color: colors.tx,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    color: colors.mu,
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: colors.mu,
    fontFamily: fontFamily.body,
  },
});
