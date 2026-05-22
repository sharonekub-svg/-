import { Redirect, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const rootNavigationState = useRootNavigationState();
  const session = useAuthStore((s) => s.session);
  if (!rootNavigationState?.key) return null;
  return session ? <Redirect href="/(tabs)/building" /> : <Redirect href="/login" />;
}
