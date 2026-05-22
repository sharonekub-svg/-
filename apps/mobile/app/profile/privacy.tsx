import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { BackBtn } from '@/components/primitives/BackBtn';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useLocale } from '@/i18n/locale';

const points = [
  'We only keep the data needed to run your account and orders.',
  'Address, phone, and payment details are used for checkout and delivery.',
  'We do not sell personal data.',
  'Only encrypted auth storage is used for sign-in tokens on device.',
];

export default function PrivacyScreen() {
  const router = useRouter();
  const { t, language } = useLocale();
  const isHebrew = language === 'he';

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <View>
          <Text style={styles.kicker}>SHAKANA</Text>
          <Text style={styles.title}>{t('profile.privacyTitle')}</Text>
          <Text style={styles.subtitle}>
            {isHebrew
              ? 'זה מסך מידע בלבד. הוא לא משנה דבר בחשבון.'
              : 'This is read only. It does not change anything in your account.'}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        {points.map((point) => (
          <View key={point} style={styles.point}>
            <View style={styles.dot} />
            <Text style={styles.body}>{point}</Text>
          </View>
        ))}
      </View>
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
    maxWidth: 320,
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  card: {
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.br,
    borderRadius: 28,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  point: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    marginTop: 7,
    backgroundColor: colors.acc,
  },
  body: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.tx,
  },
});
