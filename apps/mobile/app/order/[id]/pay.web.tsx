import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { BackBtn } from '@/components/primitives/BackBtn';
import { PrimaryBtn } from '@/components/primitives/Button';
import { useOrder } from '@/api/orders';
import { env } from '@/lib/env';
import { invokeFn } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { colors, radii } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { formatAgorot } from '@/utils/format';
import { newIdempotencyKey } from '@/utils/idempotency';

type PaymentIntentResponse = {
  clientSecret: string;
  publishableKey: string;
};

function StripeCheckoutForm({
  amountLabel,
  orderId,
}: {
  amountLabel: string;
  orderId: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const pushToast = useUiStore((s) => s.pushToast);
  const [submitting, setSubmitting] = useState(false);

  const confirmPayment = async () => {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order/${orderId}/escrow`,
        },
        redirect: 'if_required',
      });

      if (result.error) throw result.error;
      router.replace(`/order/${orderId}/escrow`);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Payment failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.paymentBox}>
      <Text style={styles.lead}>Your secure Stripe payment</Text>
      <Text style={styles.amount}>{amountLabel}</Text>
      <View style={styles.elementWrap}>
        <PaymentElement />
      </View>
      <PrimaryBtn
        label={submitting ? 'Processing...' : 'Pay securely'}
        onPress={confirmPayment}
        disabled={!stripe || !elements}
        loading={submitting}
      />
    </View>
  );
}

export default function PayWeb() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = String(id ?? '');
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const pushToast = useUiStore((s) => s.pushToast);
  const { data, isLoading, error } = useOrder(orderId);
  const [clientSecret, setClientSecret] = useState('');
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentError, setIntentError] = useState('');
  const [intentAttempt, setIntentAttempt] = useState(0);

  const order = data?.order;
  const me = data?.participants.find((p) => p.user_id === userId);
  const amountAgorot = me?.amount_agorot ?? 0;
  const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
    if (!env.stripePublishableKey) return null;
    return loadStripe(env.stripePublishableKey);
  }, []);

  useEffect(() => {
    if (!orderId || !order || !me || clientSecret || loadingIntent) return;
    if (!['locked', 'escrow'].includes(order.status)) return;

    let active = true;
    setLoadingIntent(true);
    setIntentError('');

    invokeFn<PaymentIntentResponse>('create-payment-intent', {
      orderId,
      idempotency_key: newIdempotencyKey(),
    })
      .then((response) => {
        if (!active) return;
        if (!response.clientSecret) {
          setIntentError('Stripe did not return a payment session.');
          return;
        }
        setClientSecret(response.clientSecret);
      })
      .catch((paymentError) => {
        if (!active) return;
        setIntentError(paymentError instanceof Error ? paymentError.message : 'Could not start payment.');
      })
      .finally(() => {
        if (active) setLoadingIntent(false);
      });

    return () => {
      active = false;
    };
  }, [clientSecret, intentAttempt, loadingIntent, me, order, orderId]);

  const goBackToOrder = () => router.replace(`/order/${orderId}`);

  if (isLoading) {
    return (
      <ScreenBase style={styles.center}>
        <ActivityIndicator color={colors.acc} />
      </ScreenBase>
    );
  }

  return (
    <ScreenBase style={{ paddingTop: 20, paddingBottom: 36 }}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 40 }} />
      </View>

      {error || !order ? (
        <View style={styles.card}>
          <Text style={styles.warningTitle}>Could not load this order.</Text>
          <PrimaryBtn label="Back to order" onPress={goBackToOrder} />
        </View>
      ) : !me ? (
        <View style={styles.card}>
          <Text style={styles.warningTitle}>Join this order before paying.</Text>
          <Text style={styles.warningBody}>Only participants can pay their share.</Text>
          <PrimaryBtn label="Back to order" onPress={goBackToOrder} />
        </View>
      ) : !['locked', 'escrow'].includes(order.status) ? (
        <View style={styles.card}>
          <Text style={styles.warningTitle}>Payment opens after the timer ends.</Text>
          <Text style={styles.warningBody}>The order must be locked before Stripe can collect payments.</Text>
          <PrimaryBtn label="Back to order" onPress={goBackToOrder} />
        </View>
      ) : !stripePromise ? (
        <View style={styles.card}>
          <Text style={styles.warningTitle}>Stripe is not configured.</Text>
          <Text style={styles.warningBody}>Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY.</Text>
        </View>
      ) : loadingIntent || !clientSecret ? (
        <View style={styles.card}>
          <ActivityIndicator color={colors.acc} />
          <Text style={styles.warningBody}>{intentError || 'Preparing secure payment...'}</Text>
          {intentError ? <PrimaryBtn label="Try again" onPress={() => setIntentAttempt((attempt) => attempt + 1)} /> : null}
        </View>
      ) : (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: colors.acc,
                colorText: colors.tx,
                borderRadius: `${radii.sm}px`,
                fontFamily: 'Rubik, sans-serif',
              },
            },
          }}
        >
          <StripeCheckoutForm amountLabel={formatAgorot(amountAgorot)} orderId={orderId} />
        </Elements>
      )}
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: colors.tx,
  },
  card: {
    gap: 12,
    padding: 18,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
  },
  paymentBox: {
    gap: 18,
    padding: 18,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
  },
  lead: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: colors.mu,
    textAlign: 'center',
  },
  amount: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    color: colors.tx,
    textAlign: 'center',
  },
  elementWrap: {
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.cardSoft,
  },
  warningTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
    color: colors.tx,
  },
  warningBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
});
