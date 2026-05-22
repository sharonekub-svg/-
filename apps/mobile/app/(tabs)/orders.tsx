import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { EmptyState } from '@/components/primitives/EmptyState';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useAuthStore } from '@/stores/authStore';
import { useUserOrders } from '@/api/orders';
import { formatAgorot } from '@/utils/format';
import { formatCompactDuration } from '@/utils/timer';
import { track } from '@/lib/posthog';
import { useLocale } from '@/i18n/locale';

function OrdersMark() {
  return (
    <Svg width={46} height={46} viewBox="0 0 46 46" fill="none">
      <Rect x="2" y="2" width="42" height="42" rx="16" fill={colors.acc} />
      <Path d="M14 18h18l-2 11H17l-3-15h-4" stroke={colors.white} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M19 14c1.2-3 6.8-3 8 0" stroke={colors.white} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx="19" cy="34" r="2.2" fill={colors.white} />
      <Circle cx="29" cy="34" r="2.2" fill={colors.white} />
      <Path d="M18 23h10" stroke={colors.white} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export default function OrdersTab() {
  const router = useRouter();
  const { language, t } = useLocale();
  const user = useAuthStore((s) => s.user);
  const { data: orders = [], isLoading } = useUserOrders(user?.id);
  const openOrders = orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
  const completedOrders = orders.filter((order) => order.status === 'completed').length;
  const orderTimingLabel = (closesAt?: string | null) => {
    if (!closesAt) return language === 'he' ? 'ללא טיימר' : 'No timer';
    const remaining = new Date(closesAt).getTime() - Date.now();
    return remaining > 0
      ? `${language === 'he' ? 'נסגר בעוד' : 'closes in'} ${formatCompactDuration(remaining)}`
      : language === 'he' ? 'הטיימר הסתיים' : 'timer ended';
  };

  const STATUS_LABEL: Record<string, Record<string, string>> = {
    open: { he: 'פתוחה', en: 'OPEN' },
    locked: { he: 'נעולה', en: 'LOCKED' },
    paying: { he: 'תשלום', en: 'PAYING' },
    escrow: { he: 'נאמנות', en: 'ESCROW' },
    delivered: { he: 'נמסר', en: 'DELIVERED' },
    completed: { he: 'הושלם', en: 'DONE' },
    cancelled: { he: 'בוטל', en: 'CANCELLED' },
  };
  const statusLabel = (s: string) => STATUS_LABEL[s]?.[language] ?? s.toUpperCase();
  const stats = [
    { label: t('tabs.home.openOrders'), value: String(openOrders), featured: true },
    { label: t('tabs.home.completed'), value: String(completedOrders) },
    { label: language === 'he' ? 'קישורי שיתוף' : 'Invite links', value: '1' },
  ];

  const newOrder = () => {
    track('start_order_clicked');
    router.push('/order/new');
  };

  return (
    <ScreenBase padded={false} safeEdges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.logoBubble}>
            <OrdersMark />
          </View>
          <View>
            <Text style={styles.kicker}>SHAKANA</Text>
            <Text style={styles.title}>{t('tabs.orders.title')}</Text>
          </View>
        </View>
        <Pressable onPress={newOrder} style={styles.newBtn} accessibilityRole="button">
          <Text style={styles.newBtnText}>{t('tabs.orders.newOrder')}</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={[styles.statCard, stat.featured && styles.statCardFeatured]}>
            <Text style={[styles.statValue, stat.featured && styles.statValueFeatured]}>{stat.value}</Text>
            <Text style={[styles.statLabel, stat.featured && styles.statLabelFeatured]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {isLoading || orders.length === 0 ? (
        <EmptyState
          badge="ORD"
          title={t('tabs.orders.noOrdersTitle')}
          subtitle={t('tabs.orders.noOrdersBody')}
          cta={t('tabs.orders.newOrder')}
          onCta={newOrder}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { transform: [{ scale: 0.99 }] }]}
              onPress={() => router.push(`/order/${item.id}`)}
              accessibilityRole="button"
            >
              <View style={styles.rowTop}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{(item.store_label ?? 'ORD').slice(0, 3).toUpperCase()}</Text>
                </View>
                {item.store_label ? (
                  <Text style={styles.storeName} numberOfLines={1}>{item.store_label}</Text>
                ) : null}
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
                </View>
              </View>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.product_title ?? item.product_url}
              </Text>
              <Text style={styles.rowSub}>
                {formatAgorot(item.product_price_agorot)} · {orderTimingLabel(item.closes_at)}
                {item.estimated_shipping_agorot ? ` · ${formatAgorot(item.estimated_shipping_agorot)} ${language === 'he' ? 'משלוח' : 'shipping'}` : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  statCard: {
    flex: 1,
    minHeight: 84,
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    justifyContent: 'space-between',
    ...shadow.card,
  },
  statCardFeatured: {
    backgroundColor: colors.acc,
    borderColor: colors.acc,
  },
  statValue: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 28,
    color: colors.tx,
  },
  statValueFeatured: {
    color: colors.white,
  },
  statLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.mu,
    textTransform: 'uppercase',
  },
  statLabelFeatured: {
    color: 'rgba(237,244,239,0.85)',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logoBubble: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.acc,
    borderWidth: 1,
    borderColor: colors.acc,
    ...shadow.cta,
  },
  kicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.acc,
    marginBottom: 4,
  },
  title: { fontFamily: fontFamily.display, fontSize: 26, color: colors.tx },
  newBtn: {
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.cta,
  },
  newBtnText: { color: colors.white, fontSize: 12, fontFamily: fontFamily.bodyBold, letterSpacing: 1.2 },
  row: {
    backgroundColor: colors.white,
    borderRadius: 26,
    padding: 16,
    borderColor: colors.br,
    borderWidth: 1,
    gap: 8,
    ...shadow.card,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.br,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardSoft,
  },
  badgeText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.tx,
  },
  storeName: {
    flex: 1,
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    color: colors.mu,
    paddingHorizontal: 6,
  },
  statusPill: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.accLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.acc,
  },
  rowTitle: { fontFamily: fontFamily.bodyBold, fontSize: 16, color: colors.tx },
  rowSub: { fontFamily: fontFamily.body, fontSize: 13, color: colors.mu },
});
