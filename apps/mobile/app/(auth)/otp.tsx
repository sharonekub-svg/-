import { useMemo, useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { PrimaryBtn, TextBtn } from '@/components/primitives/Button';
import { BackBtn } from '@/components/primitives/BackBtn';
import { StepDots } from '@/components/primitives/StepDots';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useSendOtp, useVerifyOtp } from '@/api/auth';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useLocale } from '@/i18n/locale';

const LEN = 6;

export default function Otp() {
  const { phone: phoneE164, display } = useLocalSearchParams<{ phone: string; display: string }>();
  const router = useRouter();
  const { t } = useLocale();
  const verify = useVerifyOtp();
  const resend = useSendOtp();
  const pushToast = useUiStore((s) => s.pushToast);
  const setSession = useAuthStore((s) => s.setSession);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: LEN }, () => ''));
  const refs = useMemo(() => Array.from({ length: LEN }, () => ({ current: null as TextInput | null })), []);
  const [resent, setResent] = useState(false);

  const full = digits.every((d) => d.length === 1);
  const code = digits.join('');

  const update = (i: number, v: string) => {
    const ch = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = ch;
    setDigits(next);
    if (ch && i < LEN - 1) refs[i + 1]?.current?.focus();
  };

  const onKey = (i: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1]?.current?.focus();
  };

  const submit = async () => {
    if (!full || verify.isPending) return;
    try {
      const session = await verify.mutateAsync({ phone: String(phoneE164), token: code });
      setSession(session);
      setHydrated(true);
      router.replace('/(auth)/name');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t('auth.otp.verifyError'), 'error');
      setDigits(Array.from({ length: LEN }, () => ''));
      refs[0]?.current?.focus();
    }
  };

  const handleResend = async () => {
    try {
      await resend.mutateAsync(String(display ?? phoneE164 ?? ''));
      setResent(true);
      setTimeout(() => setResent(false), 3000);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t('auth.otp.resendError'), 'error');
    }
  };

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <StepDots total={4} current={0} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>SHAKANA</Text>
        <Text style={styles.title}>{t('auth.otp.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.otp.subtitle', { phone: String(display ?? phoneE164 ?? '') })}</Text>
      </View>

      <View style={styles.codeCard}>
        <View style={styles.codeRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(r) => {
                refs[i]!.current = r;
              }}
              value={d}
              onChangeText={(v) => update(i, v)}
              onKeyPress={(e) => onKey(i, e)}
              keyboardType="number-pad"
              maxLength={1}
              autoFocus={i === 0}
              selectionColor={colors.acc}
              style={[
                styles.box,
                {
                  borderColor: d ? colors.acc : colors.br,
                  backgroundColor: d ? colors.white : colors.cardSoft,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.resendBlock}>
          <Text style={styles.resendPrompt}>{t('auth.otp.needAnother')}</Text>
          {resent ? (
            <Text style={styles.resentOk}>{t('auth.otp.codeSent')}</Text>
          ) : (
            <TextBtn label={t('common.resend')} onPress={handleResend} />
          )}
        </View>
      </View>

      <View style={styles.spacer} />

      <PrimaryBtn label={t('common.verifyCode')} onPress={submit} disabled={!full} loading={verify.isPending} />
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
  subtitle: { fontFamily: fontFamily.body, fontSize: 15, color: colors.mu, lineHeight: 24 },
  codeCard: {
    gap: 16,
    padding: 18,
    borderRadius: 28,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    ...shadow.card,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    writingDirection: 'ltr',
  },
  box: {
    width: 46,
    height: 58,
    borderWidth: 1,
    borderRadius: radii.lg,
    textAlign: 'center',
    fontSize: 24,
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
  },
  resendBlock: { alignItems: 'center', gap: 4 },
  resendPrompt: { fontSize: 13, color: colors.mu, fontFamily: fontFamily.body },
  resentOk: { fontSize: 13, color: colors.grn, fontFamily: fontFamily.bodyBold },
  spacer: { flex: 1 },
});
