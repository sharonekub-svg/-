import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useAuthStore } from '@/stores/authStore';
import { useProfile } from '@/api/profile';
import { useUserOrders } from '@/api/orders';
import { formatAgorot } from '@/utils/format';
import { formatCompactDuration } from '@/utils/timer';
import { useLocale } from '@/i18n/locale';

const SHOPPING_FLOWS = [
  {
    id: 'choose-store',
    enName: 'Choose a store',
    heName: 'הדבק כל קישור',
    enNote: 'Start from the Shakana menu with H&M, Zara, Amazon and more.',
    heNote: 'Shakana מזהה את החנות אוטומטית לפי הדומיין.',
    enCategory: 'Fashion',
    heCategory: 'אופנה',
    tone: '#B86B4B',
    image: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'pick-product',
    enName: 'Pick products',
    heName: 'קריאת מוצר אוטומטית',
    enNote: 'Choose product, size, color and quantity inside the app.',
    heNote: 'מחפש שם מוצר, תמונה, מחיר, SKU ומבצעים.',
    enCategory: 'Product',
    heCategory: 'מוצר',
    tone: '#C98F5B',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'shared-cart',
    enName: 'Shared cart',
    heName: 'סל משותף',
    enNote: 'Friends join by link and add their own items before the timer ends.',
    heNote: 'חברים מצטרפים בקישור ומוסיפים פריטים לפני שהטיימר מסתיים.',
    enCategory: 'Cart',
    heCategory: 'סל',
    tone: '#211D19',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80',
  },
];

const CATEGORY_CHIPS = [
  { enName: 'Fashion', heName: 'אופנה', enDetail: 'Clothes, shoes, sizes and color choices.', heDetail: 'בגדים, נעליים, מידות וצבעים.' },
  { enName: 'Beauty', heName: 'טיפוח', enDetail: 'Care products, makeup and pharmacy essentials.', heDetail: 'טיפוח, איפור ומוצרי פארם.' },
  { enName: 'Home', heName: 'בית', enDetail: 'Home goods, cleaning, kitchen and decor.', heDetail: 'בית, ניקיון, מטבח ועיצוב.' },
  { enName: 'Kids', heName: 'ילדים', enDetail: 'Kids clothes, toys and school basics.', heDetail: 'בגדי ילדים, צעצועים וציוד לימודים.' },
  { enName: 'Electronics', heName: 'אלקטרוניקה', enDetail: 'Gadgets, chargers and building tech buys.', heDetail: 'גאדג׳טים, מטענים וקניות טכנולוגיה.' },
  { enName: 'Grocery', heName: 'סופר', enDetail: 'Food, pantry and shared delivery orders.', heDetail: 'אוכל, מזווה והזמנות משלוח משותפות.' },
];

function HomeMark() {
  return (
    <View style={styles.markWrap}>
      <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
        <Rect x="2" y="2" width="24" height="24" rx="12" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
        <Path d="M7.5 9.5h13" stroke={colors.white} strokeWidth="1.8" strokeLinecap="round" />
        <Path d="M7.5 18.5h13" stroke={colors.white} strokeWidth="1.8" strokeLinecap="round" />
        <Line x1="14" y1="5.5" x2="14" y2="22.5" stroke={colors.white} strokeWidth="1.5" strokeLinecap="round" />
        <Circle cx="14" cy="14" r="3.2" stroke={colors.white} strokeWidth="1.5" />
      </Svg>
    </View>
  );
}

function FeaturedCard({
  name,
  note,
  image,
  tone,
  onPress,
}: {
  name: string;
  note: string;
  image: string;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.featureCard, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={styles.featureImageWrap}>
        <ImageBackground source={{ uri: image }} style={styles.featureImage} imageStyle={styles.featureImageRadius}>
          <View style={[styles.featureChip, { backgroundColor: tone }]}>
            <Text style={styles.featureChipText}>{name.slice(0, 1)}</Text>
          </View>
        </ImageBackground>
      </View>
      <View style={styles.featureBody}>
        <Text style={styles.featureName}>{name}</Text>
        <Text style={styles.featureNote}>{note}</Text>
      </View>
    </Pressable>
  );
}

function OrderCard({
  title,
  subtitle,
  status,
  meta,
  actionLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  status: string;
  meta: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.orderCard, pressed && { transform: [{ scale: 0.99 }] }]}>
      <View style={styles.orderTopRow}>
        <View style={styles.orderBadge}>
          <Text style={styles.orderBadgeText}>ORD</Text>
        </View>
        <View style={styles.orderStatus}>
          <Text style={styles.orderStatusText}>{status}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.orderTitle}>
        {title}
      </Text>
      <Text numberOfLines={1} style={styles.orderSubtitle}>
        {subtitle}
      </Text>
      <View style={styles.orderFooter}>
        <Text style={styles.orderMeta}>{meta}</Text>
        <Text style={styles.orderAction}>{actionLabel}</Text>
      </View>
    </Pressable>
  );
}

export default function BuildingTab() {
  const router = useRouter();
  const { language, t } = useLocale();
  const isHebrew = language === 'he';
  const homeCopy = isHebrew
    ? {
        smartFlow: 'זרימת הזמנה חכמה',
        anyStore: 'קישור מכל חנות',
        order: 'הזמנה',
        seats: 'מקומות',
      }
    : {
        smartFlow: 'Smart order flow',
        anyStore: 'Menu stores',
        order: 'Order',
        seats: 'seats',
      };
  const user = useAuthStore((s) => s.user);
  const { data: profile } = useProfile(user?.id);
  const { data: orders = [] } = useUserOrders(user?.id);

  const first = profile?.first_name ?? '';
  const completedOrders = orders.filter((order) => order.status === 'completed').length;
  const openOrders = orders.filter((order) => !['completed', 'cancelled'].includes(order.status));
  const topOrders = orders.slice(0, 3);
  const orderMeta = (order: (typeof orders)[number]) => {
    const timing = order.closes_at
      ? `${isHebrew ? 'נסגר בעוד' : 'closes in'} ${formatCompactDuration(Math.max(0, new Date(order.closes_at).getTime() - Date.now()))}`
      : isHebrew ? 'ללא טיימר' : 'No timer';
    return `${formatAgorot(order.product_price_agorot)} · ${timing}`;
  };
  const dashboardStats = [
    { value: String(openOrders.length), label: t('tabs.home.openOrders'), featured: true },
    { value: String(completedOrders), label: t('tabs.home.completed') },
    { value: String(topOrders.length), label: isHebrew ? 'הזמנות מוכנות' : 'Ready orders' },
    { value: '1', label: isHebrew ? 'שיתוף עובד' : 'Share flow' },
  ];
  return (
    <ScreenBase padded={false} safeEdges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.shell}>
          <View style={styles.topBar}>
            <View style={styles.brandBlock}>
              <HomeMark />
              <View style={{ flex: 1 }}>
                <Text style={styles.brandTag}>SHAKANA</Text>
                <Text style={styles.brandTitle}>{t('tabs.home.title')}</Text>
              </View>
            </View>
          <Pressable style={styles.topAction} onPress={() => router.push('/(tabs)/account' as never)}>
              <Text style={styles.topActionText}>{t('tabs.home.profile')}</Text>
            </Pressable>
          </View>

          <View style={styles.heroCard}>
            <ImageBackground
              source={{
                uri: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1600&q=80',
              }}
              style={styles.heroImage}
              imageStyle={styles.heroImageRadius}
            >
              <View style={styles.heroOverlay} />
              <View style={styles.heroContent}>
                <Text style={styles.heroKicker}>{t('tabs.home.promoted')}</Text>
                <Text style={styles.heroTitle}>{t('tabs.home.heroTitle')}</Text>
                <Text style={styles.heroBody}>
                  {profile ? t('tabs.home.heroSigned', { first: first ? `, ${first}` : '' }) : t('tabs.home.heroGuest')}
                </Text>
                <Pressable style={styles.heroButton} onPress={() => router.push('/order/new')}>
                  <Text style={styles.heroButtonText}>{t('tabs.home.createOrder')}</Text>
                </Pressable>
              </View>
            </ImageBackground>
          </View>

          <View style={styles.statsRow}>
            {dashboardStats.map((stat) => (
              <View key={stat.label} style={[styles.statCard, stat.featured && styles.statCardFeatured]}>
                <Text style={[styles.statValue, stat.featured && styles.statValueFeatured]}>{stat.value}</Text>
                <Text style={[styles.statLabel, stat.featured && styles.statLabelFeatured]}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {CATEGORY_CHIPS.map((category, index) => (
              <Pressable
                key={category.enName}
                style={[styles.categoryChip, index === 0 && styles.categoryChipActive]}
                onPress={() => router.push(`/order/new?store=${encodeURIComponent(category.enName.toLowerCase())}`)}
              >
                <Text style={[styles.categoryChipText, index === 0 && styles.categoryChipTextActive]}>
                  {isHebrew ? category.heName : category.enName}
                </Text>
                <Text style={[styles.categoryChipDetail, index === 0 && styles.categoryChipDetailActive]}>
                  {isHebrew ? category.heDetail : category.enDetail}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{homeCopy.smartFlow}</Text>
            <Text style={styles.sectionLink}>{homeCopy.anyStore}</Text>
          </View>

          <View style={styles.featureGrid}>
            {SHOPPING_FLOWS.map((store) => (
              <FeaturedCard
                key={store.id}
                name={isHebrew ? store.heName : store.enName}
                note={isHebrew ? store.heNote : store.enNote}
                image={store.image}
                tone={store.tone}
                onPress={() => router.push('/order/new')}
              />
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('tabs.home.recent')}</Text>
            <Text style={styles.sectionLink}>{t('common.recommended')}</Text>
          </View>

          <View style={styles.ordersList}>
            {topOrders.length > 0 ? (
              topOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  title={order.product_title ?? t('tabs.home.noOrdersTitle')}
                  subtitle={order.product_url}
                  status={order.status.toUpperCase()}
                  meta={orderMeta(order)}
                  actionLabel={isHebrew ? 'פתח' : 'OPEN'}
                  onPress={() => router.push(`/order/${order.id}`)}
                />
              ))
            ) : (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>{t('tabs.home.noOrdersTitle')}</Text>
                <Text style={styles.emptyBody}>{t('tabs.home.noOrdersBody')}</Text>
                <Pressable style={styles.emptyButton} onPress={() => router.push('/order/new')}>
                  <Text style={styles.emptyButtonText}>{t('common.newOrder')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 28,
  },
  shell: {
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 18,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  markWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.acc,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.acc,
    ...shadow.card,
  },
  brandTag: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.acc,
  },
  brandTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    color: colors.tx,
    lineHeight: 28,
  },
  topAction: {
    paddingHorizontal: 14,
    height: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glass,
  },
  topActionText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.tx,
  },
  heroCard: {
    borderRadius: radii.xxl,
    overflow: 'hidden',
    backgroundColor: colors.lime,
    ...shadow.card,
  },
  heroImage: {
    minHeight: 320,
    justifyContent: 'flex-end',
  },
  heroImageRadius: {
    borderRadius: radii.xxl,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 25, 23, 0.52)',
  },
  heroContent: {
    padding: 18,
    gap: 10,
  },
  heroKicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 2.4,
    color: 'rgba(255,255,255,0.75)',
  },
  heroTitle: {
    fontFamily: fontFamily.display,
    fontSize: 32,
    lineHeight: 36,
    color: colors.white,
    maxWidth: 260,
  },
  heroBody: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.85)',
    maxWidth: 320,
  },
  heroButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    height: 46,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButtonText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.white,
  },
  categoryRow: {
    gap: 8,
    paddingRight: 4,
  },
  categoryChip: {
    width: 164,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.white,
  },
  categoryChipActive: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  categoryChipText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    color: colors.tx,
  },
  categoryChipTextActive: {
    color: colors.navy,
  },
  categoryChipDetail: {
    marginTop: 4,
    fontFamily: fontFamily.body,
    fontSize: 10,
    lineHeight: 14,
    color: colors.mu,
  },
  categoryChipDetailActive: {
    color: colors.tx,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    color: colors.tx,
  },
  sectionLink: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.acc,
  },
  featureGrid: {
    flexDirection: 'row',
    gap: 14,
    width: '100%',
  },
  featureCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 26,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    overflow: 'hidden',
    ...shadow.card,
  },
  featureImageWrap: {
    padding: 8,
  },
  featureImage: {
    height: 190,
    justifyContent: 'space-between',
    borderRadius: 22,
    overflow: 'hidden',
  },
  featureImageRadius: {
    borderRadius: 22,
  },
  featureChip: {
    alignSelf: 'flex-start',
    margin: 10,
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureChipText: {
    color: colors.white,
    fontFamily: fontFamily.display,
    fontSize: 16,
    lineHeight: 18,
  },
  featureBody: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    gap: 4,
  },
  featureName: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 17,
    color: colors.tx,
  },
  featureNote: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: colors.grn,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    ...shadow.card,
  },
  statCardFeatured: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  statValue: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    color: colors.tx,
    lineHeight: 28,
  },
  statLabel: {
    marginTop: 8,
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.mu,
    textTransform: 'uppercase',
  },
  statValueFeatured: {
    color: colors.navy,
  },
  statLabelFeatured: {
    color: colors.acc,
  },
  ordersList: {
    gap: 12,
  },
  orderCard: {
    padding: 16,
    borderRadius: 26,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    gap: 8,
    ...shadow.card,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderBadge: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.acc,
  },
  orderBadgeText: {
    color: colors.white,
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  orderStatus: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: colors.accLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderStatusText: {
    color: colors.acc,
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  orderTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 18,
    color: colors.tx,
  },
  orderSubtitle: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: colors.mu,
  },
  orderFooter: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderMeta: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: colors.grn,
  },
  orderAction: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.acc,
  },
  emptyBlock: {
    padding: 18,
    borderRadius: 26,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    gap: 10,
    ...shadow.card,
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: colors.tx,
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.mu,
  },
  emptyButton: {
    alignSelf: 'flex-start',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.white,
  },
});
