import { Tabs } from 'expo-router';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useLocale } from '@/i18n/locale';

type IconProps = { color: string; active: boolean };
const strokeWidth = (active: boolean) => (active ? 2.2 : 1.7);

function HomeIcon({ color, active }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth(active)} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11l9-7 9 7" />
      <Path d="M5 10v10h14V10" />
      <Path d="M9 20v-6h6v6" />
    </Svg>
  );
}

function OrdersIcon({ color, active }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth(active)} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={4} width={18} height={16} rx={4} />
      <Line x1={7} y1={9} x2={17} y2={9} />
      <Line x1={7} y1={13} x2={13} y2={13} />
      <Path d="M16 13l1.5 1.5L21 11" />
    </Svg>
  );
}

function ProfileIcon({ color, active }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth(active)} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

export default function TabsLayout() {
  const { t } = useLocale();
  const mainRoutes = new Set(['building', 'orders', 'account']);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tx,
        tabBarInactiveTintColor: colors.mu2,
        tabBarLabelStyle: { fontFamily: fontFamily.bodyBold, fontSize: 10 },
        tabBarItemStyle: { flex: 1, paddingTop: 4 },
        tabBarStyle: {
          borderTopColor: colors.br,
          borderTopWidth: 1,
          backgroundColor: 'rgba(247,245,240,0.98)',
          paddingTop: 8,
          paddingBottom: 10,
          height: 82,
          flexDirection: 'row',
          ...shadow.card,
        },
        tabBarButton: mainRoutes.has(route.name) ? undefined : () => null,
        tabBarIcon: ({ color, focused }) => {
          if (route.name === 'building') return <HomeIcon color={color} active={focused} />;
          if (route.name === 'orders') return <OrdersIcon color={color} active={focused} />;
          return <ProfileIcon color={color} active={focused} />;
        },
      })}
    >
      <Tabs.Screen
        name="building"
        options={{
          title: t('tabs.home.title'),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('tabs.orders.title'),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabs.profile.title'),
        }}
      />
    </Tabs>
  );
}
