import { createElement, useEffect } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { Stack, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { BuildingSections } from '@/components/demo/BuildingSections';
import { Card, DemoButton, DemoPage, SectionTitle } from '@/components/demo/DemoPrimitives';
import { LanguageSwitcher } from '@/components/primitives/LanguageSwitcher';
import { fontFamily } from '@/theme/fonts';
import { useGoogleSignIn } from '@/api/auth';
import { useLocale } from '@/i18n/locale';
import { initDemoCommerceSync, useDemoCommerceStore } from '@/stores/demoCommerceStore';
import type { DemoBrandId } from '@/demo/catalog';
import { useUiStore } from '@/stores/uiStore';

const TERMS_URL = 'https://shakana.app/legal/terms';
const PRIVACY_URL = 'https://shakana.app/legal/privacy';
const demoVideoUri = Asset.fromModule(require('../../assets/shakana-menu-demo.mp4')).uri;
const MENU_FLOW_STRIP = {
  he: ['בחר מוצר', 'הוסף לסל', 'שלם בבטחה', 'הטיימר מסתיים', 'ההזמנה נשלחת', 'המשלוח זול יותר'],
  en: ['Pick product', 'Add to basket', 'Pay securely', 'Timer ends', 'Order sent', 'Delivery drops'],
};
const MENU_DEMO_FRAMES = [
  {
    id: 'menu',
    title: 'Choose from the app menu',
    eyebrow: '00:03',
    note: 'Browse products inside Shakana and pick what you want.',
    action: 'Product picked',
    cardLabel: 'Menu item',
    cardTitle: 'Black linen overshirt',
    cardMeta: 'Size M - Ivory - In stock',
    total: 'NIS 249',
    badge: 'Added',
    accent: '#B86B4B',
  },
  {
    id: 'pay',
    title: 'Pay for your item',
    eyebrow: '00:12',
    note: 'Checkout confirms the item and locks your seat in the order.',
    action: 'Payment approved',
    cardLabel: 'Checkout',
    cardTitle: 'Your item is paid',
    cardMeta: 'Card approved - Receipt ready',
    total: 'NIS 249',
    badge: 'Paid',
    accent: '#C98F5B',
  },
  {
    id: 'timer',
    title: 'Timer ends automatically',
    eyebrow: '00:24',
    note: 'The basket closes when time runs out, so the group can move together.',
    action: 'Timer ended',
    cardLabel: 'Group timer',
    cardTitle: 'Order window closed',
    cardMeta: '4 neighbors joined before cutoff',
    total: 'NIS 996',
    badge: 'Closed',
    accent: '#E6B8A2',
  },
  {
    id: 'sent',
    title: 'Order sent to the store',
    eyebrow: '00:39',
    note: 'Shakana sends the group order and keeps everyone updated.',
    action: 'Order sent',
    cardLabel: 'Store order',
    cardTitle: 'Packed by the store',
    cardMeta: 'Confirmation sent to everyone',
    total: 'NIS 996',
    badge: 'Sent',
    accent: '#111111',
  },
  {
    id: 'delivery',
    title: 'Delivery price goes down',
    eyebrow: '00:45',
    note: 'The shared delivery split drops from NIS 25 to NIS 7 per person.',
    action: 'Delivery cheaper',
    cardLabel: 'Delivery split',
    cardTitle: 'One courier, many orders',
    cardMeta: 'You get the order at home',
    total: 'NIS 7',
    badge: 'Save NIS 18',
    accent: '#111111',
  },
];

// Claude-like cotton palette: warm cream, white, clay, and ink.
const W = {
  bg: '#F8F5EF',
  surface: '#FFFFFF',
  surfaceTint: '#F1ECE4',
  tx: '#211D19',
  mu: '#70675F',
  mu2: '#A0968D',
  acc: '#B86B4B',
  accLight: '#F4E5D8',
  accBorder: '#E2C7B5',
  border: '#E6DCCE',
  borderStrong: '#D5C6B6',
  shadow: 'rgba(28,25,23,0.07)',
} as const;

function GoogleGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  );
}

function ArrowRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M3 8h10M9 4l4 4-4 4" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function DemoVideoPreview() {
  return (
    <View style={styles.demoStage}>
      <View style={styles.demoHeader}>
        <View style={styles.demoHeaderCopy}>
          <Text style={styles.demoKicker}>Demo video</Text>
          <Text style={styles.demoTitle}>Pick, pay, timer ends, delivered cheaper</Text>
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
              <Text style={styles.nativeVideoTitle}>Pick. Pay. Timer ends.</Text>
              <Text style={styles.nativeVideoBody}>Delivery gets cheaper and the order arrives.</Text>
            </View>
          )}
      </View>
    </View>
  );
}

export default function Welcome() {
  const router = useRouter();
  const googleMut = useGoogleSignIn();
  const pushToast = useUiStore((s) => s.pushToast);
  const orders = useDemoCommerceStore((state) => state.orders);
  const selectBrand = useDemoCommerceStore((state) => state.selectBrand);
  const setDemoRole = useDemoCommerceStore((state) => state.setDemoRole);
  const { language, t } = useLocale();
  const isHebrew = language === 'he';

  useEffect(() => {
    initDemoCommerceSync();
  }, []);

  const openUserDemo = (brand?: DemoBrandId) => {
    setDemoRole('user');
    if (brand) selectBrand(brand);
    router.push('/user');
  };

  const copy =
    language === 'he'
      ? {
          eyebrow: 'הזמנות שכנים',
          authTitle: 'כניסה או הרשמה',
          authBody:
            'Google יפתח בחירת חשבון בכל פעם, כדי שתוכל לעבור בין חשבונות בלי להיתקע על החשבון הקודם.',
          conceptTitle: 'מה Shakana עושה?',
          conceptBody:
            'בוחרים מוצר מתוך התפריט, משלמים, מחכים לסיום הטיימר, וההזמנה נשלחת עם משלוח זול יותר.',
          google: 'המשך עם Google',
          phone: 'המשך עם מספר טלפון',
          openingGoogle: 'פותחים את Google...',
          googleError: 'לא הצלחנו לפתוח את Google. נסה שוב.',
          step: 'שלב',
        }
      : {
          eyebrow: 'Group ordering, simplified',
          authTitle: 'Sign in or create account',
          authBody:
            'Google opens account selection each time, so switching accounts never silently reuses the previous one.',
          conceptTitle: 'How Shakana works',
          conceptBody:
            'Pick a product from the app menu, pay for your item, wait for the timer, and get the order with a lower delivery share.',
          google: 'Continue with Google',
          phone: 'Continue with phone number',
          openingGoogle: 'Opening Google...',
          googleError: 'Could not open Google sign-in. Try again.',
          step: 'Step',
        };

  return (
    <>
      <Stack.Screen options={{ contentStyle: { backgroundColor: W.bg } }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <DemoPage wide>
          <View style={styles.topBar}>
            <Pressable onPress={() => openUserDemo()} accessibilityRole="button">
              <Text style={styles.logo}>shakana</Text>
            </Pressable>
            <View style={styles.topActions}>
              <LanguageSwitcher />
              <DemoButton label={isHebrew ? 'דמו משתמש' : 'User demo'} onPress={() => openUserDemo()} tone="light" style={styles.smallBtn} />
            </View>
          </View>

          <BuildingSections
            orders={orders}
            onOpenStore={() => openUserDemo()}
            onOpenLogin={() => router.push('/login')}
            onChooseBrand={(brand) => openUserDemo(brand)}
          />

          <DemoVideoPreview />

          <View style={styles.grid}>
            <Card style={styles.card}>
              <SectionTitle title={copy.authTitle} kicker={isHebrew ? 'התחברות' : 'Private sign-in'} />
              <Text style={styles.helper}>{copy.authBody}</Text>
              <View style={styles.buttonStack}>
                <DemoButton
                  label={googleMut.isPending ? copy.openingGoogle : copy.google}
                  onPress={() => {
                    googleMut.mutate(undefined, {
                      onError: (error) => {
                        pushToast(error instanceof Error ? error.message : copy.googleError, 'error');
                      },
                    });
                  }}
                  tone="accent"
                />
                <DemoButton label={copy.phone} onPress={() => router.push('/(auth)/phone')} tone="light" />
              </View>
            </Card>

            <Card style={styles.card}>
              <SectionTitle title={copy.conceptTitle} kicker={isHebrew ? 'איך זה עובד' : 'How it works'} />
              <Text style={styles.helper}>{copy.conceptBody}</Text>
              <View style={styles.stepsRow}>
                {MENU_FLOW_STRIP[language].map((step, i) => (
                  <View key={step} style={styles.step}>
                    <Text style={styles.stepNum}>{i + 1}</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>

          <Text style={styles.legal}>
            {t('landing.legal')}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
              {t('common.terms')}
            </Text>
            {'  '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
              {t('common.privacy')}
            </Text>
          </Text>
        </DemoPage>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: W.bg },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  logo: {
    color: W.acc,
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  smallBtn: {
    width: 150,
    minHeight: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    flexGrow: 1,
    flexBasis: 320,
    gap: 14,
  },
  helper: {
    color: W.mu,
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 23,
  },
  buttonStack: {
    gap: 10,
  },

  // Hero
  hero: { gap: 12, paddingBottom: 8 },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: W.acc,
  },
  eyebrow: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: W.acc,
  },
  heroTitle: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
    color: W.tx,
  },
  heroSub: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 26,
    color: W.mu,
    maxWidth: 320,
  },

  // Demo video preview
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
  recordingPill: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  recordingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F45F5F',
  },
  recordingText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  demoBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'stretch',
  },
  phoneFrame: {
    flexGrow: 1,
    flexBasis: 230,
    maxWidth: 330,
    alignSelf: 'center',
    borderRadius: 34,
    padding: 10,
    backgroundColor: '#151515',
    shadowColor: '#111111',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 6,
  },
  phoneSpeaker: {
    width: 62,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#333333',
    alignSelf: 'center',
    marginBottom: 9,
  },
  phoneScreen: {
    minHeight: 405,
    borderRadius: 25,
    backgroundColor: W.bg,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  appChrome: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  appChromeCopy: {
    flex: 1,
    gap: 4,
  },
  appBrand: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1.8,
    color: W.acc,
  },
  appScreenTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 28,
    color: W.tx,
  },
  appTimer: {
    minWidth: 52,
    height: 34,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: W.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTimerText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
  },
  flowCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: W.surface,
    borderWidth: 1,
    borderColor: W.border,
    gap: 6,
  },
  cardTiny: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: W.mu2,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
    color: W.tx,
  },
  cardMeta: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: W.mu,
  },
  scanBar: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: W.surfaceTint,
    marginTop: 4,
  },
  scanProgress: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    transformOrigin: 'left',
  } as any,
  productPanel: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'center',
    borderRadius: 18,
    padding: 12,
    backgroundColor: W.surfaceTint,
    borderWidth: 1,
    borderColor: W.border,
  },
  productThumb: {
    width: 58,
    height: 70,
    borderRadius: 15,
    opacity: 0.86,
  },
  productCopy: {
    flex: 1,
    gap: 4,
  },
  productName: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: W.tx,
  },
  productNote: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: W.mu,
  },
  peopleRow: {
    flexDirection: 'row',
    gap: 7,
    flexWrap: 'wrap',
  },
  personChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: W.surface,
    borderWidth: 1,
    borderColor: W.border,
  },
  personText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    color: W.tx,
  },
  checkoutCard: {
    marginTop: 'auto',
    borderRadius: 18,
    backgroundColor: '#111111',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  checkoutLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    color: 'rgba(255,255,255,0.64)',
  },
  checkoutTotal: {
    marginTop: 3,
    fontFamily: fontFamily.display,
    fontSize: 24,
    color: '#FFFFFF',
  },
  saveBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#F4E5D8',
  },
  saveBadgeText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    color: '#111111',
  },
  timeline: {
    flexGrow: 1,
    flexBasis: 180,
    gap: 8,
    justifyContent: 'center',
  },
  timelineStep: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: W.surfaceTint,
    borderWidth: 1,
    borderColor: W.border,
    gap: 4,
  },
  timelineStepActive: {
    backgroundColor: W.accLight,
    borderColor: W.accBorder,
  },
  timelineTime: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    color: W.mu2,
  },
  timelineTimeActive: {
    color: W.acc,
  },
  timelineTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: W.tx,
  },

  // Steps card
  stepsCard: {
    backgroundColor: W.surface,
    borderRadius: 20,
    padding: 22,
    gap: 12,
    borderWidth: 1,
    borderColor: W.border,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  stepsLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: W.tx,
    letterSpacing: -0.1,
  },
  stepsBody: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: W.mu,
  },
  stepsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: W.accLight,
    borderWidth: 1,
    borderColor: W.accBorder,
  },
  stepNum: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    color: W.acc,
  },
  stepText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    color: W.acc,
  },

  // Note card
  noteCard: {
    backgroundColor: W.surfaceTint,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderWidth: 1,
    borderColor: W.border,
  },
  noteIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: W.accLight,
    borderWidth: 1,
    borderColor: W.accBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noteIcon: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: W.acc,
  },
  noteBody: { flex: 1, gap: 5 },
  noteTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: W.tx,
    letterSpacing: 0.2,
  },
  noteText: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 21,
    color: W.mu,
  },

  // CTAs
  ctaBlock: { gap: 10, marginTop: 4 },
  btnPrimary: {
    width: '100%',
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: W.tx,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 22,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  btnPrimaryLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  divLine: { flex: 1, height: 1, backgroundColor: W.border },
  divText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    letterSpacing: 1.4,
    color: W.mu2,
  },
  btnSecondary: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: W.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: W.border,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 1,
  },
  btnSecondaryLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: W.tx,
  },

  // Legal
  legal: {
    fontSize: 12,
    color: W.mu2,
    textAlign: 'center',
    fontFamily: fontFamily.body,
    lineHeight: 20,
    marginTop: 4,
  },
  legalLink: {
    color: W.acc,
    fontFamily: fontFamily.bodySemi,
  },
});
