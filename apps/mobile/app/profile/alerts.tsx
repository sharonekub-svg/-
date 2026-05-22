import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { BackBtn } from '@/components/primitives/BackBtn';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useLocale } from '@/i18n/locale';
import { useNotificationSettingsStore } from '@/stores/notificationSettingsStore';

function ToggleRow({
  label,
  desc,
  value,
  onToggle,
}: {
  label: string;
  desc: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cardSoft }]}
      accessibilityRole="button"
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <Text style={[styles.switchLabel, value && styles.switchLabelOn]}>{value ? 'ON' : 'OFF'}</Text>
      </View>
    </Pressable>
  );
}

export default function AlertsSettings() {
  const router = useRouter();
  const { t, language } = useLocale();
  const isHebrew = language === 'he';
  const settings = useNotificationSettingsStore((s) => s.settings);
  const hydrated = useNotificationSettingsStore((s) => s.hydrated);
  const load = useNotificationSettingsStore((s) => s.load);
  const setSetting = useNotificationSettingsStore((s) => s.setSetting);
  const addFriendUsername = useNotificationSettingsStore((s) => s.addFriendUsername);
  const removeFriendUsername = useNotificationSettingsStore((s) => s.removeFriendUsername);
  const [friendUsername, setFriendUsername] = useState('');

  useEffect(() => {
    if (!hydrated) {
      void load();
    }
  }, [hydrated, load]);

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <View>
          <Text style={styles.kicker}>SHAKANA</Text>
          <Text style={styles.title}>{t('profile.alertsTitle')}</Text>
          <Text style={styles.subtitle}>
            {isHebrew
              ? 'המתגים כאן שייכים לחשבון הזה בלבד.'
              : 'These toggles apply to this account only.'}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        {!hydrated ? (
          <ActivityIndicator color={colors.acc} />
        ) : (
          <>
            <ToggleRow
              label={t('profile.alertOrderUpdates')}
              desc={t('profile.alertOrderUpdatesDesc')}
              value={settings.orderUpdates}
              onToggle={() => void setSetting('orderUpdates', !settings.orderUpdates)}
            />
            <ToggleRow
              label={t('profile.alertPaymentReminders')}
              desc={t('profile.alertPaymentRemindersDesc')}
              value={settings.paymentReminders}
              onToggle={() => void setSetting('paymentReminders', !settings.paymentReminders)}
            />
            <ToggleRow
              label={t('profile.alertProductAlerts')}
              desc={t('profile.alertProductAlertsDesc')}
              value={settings.productAlerts}
              onToggle={() => void setSetting('productAlerts', !settings.productAlerts)}
            />
            <ToggleRow
              label={isHebrew ? 'הזמנות בבניין שלי' : 'Orders in my building'}
              desc={
                isHebrew
                  ? 'קבל התראה רק אם בחרת בזה כששכן מהבניין פותח הזמנה.'
                  : 'Notify me only if I choose it when someone in my building opens an order.'
              }
              value={settings.buildingOrderAlerts}
              onToggle={() => void setSetting('buildingOrderAlerts', !settings.buildingOrderAlerts)}
            />
            <ToggleRow
              label={isHebrew ? 'הזמנות של חברים' : 'Friend order alerts'}
              desc={
                isHebrew
                  ? 'קבל התראה כשחבר שאתה עוקב אחריו פותח הזמנה.'
                  : 'Notify me when a friend I follow opens an order.'
              }
              value={settings.friendOrderAlerts}
              onToggle={() => void setSetting('friendOrderAlerts', !settings.friendOrderAlerts)}
            />
          </>
        )}
      </View>

      {hydrated ? (
        <View style={styles.friendCard}>
          <Text style={styles.friendTitle}>{isHebrew ? 'חברים להתראות' : 'Friends to follow'}</Text>
          <Text style={styles.friendDesc}>
            {isHebrew
              ? 'כתוב username של חבר. כשהוא יפתח הזמנה, ההתראה תעבוד רק אם הפעלת את זה.'
              : 'Write a friend username. Alerts only fire if you turn friend alerts on.'}
          </Text>
          <View style={styles.friendInputRow}>
            <TextInput
              value={friendUsername}
              onChangeText={setFriendUsername}
              placeholder="@username"
              autoCapitalize="none"
              style={styles.friendInput}
              placeholderTextColor={colors.mu2}
            />
            <Pressable
              style={styles.addFriendBtn}
              onPress={() => {
                void addFriendUsername(friendUsername);
                setFriendUsername('');
              }}
            >
              <Text style={styles.addFriendText}>{isHebrew ? 'הוסף' : 'Add'}</Text>
            </Pressable>
          </View>
          <View style={styles.friendList}>
            {settings.followedFriendUsernames.length ? (
              settings.followedFriendUsernames.map((name) => (
                <Pressable key={name} style={styles.friendChip} onPress={() => void removeFriendUsername(name)}>
                  <Text style={styles.friendChipText}>@{name} ×</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.friendEmpty}>{isHebrew ? 'עדיין אין חברים.' : 'No friends followed yet.'}</Text>
            )}
          </View>
        </View>
      ) : null}
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 20,
    paddingBottom: 36,
    gap: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
    maxWidth: 320,
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
    borderRadius: 28,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  rowTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: colors.tx,
  },
  rowDesc: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
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
  friendCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.br,
    borderRadius: 28,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  friendTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: colors.tx,
  },
  friendDesc: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  friendInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  friendInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.br,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    color: colors.tx,
    fontFamily: fontFamily.body,
  },
  addFriendBtn: {
    minWidth: 76,
    borderRadius: radii.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendText: {
    color: colors.white,
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
  },
  friendList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  friendChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.accLight,
  },
  friendChipText: {
    color: colors.acc,
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
  },
  friendEmpty: {
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 13,
  },
});
