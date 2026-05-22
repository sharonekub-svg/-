import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { LanguageSwitcher } from '@/components/primitives/LanguageSwitcher';
import { PrimaryBtn } from '@/components/primitives/Button';
import { useLocale } from '@/i18n/locale';
import { useAuthStore } from '@/stores/authStore';
import { useUserOrders } from '@/api/orders';
import { useSignOut } from '@/api/auth';
import { resetAnalytics } from '@/lib/posthog';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

type ProfileLink = { href: string; label: string; danger?: boolean };

const PROFILE_LINKS: ProfileLink[] = [
  { href: '/profile/payment', label: 'Payments' },
  { href: '/profile/alerts', label: 'Alerts' },
  { href: '/profile/privacy', label: 'Privacy' },
  { href: '/profile/terms', label: 'Terms' },
  { href: '/profile/delete', label: 'Delete account', danger: true },
] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const { language } = useLocale();
  const isHebrew = language === 'he';
  const signOut = useSignOut();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const resetAuth = useAuthStore((s) => s.reset);
  const { data: orders = [] } = useUserOrders(session?.user.id);

  const name = useMemo(
    () => [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim(),
    [profile?.first_name, profile?.last_name],
  );

  const openOrders = orders.filter((order) => !['completed', 'cancelled', 'Shipped'].includes(order.status)).length;
  const email = session?.user.email ?? (isHebrew ? 'לא מחובר' : 'Not signed in');

  const onSignOut = async () => {
    try {
      await signOut.mutateAsync();
    } finally {
      resetAnalytics();
      resetAuth();
      router.replace('/login');
    }
  };

  return (
    <ScreenBase padded={false}>
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <View style={styles.topBar}>
            <View style={styles.titleBlock}>
              <Text style={styles.brand}>SHAKANA</Text>
              <Text style={styles.title}>{isHebrew ? 'פרופיל' : 'Profile'}</Text>
              <Text style={styles.subtitle}>
                {isHebrew
                  ? 'כאן מנהלים שפה, פרטי חשבון, והעדפות בסיסיות במקום אחד.'
                  : 'Manage language, account details, and basic preferences in one calm place.'}
              </Text>
            </View>
            <LanguageSwitcher />
          </View>

          <View style={styles.heroCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(name || email).charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>{isHebrew ? 'חשבון' : 'Account'}</Text>
              <Text style={styles.heroName} numberOfLines={1}>
                {name || (isHebrew ? 'משתמש אורח' : 'Guest user')}
              </Text>
              <Text style={styles.heroBody}>
                {isHebrew
                  ? 'הפרופיל נוצר אחרי ההתחברות, כך שאין צורך במסכים נוספים.'
                  : 'The profile is created after sign in, so you do not need an extra setup step.'}
              </Text>
            </View>
          </View>

          {!session ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>{isHebrew ? 'עוד לא נכנסת' : 'Not signed in yet'}</Text>
              <Text style={styles.noticeBody}>
                {isHebrew
                  ? 'אפשר לחזור למסך ההתחברות ולהמשיך משם.'
                  : 'Go back to the login screen and continue from there.'}
              </Text>
              <PrimaryBtn label={isHebrew ? 'חזרה להתחברות' : 'Back to login'} onPress={() => router.push('/login')} />
            </View>
          ) : null}

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{isHebrew ? 'אימייל' : 'Email'}</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {email}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{isHebrew ? 'פתוחות' : 'Open orders'}</Text>
              <Text style={styles.summaryValue}>{String(openOrders)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{isHebrew ? 'שפה' : 'Language'}</Text>
              <Text style={styles.summaryValue}>{language.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{isHebrew ? 'שפה' : 'Language'}</Text>
            <Text style={styles.sectionBody}>
              {isHebrew ? 'בחרו עברית או אנגלית לכל האפליקציה.' : 'Choose Hebrew or English for the whole app.'}
            </Text>
            <LanguageSwitcher />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{isHebrew ? 'הגדרות חשבון' : 'Account settings'}</Text>
            <View style={styles.linkList}>
              {PROFILE_LINKS.map((item) => (
                <Pressable
                  key={item.href}
                  onPress={() => router.push(item.href)}
                  style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.85 }]}
                >
                  <Text style={[styles.linkText, item.danger && styles.linkTextDanger]}>{item.label}</Text>
                  <Text style={styles.linkArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {session ? <PrimaryBtn label={isHebrew ? 'התנתקות' : 'Sign out'} onPress={onSignOut} /> : null}
        </View>
      </ScrollView>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  shell: {
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  brand: {
    color: colors.gold,
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  title: {
    color: colors.tx,
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 38,
  },
  subtitle: {
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 580,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.br,
    ...shadow.card,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.tx,
    fontFamily: fontFamily.display,
    fontSize: 24,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroKicker: {
    color: colors.mu,
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroName: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 20,
  },
  heroBody: {
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
  noticeCard: {
    gap: 10,
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: colors.goldLight,
    borderWidth: 1,
    borderColor: colors.br,
  },
  noticeTitle: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
  },
  noticeBody: {
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: '48%',
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.br,
    gap: 6,
    ...shadow.card,
  },
  summaryLabel: {
    color: colors.mu,
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
  },
  sectionCard: {
    gap: 12,
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.br,
    ...shadow.card,
  },
  sectionTitle: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 18,
  },
  sectionBody: {
    color: colors.mu,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
  linkList: {
    gap: 10,
  },
  linkRow: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.br,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: {
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
  },
  linkTextDanger: {
    color: colors.err,
  },
  linkArrow: {
    color: colors.mu,
    fontFamily: fontFamily.display,
    fontSize: 20,
  },
});
