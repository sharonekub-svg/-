import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { stashPendingInvite } from '@/lib/deeplinks';
import { useAuthStore } from '@/stores/authStore';
import { useClaimInvite } from '@/api/invites';

const C = {
  bg: '#F8F5EF',
  tx: '#211D19',
  mu: '#70675F',
  acc: '#B86B4B',
  accLight: '#F4E5D8',
  lime: '#F3E6D6',
  br: '#E6E0D7',
  white: '#FFFFFF',
  err: '#E45B5B',
  skel: '#F1ECE4',
};

type OrderPreview = {
  order: {
    id: string;
    product_title: string | null;
    product_image: string | null;
    product_price_agorot: number;
    store_label: string;
    estimated_shipping_agorot: number;
    free_shipping_threshold_agorot: number;
    closes_at: string | null;
    status: string;
    max_participants: number;
  };
  founder: { first_name: string; apt: string; floor: string | null } | null;
  participants_count: number;
  participant_names: string[];
  is_closed: boolean;
};

function formatShekels(agorot: number): string {
  return (agorot / 100).toFixed(0);
}

function decodeHtml(str: string | null): string | null {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function Skeleton({ width, height }: { width: number | string; height: number }) {
  return (
    <View
      style={{
        width: width as number,
        height,
        backgroundColor: C.skel,
        borderRadius: 8,
      }}
    />
  );
}

export default function JoinPreviewWeb() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const claim = useClaimInvite();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [data, setData] = useState<OrderPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Authenticated user arriving here (post-login redirect): skip preview, claim immediately.
  useEffect(() => {
    if (!token || !session || claiming) return;
    setClaiming(true);
    claim.mutateAsync(String(token))
      .then((res) => {
        router.replace(`/order/${res.orderId}` as any);
      })
      .catch((e: unknown) => {
        setClaiming(false);
        setClaimError(e instanceof Error ? e.message : 'invite_error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session]);

  useEffect(() => {
    if (!token) return;
    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-order-preview?token=${encodeURIComponent(token)}`;
    fetch(url)
      .then((r) => r.json())
      .then((json: OrderPreview & { error?: string }) => {
        if (json.error || !json.order) {
          setFetchError(true);
        } else {
          setData(json as OrderPreview);
          if (json.order?.closes_at) {
            const ms = new Date(json.order.closes_at).getTime() - Date.now();
            setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
          }
        }
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s === null || s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [secondsLeft !== null]);

  const handleJoin = async () => {
    if (!token) return;
    await stashPendingInvite(String(token));
    router.replace('/(auth)/phone' as any);
  };

  if (claiming && !claimError) {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <Text style={styles.wordmark}>shakana</Text>
        <ActivityIndicator color={C.acc} />
      </View>
    );
  }

  if (claimError) {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <Text style={styles.wordmark}>shakana</Text>
        <Text style={styles.closedTitle}>ההזמנה הזאת נסגרה או לא קיימת</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/')}>
          <Text style={styles.secondaryBtnText}>פתח הזמנה חדשה</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Skeleton width={100} height={28} />
            <Skeleton width={70} height={16} />
          </View>
          <View style={styles.productCard}>
            <Skeleton width="100%" height={180} />
            <View style={{ gap: 8, marginTop: 12 }}>
              <Skeleton width="80%" height={20} />
              <Skeleton width={60} height={24} />
            </View>
          </View>
          <View style={{ gap: 8, marginTop: 16 }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="90%" height={44} />
            <Skeleton width="70%" height={16} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (fetchError || !data || !data.order) {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <Text style={styles.wordmark}>shakana</Text>
        <Text style={styles.closedTitle}>ההזמנה הזאת נסגרה או לא קיימת</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/')}>
          <Text style={styles.secondaryBtnText}>פתח הזמנה חדשה</Text>
        </Pressable>
      </View>
    );
  }

  if (data.is_closed) {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <Text style={styles.wordmark}>shakana</Text>
        <Text style={styles.closedTitle}>ההזמנה הזאת נסגרה או לא קיימת</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/')}>
          <Text style={styles.secondaryBtnText}>פתח הזמנה חדשה</Text>
        </Pressable>
      </View>
    );
  }

  const { order: rawOrder, founder, participants_count, participant_names } = data;
  const order = { ...rawOrder, product_title: decodeHtml(rawOrder.product_title) };

  // Countdown
  const isExpiredTimer = secondsLeft !== null && secondsLeft <= 0;
  const isUrgent = secondsLeft !== null && secondsLeft < 7200;
  let countdownDisplay = '––:––:––';
  if (secondsLeft !== null && secondsLeft > 0) {
    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    countdownDisplay = [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }

  // Shipping per person
  const effectiveParticipants = Math.max(participants_count, 1);
  const shippingPerPerson = Math.ceil(order.estimated_shipping_agorot / effectiveParticipants);
  const totalContrib = participants_count * order.product_price_agorot;
  const progressPct = order.free_shipping_threshold_agorot > 0
    ? Math.min(100, (totalContrib / order.free_shipping_threshold_agorot) * 100)
    : 0;
  const freeShippingGap = Math.max(0, order.free_shipping_threshold_agorot - totalContrib);
  const freeShippingReached = freeShippingGap === 0 && order.free_shipping_threshold_agorot > 0;

  // Founder line
  const founderParts: string[] = [];
  if (founder?.first_name) founderParts.push(founder.first_name);
  if (founder?.apt) founderParts.push(`דירה ${founder.apt}`);
  if (founder?.floor) founderParts.push(`קומה ${founder.floor}`);
  const founderLine = founderParts.join(' • ');

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>shakana</Text>
          <Text style={styles.storeName}>{order.store_label}</Text>
        </View>

        <View style={styles.storeSign}>
          <Text style={styles.storeSignKicker}>החנות של ההזמנה</Text>
          <Text style={styles.storeSignName}>{order.store_label || 'Store'}</Text>
          <Text style={styles.storeSignBody}>
            כדי להצטרף נכון, הדבק כאן רק לינק מוצר מאותה חנות. Shakana תבדוק את המחיר, המשלוח והאפשרויות לפי הלינק.
          </Text>
        </View>

        {/* Product card */}
        <View style={styles.productCard}>
          {order.product_image ? (
            <Image
              source={{ uri: order.product_image }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.productImage, { backgroundColor: C.skel }]} />
          )}
          <View style={styles.productInfo}>
            {order.product_title ? (
              <Text style={styles.productTitle}>{order.product_title}</Text>
            ) : null}
            <Text style={styles.productPrice}>₪{formatShekels(order.product_price_agorot)}</Text>
          </View>
        </View>

        {/* Founder */}
        {founderLine.length > 0 ? (
          <Text style={styles.founderLine}>{founderLine}</Text>
        ) : null}

        {/* Countdown */}
        <View style={styles.countdownSection}>
          <Text style={styles.countdownLabel}>נסגר בעוד</Text>
          {isExpiredTimer ? (
            <Text style={[styles.countdownValue, { color: C.err }]}>ההזמנה נסגרה</Text>
          ) : (
            <Text
              style={[
                styles.countdownValue,
                isUrgent && { color: C.err },
              ]}
            >
              {countdownDisplay}
            </Text>
          )}
        </View>

        {/* Group info */}
        <View style={styles.groupSection}>
          <View style={styles.shippingRow}>
            <Text style={styles.shippingLabel}>משלוח לאדם</Text>
            <Text style={styles.shippingValue}>₪{formatShekels(shippingPerPerson)}</Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
          </View>

          {/* Milestone */}
          {freeShippingReached ? (
            <Text style={[styles.milestoneText, { color: C.acc }]}>משלוח חינם הופעל</Text>
          ) : (
            <Text style={styles.milestoneText}>
              עוד ₪{formatShekels(freeShippingGap)} למשלוח חינם
            </Text>
          )}
        </View>

        {/* Participants */}
        {participant_names.length > 0 ? (
          <View style={styles.participantsSection}>
            <Text style={styles.participantsSectionLabel}>
              הצטרפו ({participants_count})
            </Text>
            {participant_names.map((name, i) => (
              <Text key={i} style={styles.participantName}>
                {name}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={styles.stickyBottom}>
        <Pressable style={styles.ctaBtn} onPress={handleJoin} accessibilityRole="button">
          <Text style={styles.ctaBtnText}>הצטרף להזמנה</Text>
        </Pressable>
        <Text style={styles.ctaCaption}>ניתן להוסיף פריטים אחרי ההצטרפות</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 100,
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
    gap: 20,
  },
  header: {
    alignItems: 'flex-start',
    gap: 4,
  },
  wordmark: {
    fontSize: 30,
    fontWeight: '800',
    color: C.tx,
    letterSpacing: -0.5,
    fontFamily: 'Rubik',
  },
  storeName: {
    fontSize: 13,
    color: C.mu,
    fontFamily: 'Rubik',
  },
  storeSign: {
    backgroundColor: C.tx,
    borderRadius: 24,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#24211D',
  },
  storeSignKicker: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'Rubik',
  },
  storeSignName: {
    color: C.white,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '800',
    letterSpacing: -1.5,
    fontFamily: 'Rubik',
  },
  storeSignBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Rubik',
  },
  productCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.br,
    borderRadius: 24,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 180,
  },
  productInfo: {
    padding: 16,
    gap: 6,
  },
  productTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: C.tx,
    fontFamily: 'Rubik',
  },
  productPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: C.tx,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Rubik',
  },
  founderLine: {
    fontSize: 14,
    color: C.mu,
    textAlign: 'center',
    fontFamily: 'Rubik',
  },
  countdownSection: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  countdownLabel: {
    fontSize: 13,
    color: C.mu,
    fontFamily: 'Rubik',
  },
  countdownValue: {
    fontSize: 40,
    fontWeight: '700',
    color: C.tx,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Rubik',
    letterSpacing: 2,
  },
  groupSection: {
    gap: 8,
  },
  shippingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shippingLabel: {
    fontSize: 14,
    color: C.mu,
    fontFamily: 'Rubik',
  },
  shippingValue: {
    fontSize: 16,
    fontWeight: '600',
    color: C.tx,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Rubik',
  },
  progressTrack: {
    height: 6,
    backgroundColor: C.br,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: C.acc,
    borderRadius: 3,
  },
  milestoneText: {
    fontSize: 13,
    color: C.mu,
    fontFamily: 'Rubik',
  },
  participantsSection: {
    gap: 8,
  },
  participantsSectionLabel: {
    fontSize: 13,
    color: C.mu,
    fontFamily: 'Rubik',
  },
  participantName: {
    fontSize: 15,
    color: C.tx,
    fontFamily: 'Rubik',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.br,
  },
  stickyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.br,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 6,
  },
  ctaBtn: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: C.tx,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: C.white,
    fontFamily: 'Rubik',
  },
  ctaCaption: {
    fontSize: 12,
    color: C.mu,
    fontFamily: 'Rubik',
  },
  closedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.tx,
    textAlign: 'center',
    fontFamily: 'Rubik',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: C.br,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: C.white,
    marginTop: 8,
  },
  secondaryBtnText: {
    fontSize: 15,
    color: C.tx,
    fontFamily: 'Rubik',
  },
});
