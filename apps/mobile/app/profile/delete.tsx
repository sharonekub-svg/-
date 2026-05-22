import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { BackBtn } from '@/components/primitives/BackBtn';
import { PrimaryBtn } from '@/components/primitives/Button';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useDeleteAccount } from '@/api/account';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { resetAnalytics } from '@/lib/posthog';
import { useLocale } from '@/i18n/locale';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { t, language } = useLocale();
  const isHebrew = language === 'he';
  const deleteAccount = useDeleteAccount();
  const pushToast = useUiStore((s) => s.pushToast);
  const reset = useAuthStore((s) => s.reset);

  useEffect(() => {
    if (deleteAccount.isSuccess) {
      void supabase.auth.signOut({ scope: 'local' }).finally(() => {
        resetAnalytics();
        reset();
        router.replace('/login');
      });
    }
  }, [deleteAccount.isSuccess, reset, router]);

  const onDelete = async () => {
    try {
      await deleteAccount.mutateAsync();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t('profile.deleteFailed'), 'error');
    }
  };

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <View>
          <Text style={styles.kicker}>SHAKANA</Text>
          <Text style={styles.title}>{t('profile.deleteTitle')}</Text>
          <Text style={styles.subtitle}>
            {isHebrew
              ? 'זה מוחק את החשבון הזה וכל מה שמחובר אליו.'
              : 'This permanently removes this account and everything tied to it.'}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.body}>{t('profile.deleteBody')}</Text>
      </View>

      <PrimaryBtn label={t('common.deleteAccount')} onPress={onDelete} loading={deleteAccount.isPending} />
      <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
        <Text style={styles.cancelText}>{t('common.change')}</Text>
      </Pressable>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 20,
    paddingBottom: 36,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  kicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.acc,
    marginBottom: 4,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    color: colors.tx,
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 330,
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.br,
    borderRadius: 28,
    backgroundColor: colors.white,
    gap: 10,
    ...shadow.card,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.mu,
  },
  cancelBtn: {
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
    color: colors.tx,
  },
});
