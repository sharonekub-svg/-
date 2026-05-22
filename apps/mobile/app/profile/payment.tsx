import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { BackBtn } from '@/components/primitives/BackBtn';
import { Field } from '@/components/primitives/Field';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useLocale } from '@/i18n/locale';
import { type PaymentMethodKey, usePaymentSettingsStore } from '@/stores/paymentSettingsStore';

const methods: Array<{
  key: PaymentMethodKey;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: 'bit',
    label: 'Bit',
    hint: 'Israeli phone payment link or phone number.',
    placeholder: 'https://bitpay.page.link/... or 050...',
  },
  {
    key: 'paybox',
    label: 'PayBox',
    hint: 'PayBox link, group link, or phone number.',
    placeholder: 'https://payboxapp.page.link/...',
  },
  {
    key: 'paypal',
    label: 'PayPal',
    hint: 'PayPal.me link, email, or username.',
    placeholder: 'https://paypal.me/username or email@example.com',
  },
  {
    key: 'venmo',
    label: 'Venmo',
    hint: 'Venmo username or payment link.',
    placeholder: '@username or https://venmo.com/...',
  },
  {
    key: 'cash',
    label: 'Cash / Other',
    hint: 'Use this for cash, bank transfer note, or another method.',
    placeholder: 'Cash on pickup / bank transfer details',
  },
];

function MethodRow({
  method,
  enabled,
  link,
  detailLabel,
  onToggle,
  onLinkChange,
}: {
  method: (typeof methods)[number];
  enabled: boolean;
  link: string;
  detailLabel: string;
  onToggle: () => void;
  onLinkChange: (value: string) => void;
}) {
  return (
    <View style={styles.methodCard}>
      <Pressable onPress={onToggle} style={styles.methodTop} accessibilityRole="button">
        <View style={styles.methodCopy}>
          <Text style={styles.methodTitle}>{method.label}</Text>
          <Text style={styles.methodHint}>{method.hint}</Text>
        </View>
        <View style={[styles.switch, enabled && styles.switchOn]}>
          <Text style={[styles.switchLabel, enabled && styles.switchLabelOn]}>{enabled ? 'ON' : 'OFF'}</Text>
        </View>
      </Pressable>
      {enabled ? (
        <Field
          label={detailLabel}
          value={link}
          onChange={onLinkChange}
          placeholder={method.placeholder}
          autoCapitalize="none"
          ltr
        />
      ) : null}
    </View>
  );
}

export default function PaymentSettings() {
  const router = useRouter();
  const { language } = useLocale();
  const isHebrew = language === 'he';
  const settings = usePaymentSettingsStore((s) => s.settings);
  const hydrated = usePaymentSettingsStore((s) => s.hydrated);
  const load = usePaymentSettingsStore((s) => s.load);
  const setMethod = usePaymentSettingsStore((s) => s.setMethod);
  const enabledCount = Object.values(settings).filter((method) => method.enabled && method.link.trim().length > 0).length;
  const copy = isHebrew
    ? {
        title: 'תשלומים',
        subtitle: 'בחר איך אנשים יוכלו לשלם לך לפני שהם מצטרפים להזמנה.',
        saved: `${enabledCount} אפשרויות תשלום מוכנות`,
        note: 'הוסף קישור אמיתי, משתמש או פרטי תשלום. אפשרות תשלום נספרת כמוכנה רק אחרי שמילאת פרטים.',
        detailLabel: 'קישור או פרטי תשלום',
      }
    : {
        title: 'Payments',
        subtitle: 'Choose how people can pay you before they join an order.',
        saved: `${enabledCount} payment option${enabledCount === 1 ? '' : 's'} ready`,
        note: 'Add the real account link or username. A payment option only counts as ready after it has details filled in.',
        detailLabel: 'Payment link or detail',
      };

  useEffect(() => {
    if (!hydrated) {
      void load();
    }
  }, [hydrated, load]);

  return (
    <ScreenBase padded={false}>
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BackBtn onPress={() => router.back()} />
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>SHAKANA</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>{copy.saved}</Text>
          <Text style={styles.cardBody}>{copy.note}</Text>
        </View>

        {!hydrated ? (
          <ActivityIndicator color={colors.acc} />
        ) : (
          methods.map((method) => (
            <MethodRow
              key={method.key}
              method={method}
              enabled={settings[method.key].enabled}
              link={settings[method.key].link}
              detailLabel={copy.detailLabel}
              onToggle={() => void setMethod(method.key, { enabled: !settings[method.key].enabled })}
              onLinkChange={(value) => void setMethod(method.key, { link: value })}
            />
          ))
        )}
      </ScrollView>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.acc,
    marginBottom: 4,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    color: colors.tx,
  },
  subtitle: {
    marginTop: 8,
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  summaryCard: {
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.brBr,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  cardTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: colors.tx,
  },
  cardBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  methodCard: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.brBr,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
  },
  methodTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodCopy: {
    flex: 1,
    gap: 4,
  },
  methodTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: colors.tx,
  },
  methodHint: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mu,
  },
  switch: {
    width: 58,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.cardSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchOn: {
    backgroundColor: colors.tx,
    borderColor: colors.tx,
  },
  switchLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    color: colors.tx,
  },
  switchLabelOn: {
    color: colors.white,
  },
});
