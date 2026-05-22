import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

type Props = {
  badge: string;
  title: string;
  subtitle: string;
  cta?: string;
  onCta?: () => void;
};

export function EmptyState({ badge, title, subtitle, cta, onCta }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badgeHolder}>
        <Text style={styles.badge}>{badge}</Text>
      </View>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {cta ? (
        <Pressable
          onPress={onCta}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <Text style={styles.ctaText}>{cta}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 28,
    gap: 18,
  },
  badgeHolder: {
    width: 76,
    height: 76,
    borderRadius: radii.pill,
    backgroundColor: colors.acc,
    borderColor: colors.acc,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  badge: {
    fontSize: 12,
    letterSpacing: 2.4,
    color: colors.white,
    fontFamily: fontFamily.bodyBold,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: colors.tx,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: colors.mu,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: {
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.acc,
  },
  ctaText: {
    fontFamily: fontFamily.bodyBold,
    color: colors.white,
    fontSize: 15,
  },
});
