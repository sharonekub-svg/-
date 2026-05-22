import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { PrimaryBtn } from '@/components/primitives/Button';
import { BackBtn } from '@/components/primitives/BackBtn';
import { StepDots } from '@/components/primitives/StepDots';
import { Field } from '@/components/primitives/Field';
import { colors } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useAuthStore } from '@/stores/authStore';
import { useProfileDraftStore } from '@/stores/profileDraftStore';
import { useLocale } from '@/i18n/locale';
import { useUpsertProfile } from '@/api/profile';
import { consumePendingInvite } from '@/lib/deeplinks';
import { useUiStore } from '@/stores/uiStore';

export default function Name() {
  const router = useRouter();
  const setProfile = useAuthStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);
  const draft = useProfileDraftStore((s) => s.draft);
  const clearDraft = useProfileDraftStore((s) => s.clearDraft);
  const upsert = useUpsertProfile();
  const pushToast = useUiStore((s) => s.pushToast);
  const { t } = useLocale();
  const userDraft = draft?.id === user?.id ? draft : null;
  const hydratedNameRef = useRef(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const valid = first.trim().length >= 2 && last.trim().length >= 2;

  useEffect(() => {
    if (hydratedNameRef.current || !user) return;
    hydratedNameRef.current = true;

    const metadataName =
      typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim()
        : '';
    const emailName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim() ?? '';
    const fallbackName = metadataName || emailName;
    const [fallbackFirst = '', ...fallbackLastParts] = fallbackName.split(/\s+/).filter(Boolean);

    setFirst(userDraft?.first_name ?? fallbackFirst);
    setLast(userDraft?.last_name ?? fallbackLastParts.join(' '));
  }, [user, userDraft]);

  const next = async () => {
    if (!valid || !user) return;
    const updated = {
      id: user.id,
      first_name: first.trim(),
      last_name: last.trim(),
      phone: user.phone ?? '',
      city: userDraft?.city ?? '',
      street: userDraft?.street ?? '',
      building: userDraft?.building ?? '',
      apt: userDraft?.apt ?? '',
      floor: userDraft?.floor ?? null,
    };
    try {
      await upsert.mutateAsync(updated);
      setProfile(updated);
      await clearDraft();
      const pending = await consumePendingInvite();
      if (pending) {
        router.replace(`/join/${pending}`);
      } else {
        router.replace('/(auth)/success');
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : t('auth.address.saveError'), 'error');
    }
  };

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <StepDots total={4} current={1} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>SHAKANA</Text>
        <Text style={styles.title}>{t('auth.name.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.name.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <Field
          label={t('auth.name.first')}
          value={first}
          onChange={setFirst}
          placeholder="Mika"
          autoFocus
          ltr
        />
        <Field label={t('auth.name.last')} value={last} onChange={setLast} placeholder="Cohen" ltr />
      </View>

      <View style={styles.spacer} />

      <PrimaryBtn label={t('common.continue')} onPress={next} disabled={!valid} loading={upsert.isPending} />
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 20,
    paddingBottom: 36,
    gap: 24,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  hero: {
    gap: 10,
  },
  kicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.acc,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    color: colors.tx,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    color: colors.mu,
    lineHeight: 24,
  },
  form: {
    gap: 14,
  },
  spacer: { flex: 1 },
});
