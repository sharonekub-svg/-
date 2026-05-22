import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

type Props = {
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  testID?: string;
};

export function PrimaryBtn({ onPress, disabled, loading, label, testID }: Props) {
  const isOff = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={isOff ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isOff }}
      style={({ pressed }) => [
        styles.primary,
        shadow.cta,
        isOff && styles.primaryOff,
        pressed && !isOff && { transform: [{ scale: 0.97 }], opacity: 0.82 },
      ]}
    >
      {loading && <ActivityIndicator size="small" color={colors.mu} style={{ marginEnd: 8 }} />}
      <Text style={[styles.primaryLabel, isOff && { color: colors.mu }]}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryBtn({
  label,
  onPress,
  testID,
  leading,
}: {
  label: string;
  onPress?: () => void;
  testID?: string;
  leading?: React.ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.secondary,
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {leading ? <View style={{ marginEnd: 10 }}>{leading}</View> : null}
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

export function TextBtn({
  label,
  onPress,
  small = false,
}: {
  label: string;
  onPress?: () => void;
  small?: boolean;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text
        style={{
          color: colors.acc,
          fontSize: small ? 12 : 14,
          fontFamily: fontFamily.bodySemi,
          paddingVertical: 8,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PillCta({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        shadow.cta,
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <Text style={styles.pillLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    width: '100%',
    minHeight: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  primaryOff: { backgroundColor: colors.br },
  primaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.2,
  },
  secondary: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderColor: colors.br,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 18,
    ...shadow.card,
  },
  secondaryLabel: {
    color: colors.tx,
    fontSize: 16,
    fontFamily: fontFamily.bodyBold,
  },
  pill: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.acc,
    alignSelf: 'center',
  },
  pillLabel: {
    color: colors.white,
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
  },
});
