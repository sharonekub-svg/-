import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { BackBtn } from '@/components/primitives/BackBtn';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useLocale } from '@/i18n/locale';

const points = [
  'Use the app for real orders and normal personal use only.',
  'Do not try to bypass checkout, escrow, or account controls.',
  'If an order is in escrow, the app may block deletion until it is resolved.',
  'We may update these terms when the product changes.',
];

export default function TermsScreen() {
  const router = useRouter();
  const { t, language } = useLocale();
  const isHebrew = language === 'he';

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <View>
          <Text style={styles.kicker}>SHAKANA</Text>
          <Text style={styles.title}>{t('profile.termsTitle')}</Text>
          <Text style={styles.subtitle}>
            {isHebrew
              ? 'זה דף מידע בלבד, לא הגדרה פעילה.'
              : 'This is a read-only info page, not a setting.'}
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
    backgroundColor: colors.tx,
  },
  body: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.tx,
  },
});
