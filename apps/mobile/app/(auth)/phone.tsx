import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { PrimaryBtn } from '@/components/primitives/Button';
import { BackBtn } from '@/components/primitives/BackBtn';
import { StepDots } from '@/components/primitives/StepDots';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useSendOtp } from '@/api/auth';
import { formatPhoneIL, phoneDigitsOnly } from '@/utils/format';
import { useUiStore } from '@/stores/uiStore';
import { useLocale } from '@/i18n/locale';

export default function Phone() {
  const router = useRouter();
  const { t } = useLocale();
  const [phone, setPhone] = useState('');
  const [focused, setFocused] = useState(false);
  const sendOtp = useSendOtp();
  const pushToast = useUiStore((s) => s.pushToast);
  const digits = phoneDigitsOnly(phone);
  const valid = digits.length >= 9;

  const submit = async () => {
    if (!valid || sendOtp.isPending) return;
    try {
      const { phone: e164 } = await sendOtp.mutateAsync(phone);
      router.push({ pathname: '/(auth)/otp', params: { phone: e164, display: phone } });
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t('auth.phone.sendError'), 'error');
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
        <Text style={styles.title}>{t('auth.phone.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.phone.subtitle')}</Text>
      </View>

      <View style={styles.inputCard}>
        <View style={styles.countryBox}>
          <Text style={styles.country}>IL +972</Text>
        </View>
        <TextInput
          value={phone}
          onChangeText={(v) => setPhone(formatPhoneIL(v))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t('auth.phone.placeholder')}
          placeholderTextColor={colors.mu}
          keyboardType="phone-pad"
          inputMode="tel"
          autoFocus
          maxLength={12}
          autoCorrect={false}
          autoComplete="tel"
          textContentType="telephoneNumber"
          style={[
            styles.input,
            { borderColor: focused ? colors.acc : colors.br },
          ]}
          onSubmitEditing={submit}
        />
      </View>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.phone.footer')}</Text>
        <PrimaryBtn
          label={t('common.sendCode')}
          onPress={submit}
          disabled={!valid}
          loading={sendOtp.isPending}
        />
      </View>
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
    maxWidth: 320,
  },
  inputCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 28,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    ...shadow.card,
  },
  countryBox: {
    backgroundColor: colors.cardSoft,
    borderColor: colors.br,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  country: { fontSize: 15, color: colors.tx, fontFamily: fontFamily.bodyBold },
  input: {
    flex: 1,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 15,
    fontSize: 18,
    color: colors.tx,
    fontFamily: fontFamily.body,
    textAlign: 'left',
    writingDirection: 'ltr',
    minHeight: 54,
  },
  spacer: { flex: 1 },
  footer: {
    gap: 12,
  },
  footerText: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: colors.mu,
    textAlign: 'center',
    lineHeight: 18,
  },
});
