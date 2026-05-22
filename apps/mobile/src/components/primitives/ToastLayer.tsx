import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useUiStore } from '@/stores/uiStore';
import { colors, radii } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

const DURATION = 3000;
const FADE = 250;

function ToastItem({
  id,
  message,
  kind,
}: {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}) {
  const dismiss = useUiStore((s) => s.dismissToast);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: FADE, useNativeDriver: true }),
      Animated.delay(DURATION),
      Animated.timing(opacity, { toValue: 0, duration: FADE, useNativeDriver: true }),
    ]).start(() => dismiss(id));
  }, [dismiss, id, opacity]);

  const bg =
    kind === 'error' ? colors.err : kind === 'success' ? colors.grn : colors.tx;

  return (
    <Animated.View style={[styles.toast, { backgroundColor: bg, opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

export function ToastLayer() {
  const toasts = useUiStore((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <View style={styles.layer} pointerEvents="none">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    bottom: 52,
    left: 16,
    right: 16,
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  text: {
    color: colors.white,
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    textAlign: 'center',
  },
});
