import { useEffect, useMemo, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BrandPill,
  Card,
  CelebrationBanner,
  DemoButton,
  DemoPage,
  EmptyNotice,
  ProductImage,
  SavingsPanel,
  SavingsTracker,
  SectionTitle,
  TimerRing,
  StatusRail,
  demoStyles,
} from '@/components/demo/DemoPrimitives';
import { buildInviteMessage, demoCategories, demoStores, productsForBrand, type DemoBrandId, type DemoProduct } from '@/demo/catalog';
import {
  demoParticipants,
  getOrderItemCount,
  getOrderTotal,
  getProductLine,
  initDemoCommerceSync,
  primaryDemoParticipant,
  useDemoCommerceStore,
} from '@/stores/demoCommerceStore';
import { fontFamily } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import { useLocale } from '@/i18n/locale';

export default function DemoUserScreen() {
  const router = useRouter();
  const { language } = useLocale();
  const params = useLocalSearchParams<{ join?: string }>();
  const selectedBrand = useDemoCommerceStore((state) => state.selectedBrand);
  const orders = useDemoCommerceStore((state) => state.orders);
  const activeParticipantId = useDemoCommerceStore((state) => state.activeParticipantId);
  const lastNotice = useDemoCommerceStore((state) => state.lastNotice);
  const lastPulse = useDemoCommerceStore((state) => state.lastPulse);
  const selectBrand = useDemoCommerceStore((state) => state.selectBrand);
  const ensureOrder = useDemoCommerceStore((state) => state.ensureOrder);
  const joinParticipant = useDemoCommerceStore((state) => state.joinParticipant);
  const setActiveParticipant = useDemoCommerceStore((state) => state.setActiveParticipant);
  const setDemoRole = useDemoCommerceStore((state) => state.setDemoRole);

  const [category, setCategory] = useState<(typeof demoCategories)[number]>('Best Sellers');
  const [copied, setCopied] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    initDemoCommerceSync();
    setDemoRole('user');
  }, [setDemoRole]);

  useEffect(() => {
    const interval = globalThis.setInterval(() => setNowMs(Date.now()), 1000);
    return () => globalThis.clearInterval(interval);
  }, []);

  const joinedOrder = useMemo(
    () => orders.find((order) => order.inviteCode === params.join),
    [orders, params.join],
  );

  useEffect(() => {
    if (joinedOrder && !joinedOrder.participants.some((participant) => participant.id === activeParticipantId)) {
      joinParticipant(joinedOrder.id, activeParticipantId);
      selectBrand(joinedOrder.brand);
    }
  }, [activeParticipantId, joinedOrder, joinParticipant, selectBrand]);

  const brand = selectedBrand ?? joinedOrder?.brand ?? null;
  const order = brand
    ? orders.find((candidate) => candidate.brand === brand && candidate.status !== 'Shipped') ??
      orders.find((candidate) => candidate.brand === brand)
    : null;
  const store = brand ? demoStores[brand] : null;
  const products = brand ? productsForBrand(brand) : [];
  const categoryProducts = products.filter((product) => product.category === category);
  const activeParticipant =
    demoParticipants.find((participant) => participant.id === activeParticipantId) ?? primaryDemoParticipant;
  const remainingMs = order ? Math.max(0, order.closesAt - nowMs) : 0;

  const createOrder = (nextBrand: DemoBrandId) => {
    selectBrand(nextBrand);
    ensureOrder(nextBrand);
  };

  const shareMessage = order
    ? buildInviteMessage(activeParticipant.name, order.brand, order.inviteLink, order.inviteCode)
    : '';

  const copyInvite = async () => {
    if (!shareMessage) return;
    await Clipboard.setStringAsync(shareMessage);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 1600);
  };

  if (!brand || !store) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <DemoPage>
          <View style={styles.topBar}>
            <Text style={styles.logo}>shakana</Text>
          </View>
          <Card style={styles.homeHero}>
            <View style={styles.homeHeroText}>
              <Text style={styles.kicker}>Group ordering, made calm</Text>
              <Text style={styles.homeTitle}>Start one shared cart from one store.</Text>
              <Text style={styles.homeBody}>
                Choose Amazon, Zara, or H&M. Share the invite with friends, let everyone add exact items, and keep the store dashboard clear.
              </Text>
            </View>
            <View style={styles.homeHeroActions}>
              <DemoButton label="New order" onPress={() => selectBrand('amazon')} tone="accent" style={styles.homeHeroBtn} />
              <DemoButton label="Merchant view" onPress={() => router.push('/store')} tone="light" style={styles.homeHeroBtn} />
            </View>
          </Card>
          <View style={styles.bentoGrid}>
            <Card style={styles.bentoLargeCard}>
              <Text style={styles.bentoNumber}>01</Text>
              <Text style={styles.bentoTitle}>Pick one store</Text>
              <Text style={styles.muted}>The catalog locks to that store so friends cannot mix unrelated products.</Text>
            </Card>
            <Card style={styles.bentoCard}>
              <Text style={styles.bentoNumber}>02</Text>
              <Text style={styles.bentoTitle}>Share the invite</Text>
              <Text style={styles.muted}>Friends open the link, join the same order, and add their own variants.</Text>
            </Card>
            <Card style={styles.bentoCard}>
              <Text style={styles.bentoNumber}>03</Text>
              <Text style={styles.bentoTitle}>Track fulfillment</Text>
              <Text style={styles.muted}>The merchant sees the master picking list, users, timer, and status.</Text>
            </Card>
          </View>
          <Card style={styles.whatsappCard}>
            <Text style={styles.whatsappTitle}>{language === 'he' ? 'הצטרפות מ-WhatsApp' : 'Join from WhatsApp'}</Text>
            <Text style={styles.muted}>
              {language === 'he'
                ? 'פותחים את קישור ההזמנה מ-WhatsApp והעגלה המשותפת נטענת ישר, בלי קוד ובלי הדבקה.'
                : 'Open the invite link from WhatsApp and the shared cart loads directly, with no manual code entry.'}
            </Text>
          </Card>
          <SectionTitle title="Choose your store" kicker="User flow" />
          <View style={styles.storeGrid}>
            {(['hm', 'zara', 'amazon'] as DemoBrandId[]).map((brandId) => {
              const option = demoStores[brandId];
              return (
                <Pressable
                  key={brandId}
                  accessibilityRole="button"
                  onPress={() => {
                    selectBrand(brandId);
                    setCategory('Best Sellers');
                  }}
                  style={({ pressed }) => [styles.storeChoice, pressed && demoStyles.pressed]}
                >
                  <ImageBackground source={{ uri: option.heroImage }} resizeMode="cover" style={styles.storeChoiceImage}>
                    <View style={styles.storeOverlay}>
                      <BrandPill brand={brandId} />
                      <Text style={styles.storeName}>{option.name}</Text>
                      <Text style={styles.storeTagline}>{option.tagline}</Text>
                    </View>
                  </ImageBackground>
                </Pressable>
              );
            })}
          </View>
        </DemoPage>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <DemoPage wide>
        <View style={styles.topBar}>
          <Pressable onPress={() => selectBrand(null)} accessibilityRole="button">
            <Text style={styles.logo}>shakana demo</Text>
          </Pressable>
          <View style={styles.topActions}>
            <DemoButton label="Switch store" onPress={() => selectBrand(null)} tone="light" style={styles.smallBtn} />
          </View>
        </View>

        <ImageBackground source={{ uri: store.heroImage }} resizeMode="cover" style={styles.hero}>
          <View style={styles.heroOverlay}>
            <View style={styles.heroHeaderRow}>
              <BrandPill brand={brand} />
              {order ? <TimerRing remainingMs={remainingMs} totalMs={15 * 60 * 1000} /> : null}
            </View>
            <Text style={styles.heroTitle}>{store.name}</Text>
            <Text style={styles.heroSubtitle}>{store.tagline}</Text>
            <Text style={styles.heroMeta}>{store.deliveryEta}</Text>
            <View style={styles.heroActions}>
              <DemoButton
                label={order ? `Group order ${order.id}` : 'Create group order'}
                onPress={() => createOrder(brand)}
                tone="accent"
                style={styles.heroBtn}
              />
              <DemoButton label="Open login" onPress={() => router.push('/login')} tone="light" style={styles.heroBtn} />
            </View>
          </View>
        </ImageBackground>

        <CelebrationBanner pulse={lastPulse} />
        {lastNotice ? (
          <Card style={styles.notice}>
            <Text style={styles.noticeText}>{lastNotice}</Text>
          </Card>
        ) : null}

        <View style={styles.mainGrid}>
          <View style={styles.catalogColumn}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {demoCategories.map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => setCategory(name)}
                  style={[styles.categoryPill, category === name && { backgroundColor: store.accent }]}
                >
                  <Text style={[styles.categoryText, category === name && styles.categoryTextActive]}>{name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <SectionTitle title={category} kicker={`${store.name} scraped-style catalog`} />
            {categoryProducts.length === 0 ? (
              <EmptyNotice title="No products here yet" body="Choose another category to keep browsing the demo inventory." />
            ) : (
              <View style={styles.productGrid}>
                {categoryProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    orderId={order?.id ?? null}
                    activeParticipantId={activeParticipantId}
                    onCreateOrder={() => createOrder(brand)}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.cartColumn}>
            {!order ? (
              <EmptyNotice
                title="Create your first group order"
                body="Pick a store, create the shared session, then add exact variants to the group cart."
              />
            ) : (
              <>
                <Card style={styles.cartCard}>
                  <View style={styles.rowBetween}>
                    <View>
                      <Text style={styles.cartTitle}>Group cart</Text>
                      <Text style={styles.muted}>{order.id} | Code {order.inviteCode}</Text>
                    </View>
                    <Text style={styles.total}>₪{getOrderTotal(order)}</Text>
                  </View>
                  <StatusRail status={order.status} />
                  <View style={styles.shareProofRow}>
                    <View style={styles.trustPill}>
                      <Text style={styles.trustValue}>{activeParticipant.name}</Text>
                      <Text style={styles.trustLabel}>Verified neighbor</Text>
                    </View>
                    <View style={styles.trustPillSoft}>
                      <Text style={styles.trustValue}>{order.participants.length}</Text>
                      <Text style={styles.trustLabel}>Joined now</Text>
                    </View>
                  </View>
                  <View style={styles.participants}>
                    {demoParticipants.map((participant) => {
                      const joined = order.participants.some((current) => current.id === participant.id);
                      const active = activeParticipantId === participant.id;
                      const verified = joined && order.items.some((item) => item.participantId === participant.id);
                      return (
                        <Pressable
                          key={participant.id}
                          accessibilityRole="button"
                          onPress={() => {
                            if (!joined) joinParticipant(order.id, participant.id);
                            setActiveParticipant(participant.id);
                          }}
                          style={[styles.participantPill, joined && styles.joinedPill, active && styles.activePill]}
                        >
                          <View style={styles.participantRow}>
                            <Text style={[styles.participantText, active && styles.activePillText]}>
                              {participant.name}{joined ? '' : ' +'}
                            </Text>
                            {verified ? <Text style={styles.participantBadge}>verified</Text> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.inviteBox}>
                    <Text style={styles.kicker}>WhatsApp-style invite</Text>
                    <Text style={styles.inviteCardPreview}>{shareMessage}</Text>
                    <Text style={styles.inviteText}>{shareMessage}</Text>
                    <DemoButton
                      label={copied ? 'Invite copied' : 'Share with friends'}
                      onPress={copyInvite}
                      tone="light"
                    />
                  </View>
                  <View style={styles.simRow}>
                    <DemoButton label="Simulate User B joining" onPress={() => joinParticipant(order.id, 'user-b')} tone="light" style={styles.simBtn} />
                    <DemoButton label="Simulate User C joining" onPress={() => joinParticipant(order.id, 'user-c')} tone="light" style={styles.simBtn} />
                  </View>
                </Card>

                <SavingsPanel order={order} />
                <SavingsTracker orders={orders} activeParticipantId={activeParticipantId} />

                <Card style={styles.cartCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cartTitle}>Items</Text>
                    <Text style={styles.muted}>{getOrderItemCount(order)} units</Text>
                  </View>
                  {order.items.length === 0 ? (
                    <Text style={styles.muted}>No items yet. Select size and color, then add the first piece.</Text>
                  ) : (
                    <View style={styles.itemList}>
                      {order.items.map((item) => {
                        const line = getProductLine(item);
                        const owner = demoParticipants.find((participant) => participant.id === item.participantId);
                        const privateForViewer = item.private && item.participantId !== activeParticipantId;
                        return (
                          <View key={item.id} style={styles.cartItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.itemName}>
                                {privateForViewer ? 'Private item' : line.displayName}
                              </Text>
                              <Text style={styles.muted}>
                                {owner?.name ?? 'Guest'} | {privateForViewer ? 'Contribution hidden' : `${item.size}, ${item.color}`} | Qty {item.quantity}
                              </Text>
                            </View>
                            <Text style={styles.itemPrice}>₪{line.lineTotal}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </Card>
              </>
            )}
          </View>
        </View>
      </DemoPage>
    </ScrollView>
  );
}

function ProductCard({
  product,
  orderId,
  activeParticipantId,
  onCreateOrder,
}: {
  product: DemoProduct;
  orderId: string | null;
  activeParticipantId: string;
  onCreateOrder: () => void;
}) {
  const addItem = useDemoCommerceStore((state) => state.addItem);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [privateItem, setPrivateItem] = useState(false);
  const ready = !!orderId && !!size && !!color && quantity > 0;
  const productSaving = Math.max(0, product.compareAtPrice - product.price);

  return (
    <Card style={styles.productCard}>
      <ProductImage product={product} />
      <View style={styles.productInfo}>
        <View style={styles.rowBetween}>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.price}>₪{product.price}</Text>
        </View>
        <Text style={styles.muted}>{product.description}</Text>
        <Text style={styles.sku}>{product.sku} | {product.stockStatus} | Save ₪{productSaving}</Text>
        <Text style={styles.selectorLabel}>Size</Text>
        <View style={styles.optionRow}>
          {product.sizes.map((option) => (
            <Pressable
              key={option}
              testID={`size-${product.id}-${option}`}
              accessibilityRole="button"
              onPress={() => setSize(option)}
              style={[styles.option, size === option && styles.optionActive]}
            >
              <Text style={[styles.optionText, size === option && styles.optionTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.selectorLabel}>Color</Text>
        <View style={styles.optionRow}>
          {product.colors.map((option) => (
            <Pressable
              key={option}
              testID={`color-${product.id}-${option}`}
              accessibilityRole="button"
              onPress={() => setColor(option)}
              style={[styles.option, color === option && styles.optionActive]}
            >
              <Text style={[styles.optionText, color === option && styles.optionTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.qtyRow}>
          <DemoButton label="-" onPress={() => setQuantity(Math.max(1, quantity - 1))} tone="light" style={styles.qtyBtn} />
          <Text style={styles.qtyText}>Qty {quantity}</Text>
          <DemoButton label="+" onPress={() => setQuantity(quantity + 1)} tone="light" style={styles.qtyBtn} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: privateItem }}
            onPress={() => setPrivateItem((value) => !value)}
            style={[styles.privateToggle, privateItem && styles.privateToggleActive]}
          >
            <Text style={[styles.privateText, privateItem && styles.privateTextActive]}>Private</Text>
          </Pressable>
        </View>
        {!orderId ? (
          <DemoButton label="Create group order first" onPress={onCreateOrder} tone="accent" />
        ) : (
          <DemoButton
            testID={`add-${product.id}`}
            label={ready ? 'Add to group cart' : 'Select size and color'}
            disabled={!ready}
            onPress={() => {
              if (!orderId) return;
              addItem(orderId, {
                productId: product.id,
                participantId: activeParticipantId,
                size,
                color,
                quantity,
                private: privateItem,
              });
            }}
            tone="accent"
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  topActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  logo: {
    color: colors.acc,
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    textTransform: 'uppercase',
  },
  smallBtn: { width: 170, minHeight: 40 },
  homeHero: {
    gap: 20,
    padding: 24,
    borderRadius: 30,
    backgroundColor: colors.card,
  },
  homeHeroText: { gap: 8, maxWidth: 720 },
  homeTitle: {
    color: colors.tx,
    fontFamily: fontFamily.display,
    fontSize: 42,
    lineHeight: 46,
  },
  homeBody: {
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 680,
  },
  homeHeroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  homeHeroBtn: { minWidth: 170 },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  bentoCard: {
    flexGrow: 1,
    flexBasis: 250,
    gap: 8,
    minHeight: 164,
    justifyContent: 'space-between',
  },
  bentoLarge: {
    flexBasis: 390,
    backgroundColor: colors.limeSoft,
  },
  bentoLargeCard: {
    flexGrow: 1,
    flexBasis: 390,
    gap: 8,
    minHeight: 164,
    justifyContent: 'space-between',
    backgroundColor: colors.limeSoft,
  },
  bentoNumber: {
    color: colors.acc,
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
  },
  bentoTitle: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 19,
  },
  storeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  whatsappCard: {
    gap: 8,
    marginTop: 4,
    padding: 16,
    borderRadius: 24,
    backgroundColor: colors.limeSoft,
    borderWidth: 1,
    borderColor: colors.br,
  },
  whatsappTitle: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
  },
  storeChoice: {
    flexGrow: 1,
    flexBasis: 340,
    height: 360,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.s2,
  },
  storeChoiceImage: { flex: 1 },
  storeOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 10,
    padding: 22,
    backgroundColor: 'rgba(37,32,27,0.34)',
  },
  storeName: {
    color: '#FFFFFF',
    fontFamily: fontFamily.display,
    fontSize: 44,
  },
  storeTagline: {
    color: '#FFFFFF',
    fontFamily: fontFamily.bodySemi,
    fontSize: 16,
  },
  hero: {
    minHeight: 340,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.s2,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 10,
    padding: 22,
    backgroundColor: 'rgba(37,32,27,0.36)',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: fontFamily.display,
    fontSize: 52,
  },
  heroSubtitle: {
    color: '#FFFFFF',
    fontFamily: fontFamily.bodySemi,
    fontSize: 17,
  },
  heroMeta: {
    color: '#F8F4EE',
    fontFamily: fontFamily.body,
    fontSize: 14,
  },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  heroBtn: { width: 210 },
  heroHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  notice: { backgroundColor: colors.limeSoft, borderColor: colors.br },
  noticeText: { color: colors.acc, fontFamily: fontFamily.bodyBold, fontSize: 14 },
  mainGrid: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 },
  catalogColumn: { flexGrow: 1, flexBasis: 640, gap: 14 },
  cartColumn: { flexGrow: 1, flexBasis: 330, gap: 14 },
  categoryRow: { gap: 8, paddingVertical: 4 },
  categoryPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.s2,
  },
  categoryText: { color: colors.mu, fontFamily: fontFamily.bodyBold, fontSize: 13 },
  categoryTextActive: { color: '#FFFFFF' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  productCard: { flexGrow: 1, flexBasis: 280, maxWidth: 390, overflow: 'hidden', padding: 0, borderRadius: 24 },
  productInfo: { padding: 14, gap: 10 },
  productName: { color: colors.tx, fontFamily: fontFamily.bodyBold, fontSize: 17, flex: 1 },
  price: { color: colors.tx, fontFamily: fontFamily.bodyBold, fontSize: 18 },
  sku: { color: colors.acc, fontFamily: fontFamily.bodyBold, fontSize: 12 },
  selectorLabel: { color: colors.tx, fontFamily: fontFamily.bodyBold, fontSize: 13 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  option: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.br,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  optionActive: { backgroundColor: colors.acc, borderColor: colors.acc },
  optionText: { color: colors.tx, fontFamily: fontFamily.bodySemi, fontSize: 12 },
  optionTextActive: { color: '#FFFFFF' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  qtyBtn: { width: 44, minHeight: 38, paddingHorizontal: 0 },
  qtyText: { color: colors.tx, fontFamily: fontFamily.bodyBold, minWidth: 54, textAlign: 'center' },
  privateToggle: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.br,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: colors.white,
  },
  privateToggleActive: { backgroundColor: colors.accLight, borderColor: colors.acc },
  privateText: { color: colors.mu, fontFamily: fontFamily.bodyBold, fontSize: 12 },
  privateTextActive: { color: colors.acc },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cartCard: { gap: 14 },
  cartTitle: { color: colors.tx, fontFamily: fontFamily.bodyBold, fontSize: 20 },
  total: { color: colors.tx, fontFamily: fontFamily.display, fontSize: 28 },
   muted: { color: colors.mu, fontFamily: fontFamily.body, fontSize: 14, lineHeight: 21 },
  kicker: { color: colors.acc, fontFamily: fontFamily.bodyBold, fontSize: 12 },
  participants: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  participantPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.s2,
  },
  joinedPill: { backgroundColor: colors.limeSoft },
  activePill: { backgroundColor: colors.acc },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  participantText: { color: colors.mu, fontFamily: fontFamily.bodyBold, fontSize: 12 },
  activePillText: { color: '#FFFFFF' },
  participantBadge: {
    color: colors.acc,
    backgroundColor: colors.limeSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  shareProofRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trustPill: {
    flexGrow: 1,
    minWidth: 140,
    borderRadius: 18,
    backgroundColor: colors.limeSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  trustPillSoft: {
    flexGrow: 1,
    minWidth: 120,
    borderRadius: 18,
    backgroundColor: colors.s2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  trustValue: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
  },
  trustLabel: {
    color: colors.mu,
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  inviteBox: { gap: 9, padding: 12, borderRadius: 18, backgroundColor: colors.s2 },
  inviteCardPreview: {
    color: colors.acc,
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.9,
  },
  inviteText: { color: colors.tx, fontFamily: fontFamily.bodySemi, fontSize: 13, lineHeight: 20 },
  simRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  simBtn: { flexGrow: 1, flexBasis: 140 },
  itemList: { gap: 8 },
  cartItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.br,
    paddingTop: 10,
  },
  itemName: { color: colors.tx, fontFamily: fontFamily.bodyBold, fontSize: 14 },
  itemPrice: { color: colors.tx, fontFamily: fontFamily.bodyBold, fontSize: 15 },
});
