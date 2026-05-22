import { ReactNode } from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

type Props = ViewProps & {
  children: ReactNode;
  safeEdges?: Edge[];
  padded?: boolean;
};

export function ScreenBase({
  children,
  safeEdges = ['top', 'bottom'],
  padded = true,
  style,
  ...rest
}: Props) {
  return (
    <SafeAreaView edges={safeEdges} style={styles.safe} {...rest}>
      <View style={[styles.container, padded && styles.padded, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: 18 },
});
