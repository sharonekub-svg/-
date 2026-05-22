import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

export function ShakanaMark({ size = 88, style }: { size?: number; style?: ViewStyle }) {
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: Math.min(radii.xxl, size * 0.14),
        },
        style,
      ]}
    >
      <Text style={[styles.wordmark, { fontSize: size * 0.18, letterSpacing: -size * 0.01 }]}>
        shakana
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: '#F4E5D8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2C7B5',
    ...shadow.card,
  },
  wordmark: {
    fontFamily: fontFamily.body,
    color: '#B86B4B',
    includeFontPadding: false,
    textAlign: 'center',
    textTransform: 'lowercase',
  },
});
