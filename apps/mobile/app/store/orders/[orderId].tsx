import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BrandPill,
  Card,
  CelebrationBanner,
  DemoButton,
  DemoPage,
  EmptyNotice,
  SavingsPanel,
  SavingsTracker,
  SectionTitle,
  TimerRing,
  StatusRail,
} from '@/components/demo/DemoPrimitives';
import { demoStores } from '@/demo/catalog';
import {
  demoParticipants,
  getMasterPickingList,
  getOrderItemCount,
  getOrderTotal,
  getProductLine,
  initDemoCommerceSync,
  useDemoCommerceStore,
  type OrderStatus,
} from '@/stores/demoCommerceStore';
import { fontFamily } from '@/theme/fonts';

export default function StoreOrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orders = useDemoCommerceStore((state) => state.orders);
  const updateStatus = useDemoCommerceStore((state) => state.updateStatus);
  const setDemoRole = useDemoCommerceStore((state) => state.setDemoRole);
  const lastPulse = useDemoCommerceStore((state) => state.lastPulse);
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

  const order = orders.find((candidate) => candidate.id === params.orderId);

  if (!order) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <DemoPage wide>
          <DemoButton label="Back to dashboard" onPress={() => router.replace('/store')} tone="light" style={styles.backBtn} />
          <EmptyNotice
            title="Order not found"
            body="The group order may have been reset. Return to the dashboard or create a new user order."
          />
        </DemoPage>
      </ScrollView>
    );
  }

  const store = demoStores[order.brand];
  const pickingList = getMasterPickingList(order);
  const statuses: OrderStatus[] = ['Accepted', 'Packing', 'Ready', 'Shipped'];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <DemoPage wide>
        <View style={styles.topBar}>
          <View style={styles.brandHeader}>
            <BrandPill brand={order.brand} />
            <View>
              <Text style={styles.title}>{order.id}</Text>
              <Text style={styles.muted}>{store.name} consolidated group order</Text>
            </View>
          </View>
          <View style={styles.topActions}>
            <DemoButton label="Dashboard" onPress={() => router.push('/store')} tone="light" style={styles.backBtn} />
            <DemoButton label="User view" onPress={() => router.push('/user')} tone="light" style={styles.backBtn} />
          </View>
        </View>

        <CelebrationBanner pulse={lastPulse} />
        <Card style={styles.summary}>
          <View style={styles.summaryGrid}>
            <Metric label="Status" value={order.status} />
            <Metric label="Participants" value={String(order.participants.length)} />
            <Metric label="Total items" value={String(getOrderItemCount(order))} />
            <Metric label="Total price" value={`₪${getOrderTotal(order)}`} />
          </View>
          <View style={styles.timerRow}>
            <TimerRing
              remainingMs={Math.max(0, order.closesAt - nowMs)}
              totalMs={15 * 60 * 1000}
              label="left"
            />
            <Text style={styles.timerCopy}>
              {Math.max(0, Math.ceil((order.closesAt - nowMs) / 60000))} min until the group closes.
            </Text>
          </View>
          <StatusRail status={order.status} />
          <Text style={styles.muted}>{order.lastEvent}</Text>
        </Card>

        <View style={styles.actions}>
          {statuses.map((status) => (
            <DemoButton
              key={status}
              label={status === 'Accepted' ? 'Accept Order' : `Mark ${status}`}
              onPress={() => updateStatus(order.id, status)}
              tone={order.status === status ? 'accent' : 'light'}
              style={styles.statusButton}
            />
          ))}
        </View>

        <View style={styles.grid}>
          <View style={styles.left}>
            <SectionTitle title="Master picking list" kicker="Exact variants for packing" />
            <Card style={styles.listCard}>
              {pickingList.length === 0 ? (
                <Text style={styles.muted}>No items yet. This list updates live as users add exact sizes and colors.</Text>
              ) : (
                pickingList.map(({ product, item, quantity }) => (
                  <View key={`${product.id}-${item.size}-${item.color}`} style={styles.pickRow}>
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyBadgeText}>{quantity}x</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{product.name}</Text>
                      <Text style={styles.muted}>Size {item.size} | {item.color} | {product.sku} | {product.stockStatus}</Text>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </View>

          <View style={styles.right}>
            <SectionTitle title="User breakdown" kicker="Buyer-by-buyer fulfillment" />
            <Card style={styles.listCard}>
              {order.participants.map((participant) => {
                const participantItems = order.items.filter((item) => item.participantId === participant.id);
                return (
                  <View key={participant.id} style={styles.userBlock}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.userName}>{participant.name}</Text>
                      <Text style={styles.muted}>{participantItems.length} lines</Text>
                    </View>
                    {participantItems.length === 0 ? (
                      <Text style={styles.muted}>Joined, no items yet.</Text>
                    ) : (
                      participantItems.map((item) => {
                        const line = getProductLine(item);
                        return (
                          <View key={item.id} style={styles.breakdownLine}>
                            <Text style={styles.itemName}>{line.displayName}</Text>
                            <Text style={styles.muted}>
                              {item.quantity}x | Size {item.size} | {item.color} | ₪{line.lineTotal}
                              {item.private ? ' | Private for friends' : ''}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                );
              })}
            </Card>
          </View>
        </View>

        <SavingsPanel order={order} />
        <SavingsTracker orders={orders} activeParticipantId={activeParticipantId} />
      </DemoPage>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F8F4EE' },
  content: { flexGrow: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  brandHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  topActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  backBtn: { width: 150, minHeight: 40 },
  title: { color: '#171412', fontFamily: fontFamily.display, fontSize: 36 },
  muted: { color: '#6D6258', fontFamily: fontFamily.body, fontSize: 14, lineHeight: 21 },
  summary: { gap: 14 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  timerCopy: { color: '#171412', fontFamily: fontFamily.bodySemi, fontSize: 14 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    flexGrow: 1,
    flexBasis: 160,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F6EFE8',
  },
  metricValue: { color: '#171412', fontFamily: fontFamily.bodyBold, fontSize: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statusButton: { flexGrow: 1, flexBasis: 170 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 },
  left: { flexGrow: 1, flexBasis: 460, gap: 12 },
  right: { flexGrow: 1, flexBasis: 460, gap: 12 },
  listCard: { gap: 12 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFE7DE',
    paddingBottom: 12,
  },
  qtyBadge: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#171412',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBadgeText: { color: '#FFFFFF', fontFamily: fontFamily.bodyBold, fontSize: 15 },
  itemName: { color: '#171412', fontFamily: fontFamily.bodyBold, fontSize: 15 },
  userBlock: { gap: 8, borderBottomWidth: 1, borderBottomColor: '#EFE7DE', paddingBottom: 12 },
  userName: { color: '#171412', fontFamily: fontFamily.bodyBold, fontSize: 17 },
  breakdownLine: { padding: 10, borderRadius: 8, backgroundColor: '#F8F4EE', gap: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
});
