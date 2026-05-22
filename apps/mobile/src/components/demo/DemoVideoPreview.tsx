import { createElement } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';

import { fontFamily } from '@/theme/fonts';

const demoVideoUri = Asset.fromModule(require('../../../assets/shakana-menu-demo.mp4')).uri;

const W = {
  surface: '#FFFFFF',
  surfaceTint: '#F1ECE4',
  tx: '#211D19',
  mu: '#70675F',
  acc: '#B86B4B',
  border: '#E6DCCE',
  shadow: 'rgba(28,25,23,0.07)',
} as const;

export function DemoVideoPreview() {
  return (
    <View style={styles.demoStage}>
      <View style={styles.demoHeader}>
        <View style={styles.demoHeaderCopy}>
          <Text style={styles.demoKicker}>Demo video</Text>
          <Text style={styles.demoTitle}>Pick products, pay, timer closes, delivery drops</Text>
        </View>
        <Text style={styles.demoDuration}>00:45</Text>
      </View>
      <View style={styles.videoShell}>
        {Platform.OS === 'web'
          ? createElement('video', {
              src: demoVideoUri,
              autoPlay: true,
              loop: true,
              muted: true,
              playsInline: true,
              controls: true,
              style: styles.webVideo,
            })
          : (
            <View style={styles.nativeVideoFallback}>
              <Text style={styles.nativeVideoTitle}>Pick. Pay. Save.</Text>
              <Text style={styles.nativeVideoBody}>The group order closes and delivery gets cheaper.</Text>
            </View>
          )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  demoStage: {
    backgroundColor: W.surface,
    borderRadius: 24,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: W.border,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 3,
  },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  demoHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  demoKicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: W.acc,
  },
  demoTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 17,
    lineHeight: 22,
    color: W.tx,
  },
  demoDuration: {
    minWidth: 50,
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: W.surfaceTint,
    color: W.mu,
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
  },
  videoShell: {
    width: '100%',
    aspectRatio: 488 / 282,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: W.surfaceTint,
    borderWidth: 1,
    borderColor: W.border,
  },
  webVideo: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',
    backgroundColor: '#F8F5EF',
  } as any,
  nativeVideoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: W.surfaceTint,
  },
  nativeVideoTitle: {
    color: W.tx,
    fontFamily: fontFamily.display,
    fontSize: 24,
    textAlign: 'center',
  },
  nativeVideoBody: {
    marginTop: 8,
    color: W.mu,
    fontFamily: fontFamily.body,
    fontSize: 14,
    textAlign: 'center',
  },
});
