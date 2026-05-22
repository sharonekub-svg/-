import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/demo/DemoPrimitives';
import { demoStores } from '@/demo/catalog';
import { fontFamily } from '@/theme/fonts';
import { colors, radii, shadow } from '@/theme/tokens';
import {
  getOrderItemCount,
  getOrderTotal,
  type DemoOrder,
} from '@/stores/demoCommerceStore';

const SHOPPING_FLOWS = [
  {
    id: 'pick-product',
    name: 'Pick from menu',
    note: 'Choose products directly inside the Shakana app.',
    category: 'Fashion',
    tone: '#B86B4B',
    image: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'pay-timer',
    name: 'Pay and wait',
    note: 'Pay for your item while the timer keeps the group order organized.',
    category: 'Product',
    tone: '#C98F5B',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'delivery-drop',
    name: 'Delivery drops',
    note: 'The order is sent and everyone shares cheaper delivery.',
    category: 'Cart',
    tone: '#211D19',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80',
  },
];

const CATEGORY_CHIPS = [
  { label: 'Fashion', detail: 'Clothes, shoes, sizes and color choices.', brand: 'hm' as const },
  { label: 'Beauty', detail: 'Care products, makeup and pharmacy essentials.', brand: 'zara' as const },
  { label: 'Home', detail: 'Home goods, cleaning, kitchen and decor.', brand: 'hm' as const },
  { label: 'Kids', detail: 'Kids clothes, toys and school basics.', brand: 'amazon' as const },
  { label: 'Electronics', detail: 'Gadgets, chargers and tech buys.', brand: 'amazon' as const },
  { label: 'Grocery', detail: 'Food, pantry and shared delivery orders.', brand: 'hm' as const },
];

function HomeMark() {
  return (
    <View style={styles.markWrap}>
      <Text style={styles.markLetter}>S</Text>
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
      <Text numberOfLines={1} style={styles.orderTitle}>{title}</Text>
      <Text numberOfLines={1} style={styles.orderSubtitle}>{subtitle}</Text>
      <View style={styles.orderFooter}>
        <Text style={styles.orderMeta}>{meta}</Text>
        <Text style={styles.orderAction}>{actionLabel}</Text>
      </View>
    </Pressable>
  );
}

export function BuildingSections({
  orders,
  onOpenStore,
  onOpenLogin,
  onChooseBrand,
}: {
  orders: DemoOrder[];
  onOpenStore: () => void;
  onOpenLogin: () => void;
  onChooseBrand: (brand: 'hm' | 'zara' | 'amazon') => void;
}) {
  const openOrders = orders.filter((order) => order.status !== 'Shipped');
  const completedOrders = orders.filter((order) => order.status === 'Shipped').length;
  const topOrders = orders.slice(0, 3);
  const heroImage = demoStores.hm.heroImage;

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <View style={styles.brandBlock}>
          <HomeMark />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTag}>SHAKANA</Text>
            <Text style={styles.brandTitle}>Smart order flow</Text>
          </View>
        </View>
        <Pressable style={styles.topAction} onPress={onOpenLogin}>
          <Text style={styles.topActionText}>Login</Text>
        </Pressable>
      </View>

      <Card style={styles.heroCard}>
        <ImageBackground source={{ uri: heroImage }} style={styles.heroImage} imageStyle={styles.heroImageRadius}>
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.heroKicker}>Promoted flow</Text>
            <Text style={styles.heroTitle}>Pick products from the menu, pay, then get cheaper shared delivery.</Text>
            <Text style={styles.heroBody}>
              The demo shows a product menu, payment, timer close, sent order, and delivery savings.
            </Text>
            <Pressable style={styles.heroButton} onPress={onOpenStore}>
              <Text style={styles.heroButtonText}>Open order flow</Text>
            </Pressable>
          </View>
        </ImageBackground>
      </Card>

      <View style={styles.statsRow}>
        {[
          { value: String(openOrders.length), label: 'Open orders', featured: true },
          { value: String(completedOrders), label: 'Completed' },
          { value: String(topOrders.length), label: 'Ready orders' },
          { value: '1', label: 'Share flow' },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, stat.featured && styles.statCardFeatured]}>
            <Text style={[styles.statValue, stat.featured && styles.statValueFeatured]}>{stat.value}</Text>
            <Text style={[styles.statLabel, stat.featured && styles.statLabelFeatured]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {CATEGORY_CHIPS.map((category, index) => (
          <Pressable
            key={category.label}
            style={[styles.categoryChip, index === 0 && styles.categoryChipActive]}
            onPress={() => onChooseBrand(category.brand)}
          >
            <Text style={[styles.categoryChipText, index === 0 && styles.categoryChipTextActive]}>{category.label}</Text>
            <Text style={[styles.categoryChipDetail, index === 0 && styles.categoryChipDetailActive]}>{category.detail}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Smart order flow</Text>
        <Text style={styles.sectionLink}>Menu stores</Text>
      </View>

      <View style={styles.featureGrid}>
        {SHOPPING_FLOWS.map((flow, index) => (
          <FeaturedCard
            key={flow.id}
            name={flow.name}
            note={flow.note}
            image={flow.image}
            tone={flow.tone}
            onPress={() => onChooseBrand(index === 0 ? 'hm' : index === 1 ? 'zara' : 'amazon')}
          />
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent</Text>
        <Text style={styles.sectionLink}>Recommended</Text>
      </View>

      <View style={styles.ordersList}>
        {topOrders.length > 0 ? (
          topOrders.map((order) => (
            <OrderCard
              key={order.id}
              title={`Order ${order.id}`}
              subtitle={`${order.brand.toUpperCase()} · ${getOrderItemCount(order)} items`}
              status={order.status.toUpperCase()}
              meta={`${getOrderTotal(order)} ₪ · ${order.participants.length} seats`}
              actionLabel="OPEN"
              onPress={onOpenStore}
            />
          ))
        ) : (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyBody}>Create a group order and the recent list will fill here live.</Text>
            <Pressable style={styles.emptyButton} onPress={onOpenStore}>
              <Text style={styles.emptyButtonText}>New order</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gold,
    ...shadow.card,
  },
  markLetter: {
    color: colors.white,
    fontFamily: fontFamily.bodyBold,
    fontSize: 18,
  },
  brandTag: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.gold,
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
    backgroundColor: colors.goldLight,
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
    maxWidth: 300,
  },
  heroBody: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.85)',
    maxWidth: 340,
  },
  heroButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    height: 46,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.tx,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButtonText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.white,
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
    backgroundColor: colors.goldLight,
    borderColor: colors.goldLight,
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
    color: colors.tx,
  },
  statLabelFeatured: {
    color: colors.tx,
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
    backgroundColor: colors.goldLight,
    borderColor: colors.goldLight,
  },
  categoryChipText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    color: colors.tx,
  },
  categoryChipTextActive: {
    color: colors.tx,
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
    color: colors.tx,
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
    color: colors.mu,
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
    backgroundColor: colors.gold,
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
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderStatusText: {
    color: colors.tx,
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
    color: colors.mu,
  },
  orderAction: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.tx,
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
    backgroundColor: colors.tx,
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
