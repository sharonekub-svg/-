import { View, StyleSheet } from 'react-native';
import { colors, radii } from '@/theme/tokens';

export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              width: i === current ? 22 : 6,
              backgroundColor: i <= current ? colors.acc : colors.brBr,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center' },
  dot: { height: 6, borderRadius: radii.pill },
});
