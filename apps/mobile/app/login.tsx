import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BuildingSections } from '@/components/demo/BuildingSections';
import { Card, DemoButton, DemoPage, SectionTitle } from '@/components/demo/DemoPrimitives';
import { DemoVideoPreview } from '@/components/demo/DemoVideoPreview';
import { LanguageSwitcher } from '@/components/primitives/LanguageSwitcher';
import { useGoogleSignIn } from '@/api/auth';
import { demoStores, type DemoBrandId } from '@/demo/catalog';
import { initDemoCommerceSync, useDemoCommerceStore } from '@/stores/demoCommerceStore';
import { colors } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useLocale } from '@/i18n/locale';

export default function LoginScreen() {
  const router = useRouter();
  const { language } = useLocale();
  const isHebrew = language === 'he';
  const setDemoRole = useDemoCommerceStore((state) => state.setDemoRole);
  const selectBrand = useDemoCommerceStore((state) => state.selectBrand);
  const orders = useDemoCommerceStore((state) => state.orders);
  const googleSignIn = useGoogleSignIn();

  useEffect(() => {
    initDemoCommerceSync();
  }, []);

  const openUserDemo = (brand?: DemoBrandId) => {
    setDemoRole('user');
    if (brand) selectBrand(brand);
    router.replace('/user');
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <DemoPage wide>
        <View style={styles.topBar}>
          <Text style={styles.logo}>shakana</Text>
          <View style={styles.topActions}>
            <LanguageSwitcher />
            <DemoButton label={isHebrew ? 'דמו משתמש' : 'User demo'} onPress={() => openUserDemo()} tone="light" style={styles.smallBtn} />
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.kicker}>{isHebrew ? 'הזמנות קבוצתיות' : 'Group ordering'}</Text>
          <Text style={styles.title}>{isHebrew ? 'בחר חנות, הוסף מוצרים, ושלם רק על מה שאתה מזמין.' : 'Choose a store, add products, and pay only for what you order.'}</Text>
          <Text style={styles.subtitle}>
            {isHebrew
              ? 'Shakana נשארת כמו ה-flow הטוב: H&M, Zara ו-Amazon, מוצרים אמיתיים, סל קבוצתי, קישור הזמנה, טיימר, ואז משלוח זול יותר.'
              : 'Shakana keeps the good flow: H&M, Zara, and Amazon, real products, a group cart, invite link, timer close, and cheaper shared delivery.'}
          </Text>
        </View>

        <BuildingSections
          orders={orders}
          onOpenStore={() => openUserDemo()}
          onOpenLogin={() => router.push('/login')}
          onChooseBrand={(brand) => openUserDemo(brand)}
        />

        <DemoVideoPreview />

        <View style={styles.storeStrip}>
          {(['hm', 'zara', 'amazon'] as DemoBrandId[]).map((brand) => (
            <DemoButton
              key={brand}
              label={`${isHebrew ? 'פתח' : 'Open'} ${demoStores[brand].name}`}
              onPress={() => openUserDemo(brand)}
              tone={brand === 'hm' ? 'accent' : 'light'}
              style={styles.storeBtn}
            />
          ))}
        </View>

        <View style={styles.grid}>
          <Card style={styles.card}>
            <SectionTitle title={isHebrew ? 'כניסה' : 'Sign in'} kicker={isHebrew ? 'מסלול אמיתי' : 'Real auth'} />
            <Text style={styles.helper}>
              {isHebrew
                ? 'התחבר עם Google או טלפון. אחרי הכניסה הפרופיל נוצר אוטומטית ואתה ממשיך למסך החנויות והמוצרים.'
                : 'Sign in with Google or phone. After auth, your profile is created automatically and you continue into stores and products.'}
            </Text>
            <View style={styles.buttonStack}>
              <DemoButton
                label={googleSignIn.isPending ? (isHebrew ? 'פותח את Google...' : 'Opening Google...') : (isHebrew ? 'המשך עם Google' : 'Continue with Google')}
                onPress={() => googleSignIn.mutate()}
                tone="accent"
              />
              <DemoButton label={isHebrew ? 'המשך עם טלפון' : 'Continue with phone'} onPress={() => router.push('/(auth)/phone')} tone="light" />
            </View>
          </Card>

          <Card style={styles.card}>
            <SectionTitle title={isHebrew ? 'תשלום וחיסכון' : 'Payment and savings'} kicker={isHebrew ? 'עמלה לפי חיסכון' : 'Commission by savings'} />
            <Text style={styles.helper}>
              {isHebrew
                ? 'כל משתמש משלם בנפרד כשהוא מוסיף מוצר. אחרי שההזמנה נסגרת, Shakana מרכזת את הכסף, שולחת את ההזמנה לכתובת, והעמלה יכולה להיות חלק מהחיסכון בפועל.'
                : 'Each user pays separately when adding a product. Once the timer closes, Shakana collects the order, sends it to the delivery address, and the fee can be based on real savings.'}
            </Text>
            <View style={styles.savingsBox}>
              <Text style={styles.savingsValue}>₪30 → ₪15</Text>
              <Text style={styles.savingsLabel}>{isHebrew ? 'חיסכון לדוגמה ועמלת Shakana' : 'Example saved amount and Shakana fee'}</Text>
            </View>
          </Card>
        </View>

        <Card style={styles.noteCard}>
          <Text style={styles.noteTitle}>{isHebrew ? 'לא נוגעים ב-flow של המוצרים' : 'Product flow stays intact'}</Text>
          <Text style={styles.noteBody}>
            {isHebrew
              ? 'המסך הזה רק מכניס אותך לחנויות. בתוך /user עדיין יש מוצרים, וריאציות, add to group cart וקישור הזמנה לשיתוף.'
              : 'This screen only leads into the stores. Inside /user you still have products, variants, add to group cart, and the invite link.'}
          </Text>
        </Card>
      </DemoPage>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F8F4EE',
  },
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
    color: colors.gold,
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  smallBtn: {
    width: 150,
    minHeight: 40,
  },
  hero: {
    gap: 10,
    paddingTop: 18,
    paddingBottom: 2,
  },
  kicker: {
    color: colors.gold,
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.tx,
    fontFamily: fontFamily.display,
    fontSize: 42,
    lineHeight: 46,
    maxWidth: 840,
  },
  subtitle: {
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 18,
    lineHeight: 28,
    maxWidth: 760,
  },
  storeStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  storeBtn: {
    minWidth: 170,
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
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 23,
  },
  buttonStack: {
    gap: 10,
  },
  savingsBox: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.goldLight,
    borderWidth: 1,
    borderColor: '#E2C7B5',
    gap: 4,
  },
  savingsValue: {
    color: colors.tx,
    fontFamily: fontFamily.display,
    fontSize: 30,
  },
  savingsLabel: {
    color: colors.mu,
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
  },
  noteCard: {
    gap: 8,
  },
  noteTitle: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
  },
  noteBody: {
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
});
