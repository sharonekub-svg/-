type FetchProductPageResponse = {
  html: string;
};

export async function fetchProductPageHtml(url: string): Promise<string | null> {
  const endpoint =
    typeof window === 'undefined'
      ? `https://${process.env.EXPO_PUBLIC_UNIVERSAL_LINK_HOST ?? 'shakana1.vercel.app'}/api/fetch-product-page`
      : '/api/fetch-product-page';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as FetchProductPageResponse;
  return data.html || null;
}
