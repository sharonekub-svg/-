import { Redirect, type Href, useLocalSearchParams } from 'expo-router';

export default function OrderNewRedirect() {
  const params = useLocalSearchParams();
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      query.set(key, value);
    }
  }

  const suffix = query.toString();
  const href = (suffix ? `/(tabs)/order/new?${suffix}` : '/(tabs)/order/new') as Href;
  return <Redirect href={href} />;
}
