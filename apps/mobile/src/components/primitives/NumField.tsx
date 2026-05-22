import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

export function NumField({ label, value, onChange, placeholder }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
        placeholder={placeholder}
        placeholderTextColor={colors.mu}
        keyboardType="number-pad"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        autoComplete="off"
        style={[styles.input, { borderColor: focused ? colors.acc : colors.br }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 6 },
  label: {
    fontSize: 13,
    color: colors.mu,
    fontFamily: fontFamily.bodyBold,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 15,
    fontSize: 16,
    textAlign: 'center',
    color: colors.tx,
    fontFamily: fontFamily.body,
    minHeight: 54,
    ...shadow.card,
  },
});
