import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { colors } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useAuthStore } from '@/stores/authStore';
import { parseSharedProduct, stashPendingSharedProduct } from '@/lib/sharedProduct';
import { useLocale } from '@/i18n/locale';

type ShareParams = {
  url?: string;
  text?: string;
  title?: string;
};

export default function ShareIntake() {
  const router = useRouter();
  const params = useLocalSearchParams<ShareParams>();
  const { t } = useLocale();
  const session = useAuthStore((s) => s.session);
  const [message, setMessage] = useState(t('share.loading'));

  useEffect(() => {
    const draft = parseSharedProduct({
      url: typeof params.url === 'string' ? params.url : null,
      text: typeof params.text === 'string' ? params.text : null,
      title: typeof params.title === 'string' ? params.title : null,
    });

    if (!draft) {
      setMessage(t('share.unsupported'));
      const timer = setTimeout(() => router.replace('/(tabs)/building'), 1300);
      return () => clearTimeout(timer);
    }

    (async () => {
      if (!session) {
        await stashPendingSharedProduct(draft);
        setMessage(t('share.savedForLater'));
        router.replace('/login');
        return;
      }
      setMessage(t('share.ready'));
      router.replace({
        pathname: '/order/new',
        params: {
          url: draft.url,
          title: draft.title,
          source: draft.source,
        },
      });
    })().catch(() => {
      setMessage(t('share.unsupported'));
      router.replace('/(tabs)/building');
    });
  }, [params.text, params.title, params.url, router, session, t]);

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.card}>
        <ActivityIndicator color={colors.acc} />
        <Text style={styles.title}>{message}</Text>
        <Text style={styles.body}>{t('share.body')}</Text>
      </View>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.white,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    color: colors.tx,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.mu,
    textAlign: 'center',
  },
});
