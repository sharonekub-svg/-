import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale, type Language } from '@/i18n/locale';
import { colors, radii } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

const OPTIONS: Array<{ language: Language; label: string }> = [
  { language: 'he', label: 'עברית' },
  { language: 'en', label: 'English' },
];

export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { language, setLanguage, t } = useLocale();

  return (
    <View style={[styles.wrap, dark && styles.wrapDark]}>
      <View style={styles.textBlock}>
        <Text style={[styles.label, dark && styles.labelDark]}>{t('language.label')}</Text>
        <Text style={[styles.subtitle, dark && styles.subtitleDark]}>{t('language.subtitle')}</Text>
      </View>
      <View style={styles.row}>
        {OPTIONS.map((option) => {
          const active = option.language === language;
          return (
            <Pressable
              key={option.language}
              onPress={() => void setLanguage(option.language)}
              style={[styles.pill, dark && styles.pillDark, active && (dark ? styles.pillActiveDark : styles.pillActive)]}
            >
              <Text style={[styles.pillText, dark && styles.pillTextDark, active && (dark ? styles.pillTextActiveDark : styles.pillTextActive)]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
  },
  wrapDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.09)',
  },
  textBlock: {
    gap: 3,
  },
  label: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.tx,
    textTransform: 'uppercase',
  },
  labelDark: { color: 'rgba(255,255,255,0.80)' },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  subtitleDark: { color: 'rgba(255,255,255,0.50)' },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.s1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillDark: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillActive: {
    backgroundColor: colors.tx,
    borderColor: colors.tx,
  },
  pillActiveDark: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  pillText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    color: colors.tx,
  },
  pillTextDark: { color: 'rgba(255,255,255,0.80)' },
  pillTextActive: {
    color: colors.white,
  },
  pillTextActiveDark: {
    color: '#060A12',
  },
});
