import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BrandPill,
  Card,
  CelebrationBanner,
  DemoButton,
  DemoPage,
  EmptyNotice,
  ProgressBar,
  SavingsPanel,
  SavingsTracker,
  SectionTitle,
  TimerRing,
  StatusRail,
  demoStyles,
} from '@/components/demo/DemoPrimitives';
import { FREE_SHIPPING_GOAL, demoStores } from '@/demo/catalog';
import {
  getGoalProgress,
  getGroupSavings,
  getOrderItemCount,
  getOrderTotal,
  initDemoCommerceSync,
  useDemoCommerceStore,
} from '@/stores/demoCommerceStore';
import { fontFamily } from '@/theme/fonts';
import { colors } from '@/theme/tokens';

export default function StoreDashboardScreen() {
  const router = useRouter();
  const orders = useDemoCommerceStore((state) => state.orders);
  const lastPulse = useDemoCommerceStore((state) => state.lastPulse);
  const setDemoRole = useDemoCommerceStore((state) => state.setDemoRole);
  const activeParticipantId = useDemoCommerceStore((state) => state.activeParticipantId);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    initDemoCommerceSync();
    setDemoRole('store');
  }, [setDemoRole]);

  useEffect(() => {
    const interval = globalThis.setInterval(() => setNowMs(Date.now()), 1000);
    return () => globalThis.clearInterval(interval);
  }, []);

  const activeOrders = orders.filter((order) => order.status !== 'Shipped');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <DemoPage wide>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.logo}>Agent M</Text>
            <Text style={styles.title}>Merchant dashboard</Text>
          </View>
          <View style={styles.topActions}>
            <DemoButton label="User view" onPress={() => router.push('/user')} tone="light" style={styles.smallBtn} />
            <DemoButton label="Login" onPress={() => router.push('/login')} tone="light" style={styles.smallBtn} />
          </View>
        </View>

        <CelebrationBanner pulse={lastPulse} />
        <View style={styles.metricsGrid}>
          <Metric label="Incoming orders" value={String(activeOrders.length)} />
          <Metric
            label="Total GMV"
            value={`₪${orders.reduce((total, order) => total + getOrderTotal(order), 0)}`}
          />
          <Metric
            label="Items to pick"
            value={String(activeOrders.reduce((total, order) => total + getOrderItemCount(order), 0))}
          />
          <Metric
            label="Group savings"
            value={`₪${Math.round(orders.reduce((total, order) => total + getGroupSavings(order), 0))}`}
          />
        </View>

        <SectionTitle title="Live incoming group orders" kicker="Wolt Merchant style" />
        {orders.length === 0 ? (
          <EmptyNotice
            title="No group orders yet"
            body="Open the user demo, choose H&M or Zara, and create a group order. It will appear here instantly."
          />
        ) : (
          <View style={styles.orderList}>
            {orders.map((order) => {
              const store = demoStores[order.brand];
              const progress = getGoalProgress(order);
              const minutesLeft = Math.max(0, Math.ceil((order.closesAt - Date.now()) / 60000));
              return (
                <Pressable
                  key={order.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/store/orders/${order.id}`)}
                  style={({ pressed }) => [styles.orderCard, pressed && demoStyles.pressed]}
                >
                  <View style={styles.orderHeader}>
                    <View style={styles.brandHeader}>
                      <BrandPill brand={order.brand} />
                      <View>
                        <Text style={styles.orderId}>{order.id}</Text>
                        <Text style={styles.muted}>{store.name} | {minutesLeft} min left</Text>
                      </View>
                    </View>
                    <View style={styles.orderHeaderRight}>
                      <TimerRing
                        remainingMs={Math.max(0, order.closesAt - nowMs)}
                        totalMs={15 * 60 * 1000}
                        label="left"
                      />
                      <Text style={[styles.statusBadge, { borderColor: store.accent }]}>{order.status}</Text>
                    </View>
                  </View>
                  <View style={styles.orderStats}>
                    <Stat label="Participants" value={String(order.participants.length)} />
                    <Stat label="Items" value={String(getOrderItemCount(order))} />
                    <Stat label="Total" value={`₪${getOrderTotal(order)}`} />
                    <Stat label="Goal" value={`${progress}%`} />
                  </View>
                  <ProgressBar progress={progress} accent={store.accent} />
                  <Text style={styles.muted}>
                    ₪{getOrderTotal(order)} / ₪{FREE_SHIPPING_GOAL} toward free shipping. Group saved ₪{Math.round(getGroupSavings(order))} on delivery.
                  </Text>
                  <StatusRail status={order.status} />
                </Pressable>
              );
            })}
          </View>
        )}

        {orders[0] ? <SavingsPanel order={orders[0]} compact /> : null}
        <SavingsTracker orders={orders} activeParticipantId={activeParticipantId} />
      </DemoPage>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  topActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallBtn: { width: 140, minHeight: 40 },
  logo: {
    color: colors.acc,
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.tx,
    fontFamily: fontFamily.display,
    fontSize: 40,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metric: {
    flexGrow: 1,
    flexBasis: 190,
  },
  metricValue: {
    color: colors.tx,
    fontFamily: fontFamily.display,
    fontSize: 32,
  },
  orderList: { gap: 12 },
  orderCard: {
    gap: 14,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  brandHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orderHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderId: { color: colors.tx, fontFamily: fontFamily.bodyBold, fontSize: 18 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
  },
  orderStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    flexGrow: 1,
    flexBasis: 120,
    borderRadius: 18,
    backgroundColor: colors.s2,
    padding: 12,
  },
  statValue: { color: colors.tx, fontFamily: fontFamily.bodyBold, fontSize: 20 },
  statLabel: { color: colors.mu, fontFamily: fontFamily.body, fontSize: 12 },
  muted: { color: colors.mu, fontFamily: fontFamily.body, fontSize: 14, lineHeight: 21 },
});
