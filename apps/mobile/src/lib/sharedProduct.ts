import { env } from './env';
import { getStoredValue, removeStoredValue, setStoredValue } from './secureStorage';

const STORAGE_KEY = 'shakana.pendingSharedProduct';

export type SharedProductDraft = {
  url: string;
  title: string;
  source: string;
  storeLabel: string;
  rawText?: string;
};

export type SharedProductInsights = {
  title: string;
  brandName: string | null;
  imageUrl: string | null;
  priceAgorot: number | null;
  originalPriceAgorot: number | null;
  deliveryFeeAgorot: number;
  storePickupFeeAgorot: number;
  freeShippingThresholdAgorot: number;
  recommendedParticipants: number;
  neighborsNeeded: number;
  perPersonAgorot: number;
  dealSummary: string | null;
  promotionText: string | null;
  productFacts: string[];
  sourceLabel: string;
  sourceUrl: string;
  amountMissingForFreeShippingAgorot: number | null;
  availableSizes: string[];
  availableColors: string[];
};

export type ProductPageHtmlFetcher = (url: string) => Promise<string | null>;

const TRACKER_KEYS = new Set([
  'gclid',
  'fbclid',
  'igshid',
  '_encoding',
  'content-id',
  'dib',
  'dib_tag',
  'keywords',
  'pd_rd_r',
  'pd_rd_w',
  'pd_rd_wg',
  'qid',
  'ref',
  's',
  'sbo',
  'sr',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

const STORE_PICKUP_FEE_AGOROT = 0;
const DEFAULT_HOME_DELIVERY_FEE_AGOROT = 3000;
const DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT = 19900;
const CURRENCY_TO_ILS_AGOROT: Record<string, number> = {
  ILS: 100,
  USD: 313,
  EUR: 357,
  GBP: 424,
};

const SHEKEL_MARKERS = ['₪', 'ש"ח', 'ש״ח', 'ILS', 'NIS'];

function normalizeCurrencyMarkers(raw: string | number): string {
  return String(raw)
    .replace(/&#8362;|&shekel;/gi, '₪')
    .replace(/&nbsp;/gi, ' ')
    .replace(/ש["״׳']?ח/g, 'ש"ח');
}

type BrandConfig = {
  source: string;
  brandName: string;
  displayName: string;
  hostTest: (hostname: string) => boolean;
  productPathTest: (url: URL) => boolean;
  homeDeliveryFeeAgorot: number;
  freeShippingThresholdAgorot: number;
};

const BRAND_CONFIGS: BrandConfig[] = [
  {
    source: 'amazon',
    brandName: 'Amazon',
    displayName: 'Amazon',
    hostTest: (hostname) => /(?:^|\.)amazon\./i.test(normalizeHost(hostname)),
    productPathTest: (url) => /\/(?:dp|gp\/product|product)\/[A-Z0-9]{10}(?:\/|$)/i.test(url.pathname),
    homeDeliveryFeeAgorot: DEFAULT_HOME_DELIVERY_FEE_AGOROT,
    freeShippingThresholdAgorot: DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT,
  },
  {
    source: 'zara',
    brandName: 'Zara',
    displayName: 'Zara',
    hostTest: (hostname) => normalizeHost(hostname).endsWith('zara.com'),
    productPathTest: (url) => /(?:^|-)p\d{5,}(?:\.html)?$/i.test(url.pathname.split('/').pop() ?? ''),
    homeDeliveryFeeAgorot: DEFAULT_HOME_DELIVERY_FEE_AGOROT,
    freeShippingThresholdAgorot: DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT,
  },
  {
    source: 'hm',
    brandName: 'H&M',
    displayName: 'H&M',
    hostTest: (hostname) => normalizeHost(hostname).endsWith('hm.com'),
    productPathTest: (url) => /productpage|\/product[/_\-.]/i.test(url.pathname),
    homeDeliveryFeeAgorot: DEFAULT_HOME_DELIVERY_FEE_AGOROT,
    freeShippingThresholdAgorot: DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT,
  },
  {
    source: 'ksp',
    brandName: 'KSP',
    displayName: 'KSP',
    hostTest: (hostname) => normalizeHost(hostname).endsWith('ksp.co.il'),
    productPathTest: (url) => /\/(?:web\/)?item\/\d+(?:\/|$)/i.test(url.pathname),
    homeDeliveryFeeAgorot: DEFAULT_HOME_DELIVERY_FEE_AGOROT,
    freeShippingThresholdAgorot: DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT,
  },
  {
    source: 'terminalx',
    brandName: 'TerminalX',
    displayName: 'TerminalX',
    hostTest: (hostname) => normalizeHost(hostname).endsWith('terminalx.com'),
    productPathTest: (url) => /\/[a-z0-9%-]+-\d{4,}/i.test(url.pathname),
    homeDeliveryFeeAgorot: DEFAULT_HOME_DELIVERY_FEE_AGOROT,
    freeShippingThresholdAgorot: DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT,
  },
  {
    source: 'shein',
    brandName: 'Shein',
    displayName: 'Shein',
    hostTest: (hostname) => normalizeHost(hostname).endsWith('shein.com'),
    productPathTest: (url) => /-p-\d+/i.test(url.pathname),
    homeDeliveryFeeAgorot: 0,
    freeShippingThresholdAgorot: 0,
  },
  {
    source: 'aliexpress',
    brandName: 'AliExpress',
    displayName: 'AliExpress',
    hostTest: (hostname) => normalizeHost(hostname).endsWith('aliexpress.com'),
    productPathTest: (url) => /\/item\/\d+/i.test(url.pathname),
    homeDeliveryFeeAgorot: 0,
    freeShippingThresholdAgorot: 0,
  },
];

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function getBrandConfig(hostname: string): BrandConfig | null {
  return BRAND_CONFIGS.find((config) => config.hostTest(hostname)) ?? null;
}

function labelFromHostname(hostname: string): string {
  const host = normalizeHost(hostname).replace(/^(?:m|www2|shop|store)\./, '');
  const parts = host.split('.').filter(Boolean);
  const twoPartSuffixes = new Set(['co.il', 'org.il', 'net.il', 'ac.il', 'co.uk', 'com.au']);
  const suffix = parts.slice(-2).join('.');
  const brandPart = twoPartSuffixes.has(suffix)
    ? parts[parts.length - 3]
    : parts.length > 1
      ? parts[parts.length - 2]
      : parts[0];
  const raw = brandPart || host;
  const known: Record<string, string> = {
    amazon: 'Amazon',
    hm: 'H&M',
    ksp: 'KSP',
    zara: 'Zara',
    terminalx: 'TerminalX',
    shein: 'Shein',
    aliexpress: 'AliExpress',
  };
  return known[raw] ?? raw.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function sourceFromHostname(hostname: string): string {
  return labelFromHostname(hostname).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'store';
}

function looksLikeNonProductPage(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  if (!path || path === '/') return true;
  // Only block pages that are clearly not products.
  // category/catalog kept: many stores embed them in the product URL path.
  return /\/(?:cart|basket|checkout|login|account|search|wishlist)(?:\/|$)/i.test(path);
}

function looksLikeGenericProductPage(url: URL): boolean {
  if (looksLikeNonProductPage(url)) return false;
  const path = decodeURIComponent(url.pathname).toLowerCase();
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return false;

  if (/\/(?:p|product|products|item|items|sku|catalog|shop|goods|prod)(?:\/|-|_|\.)/i.test(path)) return true;
  if (/\b(?:product|item|sku|model|pid|variant|id)\b/i.test(url.search)) return true;
  if (segments.some((segment) => /(?:^|[-_])(?:p|sku|item)\d{3,}|[a-z0-9-_%]+-\d{3,}$/i.test(segment))) return true;
  if (segments.length >= 2 && /[a-zא-ת]/i.test(segments[segments.length - 1] ?? '')) return true;

  return false;
}

function parseCleanUrl(raw: string): URL | null {
  try {
    const cleaned = cleanRawUrl(raw);
    const withProtocol = /^https?:\/\//i.test(cleaned)
      ? cleaned
      : /^(?:www\.)?[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(cleaned)
        ? `https://${cleaned}`
        : cleaned;
    const url = new URL(withProtocol);
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function safeProductUrl(raw: string): URL | null {
  const url = parseCleanUrl(raw);
  if (!url) return null;
  if (looksLikeNonProductPage(url)) return null;
  const brand = getBrandConfig(url.hostname);
  if (!brand) return looksLikeGenericProductPage(url) ? url : null;
  return brand.productPathTest(url) || looksLikeGenericProductPage(url) ? url : null;
}

function likelyProductUrl(raw: string): URL | null {
  const url = safeProductUrl(raw);
  return url;
}

function stripTrackingParams(url: URL): URL {
  const cleaned = new URL(url.toString());
  const brand = getBrandConfig(cleaned.hostname);
  if (brand?.source === 'amazon') {
    const asin = cleaned.pathname.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i)?.[1];
    if (asin) {
      const parts = cleaned.pathname.split('/').filter(Boolean);
      const productIndex = parts.findIndex((part, index) => {
        const normalized = part.toLowerCase();
        return normalized === 'dp' || normalized === 'product' || (normalized === 'gp' && parts[index + 1]?.toLowerCase() === 'product');
      });
      const titleParts = productIndex > 0 ? parts.slice(0, productIndex) : [];
      cleaned.pathname = titleParts.length ? `/${titleParts.join('/')}/dp/${asin}` : `/dp/${asin}`;
    }
    cleaned.search = '';
    cleaned.hash = '';
    return cleaned;
  }

  const keysToDelete: string[] = [];
  cleaned.searchParams.forEach((_, key) => {
    if (key.startsWith('utm_') || TRACKER_KEYS.has(key)) keysToDelete.push(key);
  });
  for (const key of keysToDelete) cleaned.searchParams.delete(key);
  cleaned.hash = '';
  return cleaned;
}

function cleanRawUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^[<("']+/, '')
    .replace(/[>)"',.]+$/, '');
}

function getCandidateUrls(text: string): string[] {
  const matches = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) ?? [];
  const decodedMatches = matches.flatMap((candidate) => {
    try {
      const url = new URL(cleanRawUrl(candidate));
      return ['url', 'u', 'link', 'productUrl', 'redirect'].map((key) => url.searchParams.get(key)).filter(Boolean) as string[];
    } catch {
      return [];
    }
  });
  return [...matches, ...decodedMatches].map(cleanRawUrl);
}

function extractUrl(text: string): string | null {
  const candidates = getCandidateUrls(text);
  return (
    candidates.find((candidate) => {
      const url = likelyProductUrl(candidate);
      return url && getBrandConfig(url.hostname);
    }) ??
    candidates.find((candidate) => likelyProductUrl(candidate)) ??
    null
  );
}

function humanizeSlug(slug: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();
  const cleaned = decoded
    .replace(/\.(html?|aspx?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Product item';
  const title = cleaned
    .split(' ')
    .map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
  return polishInferredTitle(title);
}

function polishInferredTitle(title: string): string {
  return title
    .replace(/\bASUS\s+Strix\b/i, 'ASUS ROG Strix')
    .replace(/\bAsus\b/g, 'ASUS')
    .replace(/\bRog\b/g, 'ROG')
    .trim();
}

function inferTitleFromUrl(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  const amazonDpIndex = parts.findIndex((part) => part.toLowerCase() === 'dp');
  if (amazonDpIndex > 0) {
    const titleSlug = parts[amazonDpIndex - 1] ?? '';
    return humanizeSlug(titleSlug);
  }
  if (amazonDpIndex === 0) return 'Product item';
  const itemId = url.pathname.match(/\/(?:web\/)?item\/(\d+)(?:\/|$)/i)?.[1];
  if (itemId) return `${labelFromHostname(url.hostname)} item ${itemId}`;
  const slug = parts[parts.length - 1] ?? '';
  if (/^\d+$/.test(slug)) return `${labelFromHostname(url.hostname)} item ${slug}`;
  const title = humanizeSlug(slug);
  return title === 'Item' ? 'Product item' : title;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function readMeta(html: string, key: string, attr: 'property' | 'name' = 'property'): string | null {
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i',
  );
  const match = html.match(pattern);
  return match?.[1]?.trim() || null;
}

function readContentByAttribute(html: string, attr: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attrBeforeContent = new RegExp(
    `<[^>]+${attr}=["']${escapedKey}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i',
  );
  const contentBeforeAttr = new RegExp(
    `<[^>]+content=["']([^"']+)["'][^>]*${attr}=["']${escapedKey}["'][^>]*>`,
    'i',
  );
  return html.match(attrBeforeContent)?.[1]?.trim() ?? html.match(contentBeforeAttr)?.[1]?.trim() ?? null;
}

function readFirstJsonLdObject(html: string): Record<string, unknown> | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const item = stack.shift();
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const type = obj['@type'];
        if (typeof type === 'string' && type.toLowerCase().includes('product')) {
          return obj;
        }
        if (Array.isArray(type) && type.some((entry) => typeof entry === 'string' && entry.toLowerCase().includes('product'))) {
          return obj;
        }
        for (const value of Object.values(obj)) {
          if (Array.isArray(value)) stack.push(...value);
          else if (value && typeof value === 'object') stack.push(value as Record<string, unknown>);
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

function readDescription(html: string): string | null {
  const jsonLd = readFirstJsonLdObject(html);
  const ldDescription = jsonLd && typeof jsonLd.description === 'string' ? jsonLd.description : null;
  return readMeta(html, 'description', 'name') ?? readMeta(html, 'og:description') ?? ldDescription;
}

function readBrand(html: string): string | null {
  const jsonLd = readFirstJsonLdObject(html);
  const brand = jsonLd?.brand;
  if (typeof brand === 'string') return brand.trim() || null;
  if (brand && typeof brand === 'object') {
    const name = (brand as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return readMeta(html, 'og:site_name');
}

function isGenericPageTitle(title: string, fallback: string): boolean {
  const normalized = title.trim().replace(/\s+/g, ' ');
  const fallbackNormalized = fallback.trim().replace(/\s+/g, ' ');
  if (!normalized) return true;
  if (normalized === fallbackNormalized) return false;
  if (/^(?:KSP|Amazon|ZARA|H&M|Home|Product|Store)$/i.test(normalized)) return true;
  if (normalized.length < 4 && fallbackNormalized.length > 3) return true;
  return false;
}

function chooseTitle(html: string, fallback: string): string {
  const jsonLd = readFirstJsonLdObject(html);
  const ogTitle = readMeta(html, 'og:title');
  const twitterTitle = readMeta(html, 'twitter:title');
  const ldTitle = jsonLd && typeof jsonLd.name === 'string' ? jsonLd.name : null;
  const headTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const raw = ldTitle ?? ogTitle ?? twitterTitle ?? headTitleMatch?.[1] ?? fallback;
  const stripped = stripTags(raw)
    .replace(/\s+\|\s+[^|]+$/i, '')
    .replace(/\s+-\s+(Amazon|ZARA|H&M).*$/i, '')
    .replace(/^Amazon\.[a-z.]+:\s*/i, '')
    .trim();
  if (isGenericPageTitle(stripped, fallback)) return polishInferredTitle(fallback);
  return polishInferredTitle(stripped || fallback);
}

function chooseImage(html: string): string | null {
  const jsonLd = readFirstJsonLdObject(html);
  const ldImage = jsonLd?.image;
  if (typeof ldImage === 'string') return ldImage;
  if (Array.isArray(ldImage)) {
    const first = ldImage.find((item) => typeof item === 'string');
    if (typeof first === 'string') return first;
  }
  return readMeta(html, 'og:image') ?? readMeta(html, 'twitter:image');
}

function detectCurrency(raw: string | number): keyof typeof CURRENCY_TO_ILS_AGOROT {
  const text = normalizeCurrencyMarkers(raw);
  if (SHEKEL_MARKERS.some((marker) => text.toUpperCase().includes(marker.toUpperCase()))) return 'ILS';
  if (/€|EUR/i.test(text)) return 'EUR';
  if (/£|GBP/i.test(text)) return 'GBP';
  if (/\$|USD/i.test(text)) return 'USD';
  return 'ILS';
}

function parseMoneyToAgorot(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const currency = detectCurrency(raw);
  const text = normalizeCurrencyMarkers(raw).replace(/[^\d.,-]/g, '');
  if (!text) return null;
  const normalized = (() => {
    if (text.includes(',') && text.includes('.')) return text.replace(/,/g, '');
    if (text.includes(',') && /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) return text.replace(/,/g, '');
    return text.replace(',', '.');
  })();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rate = CURRENCY_TO_ILS_AGOROT[currency];
  return Math.round(value * (typeof rate === 'number' ? rate : 100));
}

function parseStoreMinorUnitsToAgorot(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).replace(/[^\d]/g, '');
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value >= 1000 ? value : value * 100;
}

function sliceAroundPattern(html: string, pattern: RegExp, before = 600, after = 6000): string | null {
  const match = pattern.exec(html);
  if (!match || typeof match.index !== 'number') return null;
  return html.slice(Math.max(0, match.index - before), Math.min(html.length, match.index + after));
}

function readSsrJson(html: string): unknown {
  // Next.js stores the full server-rendered page props in __NEXT_DATA__.
  // Nuxt and others use __NUXT__ / __INITIAL_STATE__ / __reactiveStore__.
  const nextMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch?.[1]) {
    try { return JSON.parse(nextMatch[1]); } catch { /* ignore */ }
  }
  const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]{0,200000}\})\s*;?\s*<\/script>/i);
  if (nuxtMatch?.[1]) {
    try { return JSON.parse(nuxtMatch[1]); } catch { /* ignore */ }
  }
  return null;
}

function deepFindPriceInObject(obj: unknown, depth = 0): number | null {
  if (depth > 7 || !obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const priceKeys = ['price', 'finalPrice', 'salePrice', 'currentPrice', 'regularPrice', 'sellingPrice', 'displayPrice', 'priceValue', 'unitPrice', 'offerPrice'];
  for (const key of priceKeys) {
    if (key in o) {
      const val = o[key];
      const parsed = typeof val === 'object' ? null : parseMoneyToAgorot(val as string | number | null);
      if (parsed && parsed > 99 && parsed < 50_000_000) return parsed;
    }
  }
  for (const value of Object.values(o)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const found = deepFindPriceInObject(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function chooseSsrPriceAgorot(html: string): number | null {
  const data = readSsrJson(html);
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  // Next.js: props.pageProps contains the product data
  const pageProps = (obj['props'] as Record<string, unknown> | null)?.['pageProps'];
  if (pageProps) {
    const found = deepFindPriceInObject(pageProps);
    if (found) return found;
  }
  // Nuxt / other: search top level
  return deepFindPriceInObject(obj);
}

function chooseAmazonScopedPriceAgorot(html: string): number | null {
  const scopes = [
    sliceAroundPattern(html, /id=["']corePrice_feature_div["']/i, 0),
    sliceAroundPattern(html, /id=["']apex_desktop["']/i, 0),
    sliceAroundPattern(html, /id=["']corePriceDisplay_desktop_feature_div["']/i, 0),
    sliceAroundPattern(html, /id=["']tp_price_block_total_price_ww["']/i, 0),
    sliceAroundPattern(html, /class=["'][^"']*apexPriceToPay[^"']*["']/i, 0),
    sliceAroundPattern(html, /class=["'][^"']*priceToPay[^"']*["']/i, 0),
  ].filter(Boolean) as string[];

  for (const scope of scopes) {
    const offscreen = scope.match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*(?<price>[$₪€£]?\s?\d[\d,.]*)\s*</i)?.groups?.price;
    const parsedOffscreen = parseMoneyToAgorot(offscreen ?? null);
    if (parsedOffscreen) return parsedOffscreen;

    const displayPrice = scope.match(/"displayPrice"\s*:\s*"(?<price>[^"]*\d[^"]*)"/i)?.groups?.price;
    const parsedDisplayPrice = parseMoneyToAgorot(displayPrice ?? null);
    if (parsedDisplayPrice) return parsedDisplayPrice;

    const whole = scope.match(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>(?<whole>[\s\S]{0,80}?)<\/span>/i)?.groups?.whole;
    const fraction = scope.match(/class=["'][^"']*a-price-fraction[^"']*["'][^>]*>(?<fraction>\d{1,2})<\/span>/i)?.groups?.fraction;
    if (whole) {
      const cleanWhole = stripTags(whole).replace(/[^\d,]/g, '').replace(/,$/, '');
      const symbol = /[$]/.test(scope) ? '$' : /[€]/.test(scope) ? '€' : /[£]/.test(scope) ? '£' : /[₪]/.test(scope) ? '₪' : '';
      const parsedSplit = parseMoneyToAgorot(`${symbol}${cleanWhole}${fraction ? `.${fraction}` : ''}`);
      if (parsedSplit) return parsedSplit;
    }
  }

  return null;
}

function choosePriceAgorot(html: string): number | null {
  const jsonLd = readFirstJsonLdObject(html);
  const offers = jsonLd?.offers;
  const readOfferPrice = (offer: unknown): number | null => {
    if (!offer || typeof offer !== 'object') return null;
    const obj = offer as Record<string, unknown>;
    const ctxCurrency = typeof obj.priceCurrency === 'string' ? obj.priceCurrency.trim() : null;
    const parseTagged = (val: unknown, ctx = ctxCurrency): number | null => {
      if (val == null) return null;
      const text = String(val);
      const tagged = ctx && /^\d[\d,. ]*$/.test(text.trim()) ? `${text} ${ctx}` : text;
      return parseMoneyToAgorot(tagged);
    };
    const direct = parseTagged(obj.price);
    if (direct) return direct;
    const priceValue = parseTagged(obj.priceValue);
    if (priceValue) return priceValue;
    if (obj.price && typeof obj.price === 'object') {
      const nested = obj.price as Record<string, unknown>;
      const nestedCtx = typeof nested.currency === 'string' ? nested.currency.trim() : ctxCurrency;
      const nestedValue = parseTagged(nested.value, nestedCtx);
      if (nestedValue) return nestedValue;
    }
    if (Array.isArray(obj.priceSpecification)) {
      for (const spec of obj.priceSpecification) {
        if (spec && typeof spec === 'object') {
          const specObj = spec as Record<string, unknown>;
          const specCtx = typeof specObj.priceCurrency === 'string' ? specObj.priceCurrency.trim() : ctxCurrency;
          const next = parseTagged(specObj.price, specCtx);
          if (next) return next;
        }
      }
    }
    return null;
  };
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const next = readOfferPrice(offer);
      if (next) return next;
    }
  } else if (offers && typeof offers === 'object') {
    const direct = readOfferPrice(offers);
    if (direct) return direct;
  }

  const ssrPrice = chooseSsrPriceAgorot(html);
  if (ssrPrice) return ssrPrice;

  const amazonScopedPrice = chooseAmazonScopedPriceAgorot(html);
  if (amazonScopedPrice) return amazonScopedPrice;

  const metaPrice =
    readMeta(html, 'product:price:amount') ??
    readMeta(html, 'og:price:amount') ??
    readMeta(html, 'twitter:data1', 'name') ??
    readContentByAttribute(html, 'itemprop', 'price') ??
    readContentByAttribute(html, 'property', 'price');
  const parsedMeta = parseMoneyToAgorot(metaPrice);
  if (parsedMeta) return parsedMeta;

  const amazonPricePatterns = [
    /class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*(?<price>[$₪€£]?\s?\d[\d,.]*)\s*</i,
    /id=["']priceblock_[^"']+["'][^>]*>\s*(?<price>[$₪€£]?\s?\d[\d,.]*)\s*</i,
    /"displayPrice"\s*:\s*"(?<price>[^"]*\d[^"]*)"/i,
  ];
  for (const pattern of amazonPricePatterns) {
    const parsed = parseMoneyToAgorot(html.match(pattern)?.groups?.price ?? null);
    if (parsed) return parsed;
  }

  const htmlEntityDecoded = html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8362;|&shekel;/gi, '₪')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

  const explicitPricePatterns = [
    /data-(?:price|sale-price|final-price|current-price|amount)=["'](?<price>[^"']*\d[^"']*)["']/i,
    /itemprop=["']price["'][^>]*(?:content|value)=["'](?<price>[^"']*\d[^"']*)["']/i,
    /(?:content|value)=["'](?<price>[^"']*\d[^"']*)["'][^>]*itemprop=["']price["']/i,
    /"(?:priceAmount|regularPrice|sale_price|final_price|current_price|unitPrice|sellingPrice|priceValue)"\s*:\s*"?(?<price>\d+(?:[.,]\d+)?)"?/i,
    /"(?:price|currentPrice|salePrice|finalPrice|regularPrice|sellingPrice)"\s*:\s*\{[^{}]{0,180}"(?:amount|value|current|price)"\s*:\s*"?(?<price>\d+(?:[.,]\d+)?)"?/i,
  ];
  for (const pattern of explicitPricePatterns) {
    const parsed = parseMoneyToAgorot(htmlEntityDecoded.match(pattern)?.groups?.price ?? null);
    if (parsed) return parsed;
  }

  const visibleText = stripTags(htmlEntityDecoded).replace(/\s+/g, ' ').slice(0, 60000);
  const visiblePricePatterns = [
    /(?:מחיר|price|sale price|special price|now)[^₪$€£\d]{0,50}(?<price>[₪$€£]\s?\d[\d,.]*)/i,
    /(?:מחיר|price|sale price|special price|now)[^\d]{0,50}(?<price>\d[\d,.]*\s?(?:₪|ש["״]?ח|ILS|NIS))/i,
    /(?<price>[₪$€£]\s?\d[\d,.]*)/,
    /(?<price>\d[\d,.]*\s?(?:₪|ש["״]?ח|ILS|NIS))/i,
  ];
  for (const pattern of visiblePricePatterns) {
    const parsed = parseMoneyToAgorot(visibleText.match(pattern)?.groups?.price ?? null);
    if (parsed) return parsed;
  }

  const structuredMinorUnitMatch = html.match(/"(?:price|finalPrice|salePrice|currentPrice)"\s*:\s*"?(?<price>\d{4,7})"?/i);
  const minorUnits = parseStoreMinorUnitsToAgorot(structuredMinorUnitMatch?.groups?.price ?? null);
  if (minorUnits) return minorUnits;

  const genericPatterns = [
    /"(?:price|salePrice|currentPrice|finalPrice|priceValue|amount)"\s*:\s*"?(?<price>\d+(?:[.,]\d+)?)"?/i,
    /"(?:price|salePrice|currentPrice|finalPrice)"\s*:\s*\{[^}]*"(?:value|amount)"\s*:\s*"?(?<price>\d+(?:[.,]\d+)?)"?/i,
  ];
  for (const pattern of genericPatterns) {
    const parsed = parseMoneyToAgorot(html.match(pattern)?.groups?.price ?? null);
    if (parsed) return parsed;
  }
  return null;
}

function chooseDeliveryFeeAgorot(html: string, fallbackAgorot: number): number {
  const text = stripTags(html).replace(/\s+/g, ' ').slice(0, 20000);
  const thresholdMention =
    /\bfree\s+(?:delivery|shipping)\s+(?:from|over|above|on\s+orders\s+(?:from|over|above))[^.]{0,90}\d[\d,.]*/i.test(text) ||
    /(?:משלוח|delivery|shipping)\s+(?:חינם|free)\s+(?:מ|מעל|from|over|above)[^.]{0,90}\d[\d,.]*/i.test(text);
  if (thresholdMention) {
    const explicitFee =
      text.match(/(?:shipping|delivery)\s+(?:fee|cost|price)[^$€£₪\d]{0,80}(?<price>[$€£₪]\s?\d[\d,.]*)/i)?.groups?.price ??
      text.match(/(?:דמי|עלות|מחיר)\s+משלוח[^₪\d]{0,80}(?<price>₪\s?\d[\d,.]*)/i)?.groups?.price;
    const parsedExplicitFee = parseMoneyToAgorot(explicitFee ?? null);
    return parsedExplicitFee ?? fallbackAgorot;
  }
  if (/\bfree\s+(?:delivery|shipping)\b/i.test(text) || /משלוח\s+חינם/i.test(text)) return 0;

  const shippingPatterns = [
    /(?:shipping|delivery)[^₪$€£\d]{0,80}(?<price>[₪$€£]?\s?\d[\d,.]*)/i,
    /(?<price>[₪$€£]?\s?\d[\d,.]*)[^.]{0,80}(?:shipping|delivery)/i,
    /משלוח[^₪\d]{0,80}(?<price>₪?\s?\d[\d,.]*)/i,
    /"(?:shipping|delivery)(?:Fee|Price|Cost)?"\s*:\s*"?(?<price>\d+(?:[.,]\d+)?)"?/i,
    /(?:shipping|delivery)[^$₪€£]{0,80}(?<price>[$₪€£]\s?\d[\d,.]*)/i,
    /(?<price>[$₪€£]\s?\d[\d,.]*)[^.]{0,80}(?:shipping|delivery)/i,
    /משלוח[^₪]{0,80}(?<price>₪\s?\d[\d,.]*)/i,
  ];
  for (const pattern of shippingPatterns) {
    const match = pattern.exec(text);
    const parsed = parseMoneyToAgorot(match?.groups?.price ?? null);
    if (parsed != null) {
      const around = match && typeof match.index === 'number'
        ? text.slice(Math.max(0, match.index - 90), Math.min(text.length, match.index + 140))
        : '';
      const looksLikeFreeShippingThreshold =
        parsed >= 10000 &&
        /\bfree\b|חינם|from|over|above|מעל|מסכום|משלוח חינם/i.test(around);
      if (!looksLikeFreeShippingThreshold) return parsed;
    }
  }

  return fallbackAgorot;
}

function chooseOriginalPriceAgorot(html: string): number | null {
  const candidates = [
    readMeta(html, 'product:original_price:amount'),
    readMeta(html, 'og:original_price:amount'),
    readMeta(html, 'price:original', 'name'),
  ];
  for (const candidate of candidates) {
    const parsed = parseMoneyToAgorot(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function choosePromotionText(html: string): string | null {
  const description = readDescription(html);
  const text = stripTags(html).slice(0, 12000);
  const normalized = [description, text].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const promoPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\b1\s*\+\s*1\b/i, label: '1+1' },
    { pattern: /\bbuy\s*1\s*get\s*1\b/i, label: 'Buy 1 get 1' },
    { pattern: /\b2\s*(?:for|x|×)\s*1\b/i, label: '2 for 1' },
    { pattern: /קנה\s*1\s*קבל\s*1/i, label: '1+1' },
    { pattern: /\bsale\b/i, label: 'Sale' },
    { pattern: /מבצע/i, label: 'מבצע' },
  ];
  for (const entry of promoPatterns) {
    if (entry.pattern.test(normalized)) return entry.label;
  }
  return null;
}

function formatAmountShort(agorot: number): string {
  return (agorot / 100).toFixed(2).replace(/\.00$/, '');
}

function chooseProductFacts(
  html: string,
  brandName: string | null,
  promotionText: string | null,
  priceAgorot: number | null,
  originalPriceAgorot: number | null,
): string[] {
  const facts = new Set<string>();
  const jsonLd = readFirstJsonLdObject(html);

  if (brandName) facts.add(brandName);
  if (promotionText) facts.add(promotionText);

  const color = jsonLd && typeof jsonLd.color === 'string' ? jsonLd.color.trim() : null;
  const sku = jsonLd && typeof jsonLd.sku === 'string' ? jsonLd.sku.trim() : null;
  const category = jsonLd && typeof jsonLd.category === 'string' ? jsonLd.category.trim() : null;
  const description = readDescription(html);

  if (color) facts.add(`Color: ${color}`);
  if (sku) facts.add(`SKU: ${sku}`);
  if (category) facts.add(category);
  if (description) facts.add(description.replace(/\s+/g, ' ').slice(0, 120));
  if (priceAgorot && originalPriceAgorot && originalPriceAgorot > priceAgorot) {
    facts.add(`Before ${formatAmountShort(originalPriceAgorot)}`);
  }

  return [...facts].filter(Boolean);
}

function uniqueLimited(values: Array<string | null | undefined>, limit = 10): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const value of values) {
    const next = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!next || next.length > 30) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(next);
    if (clean.length >= limit) break;
  }
  return clean;
}

function looksLikeRealSize(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 40) return false;
  return (
    /^(?:XXS|XS|S|M|L|XL|XXL|XXXL)$/i.test(text) ||
    /^(?:Twin|Full|Queen|King|California King|Single|Double)$/i.test(text) ||
    /^\d{1,3}(?:\.\d)?(?:\s?(?:cm|mm|m|in|inch|inches|ft|feet|["']))?(?:\s?[xX×]\s?\d{1,3}(?:\.\d)?(?:\s?(?:cm|mm|m|in|inch|inches|ft|feet|["']))?){0,2}$/i.test(text) ||
    /^\d{1,2}(?:\.\d)?\s?(?:US|UK|EU)$/i.test(text)
  );
}

function looksLikeRealVariant(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 36) return false;
  if (/^(?:true|false|null|undefined|default|select|choose|none|yes|no)$/i.test(text)) return false;
  if (/^\d+$/.test(text) && text.length > 3) return false;
  if (/https?:\/\//i.test(text)) return false;
  return /[a-zא-ת]/i.test(text);
}

function chooseVariantOptions(html: string): { availableSizes: string[]; availableColors: string[] } {
  const jsonLd = readFirstJsonLdObject(html);
  const rawColor = jsonLd && typeof jsonLd.color === 'string' ? jsonLd.color : null;
  const decoded = html
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ');

  const explicitSizeValues = [...decoded.matchAll(/"(?:size|sizeName|displaySize|selectedSize|variationSize|dimensions?)"\s*:\s*"(?<value>[^"]{1,40})"/gi)]
    .map((m) => m.groups?.value)
    .filter((value): value is string => Boolean(value && looksLikeRealSize(value)));
  const dimensionValues = [...decoded.matchAll(/\b(?<value>\d{1,3}(?:\.\d)?\s?(?:cm|mm|m|in|inch|inches|ft|feet|["'])?\s?[xX×]\s?\d{1,3}(?:\.\d)?\s?(?:cm|mm|m|in|inch|inches|ft|feet|["'])?(?:\s?[xX×]\s?\d{1,3}(?:\.\d)?\s?(?:cm|mm|m|in|inch|inches|ft|feet|["'])?)?)\b/gi)]
    .map((m) => m.groups?.value);
  const namedSizeValues = [...decoded.matchAll(/\b(?<value>Twin XL|California King|Cal King|Twin|Full|Queen|King|Single|Double|Euro King|Euro)\b/gi)]
    .map((m) => m.groups?.value);
  const screenSizeValues = [...decoded.matchAll(/\b(32|40|43|50|55|65|75|85|98)\s*(?:"|inch|inches|״)\b/gi)]
    .map((m) => m[1] + '"');
  const dataSizeValues = [...decoded.matchAll(/data-(?:size|option-value)=["']([^"']{1,20})["']/gi)]
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v && looksLikeRealSize(v)));
  const sizeCandidates = [...explicitSizeValues, ...dimensionValues, ...namedSizeValues, ...screenSizeValues, ...dataSizeValues];

  const colorCandidates = [
    rawColor,
    ...[...decoded.matchAll(/"(?:color|colorName|colour|colourName|swatchName|swatchLabel|colorLabel)"\s*:\s*"(?<value>[^"]{2,30})"/gi)].map((m) => m.groups?.value),
    ...[...decoded.matchAll(/data-(?:color|colour|swatch|color-name|color-value)=["'](?<value>[^"']{2,30})["']/gi)].map((m) => m.groups?.value),
    ...[...decoded.matchAll(/aria-label=["'][^"']*(?:color|colour)\s*[:/]\s*(?<value>[^"',]{2,25})["']/gi)].map((m) => m.groups?.value),
  ];
  const flavorCandidates = [
    ...[...decoded.matchAll(/"(?:flavor|flavour|flavorName|flavourName|taste|scent|variant|variantName|option|optionName|optionValue|variationName)"\s*:\s*"(?<value>[^"]{2,36})"/gi)]
      .map((m) => m.groups?.value),
    ...[...decoded.matchAll(/<(?:option|button)[^>]*(?:data-option|data-value|value|aria-label)=["'](?<value>[^"']{2,36})["'][^>]*>/gi)]
      .map((m) => m.groups?.value),
    ...[...decoded.matchAll(/(?:flavor|flavour|taste|טעם|טעמים)[^<>"']{0,80}<[^>]+>(?<value>[^<]{2,36})<\/[^>]+>/gi)]
      .map((m) => m.groups?.value),
  ].filter((value): value is string => Boolean(value && looksLikeRealVariant(value)));

  return {
    availableSizes: uniqueLimited(sizeCandidates, 10),
    availableColors: uniqueLimited([...colorCandidates, ...flavorCandidates], 10),
  };
}

function deriveDealSummary(priceAgorot: number | null, originalPriceAgorot: number | null): string | null {
  if (!priceAgorot || !originalPriceAgorot || originalPriceAgorot <= priceAgorot) return null;
  const discount = Math.round((1 - priceAgorot / originalPriceAgorot) * 100);
  return `${discount}% off`;
}

export function summarizeSharedProduct(draft: SharedProductDraft, html?: string | null): SharedProductInsights {
  const brandConfig = getBrandConfig(new URL(draft.url).hostname);
  const priceAgorot = html ? choosePriceAgorot(html) : null;
  const originalPriceAgorot = html ? chooseOriginalPriceAgorot(html) : null;
  const brandName = html ? readBrand(html) : null;
  const promotionText = html ? choosePromotionText(html) : null;
  const fallbackDeliveryFeeAgorot = brandConfig && priceAgorot && priceAgorot >= brandConfig.freeShippingThresholdAgorot
    ? 0
    : (brandConfig?.homeDeliveryFeeAgorot ?? DEFAULT_HOME_DELIVERY_FEE_AGOROT);
  const deliveryFeeAgorot = html ? chooseDeliveryFeeAgorot(html, fallbackDeliveryFeeAgorot) : fallbackDeliveryFeeAgorot;
  const freeShippingThresholdAgorot = brandConfig?.freeShippingThresholdAgorot ?? DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT;
  const amountMissingForFreeShippingAgorot = priceAgorot == null ? null : Math.max(0, freeShippingThresholdAgorot - priceAgorot);
  const recommendedParticipants = 3;
  const neighborsNeeded = 2;
  const perPersonAgorot = Math.ceil(((priceAgorot ?? 0) + deliveryFeeAgorot) / recommendedParticipants);
  const productFacts = html
    ? chooseProductFacts(html, brandName ?? brandConfig?.brandName ?? null, promotionText, priceAgorot, originalPriceAgorot)
    : [];
  const variantOptions = html ? chooseVariantOptions(html) : { availableSizes: [], availableColors: [] };

  return {
    title: html ? chooseTitle(html, draft.title) : draft.title,
    brandName: brandName ?? brandConfig?.brandName ?? null,
    imageUrl: html ? chooseImage(html) : null,
    priceAgorot,
    originalPriceAgorot,
    deliveryFeeAgorot,
    storePickupFeeAgorot: STORE_PICKUP_FEE_AGOROT,
    freeShippingThresholdAgorot,
    recommendedParticipants,
    neighborsNeeded,
    perPersonAgorot,
    dealSummary: deriveDealSummary(priceAgorot, originalPriceAgorot),
    promotionText,
    productFacts,
    sourceLabel: brandConfig?.displayName ?? draft.storeLabel,
    sourceUrl: draft.url,
    amountMissingForFreeShippingAgorot,
    availableSizes: variantOptions.availableSizes,
    availableColors: variantOptions.availableColors,
  };
}

export async function loadSharedProductInsights(
  draft: SharedProductDraft,
  fetchProductPageHtml?: ProductPageHtmlFetcher,
): Promise<SharedProductInsights> {
  if (fetchProductPageHtml) {
    try {
      const backendHtml = await fetchProductPageHtml(draft.url);
      if (backendHtml) return summarizeSharedProduct(draft, backendHtml);
    } catch {
      // Fall back to direct public fetch or manual entry if the backend lookup is unavailable.
    }
  }

  try {
    const res = await fetch(draft.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return summarizeSharedProduct(draft);
    const html = await res.text();
    return summarizeSharedProduct(draft, html);
  } catch {
    return summarizeSharedProduct(draft);
  }
}

export function parseSharedProduct(input: {
  text?: string | null;
  url?: string | null;
  title?: string | null;
  manualStoreLabel?: string | null;
}): SharedProductDraft | null {
  const candidates = [
    ...(input.url ? [input.url] : []),
    ...(input.url ? getCandidateUrls(input.url) : []),
    ...(input.text ? getCandidateUrls(input.text) : []),
  ];
  const raw =
    candidates.find((candidate) => {
      const url = likelyProductUrl(candidate);
      return url && getBrandConfig(url.hostname);
    }) ??
    candidates.find((candidate) => likelyProductUrl(candidate)) ??
    (input.text ? extractUrl(input.text) : null) ??
    // Last resort: accept any valid HTTPS URL — user knows what they pasted.
    candidates.find((candidate) => parseCleanUrl(candidate) !== null);
  if (!raw) return null;

  // Prefer the strict check; fall back to any clean URL so unknown stores work.
  const url = likelyProductUrl(raw) ?? parseCleanUrl(raw);
  if (!url) return null;
  if (looksLikeNonProductPage(url)) return null;

  const brandConfig = getBrandConfig(url.hostname);
  const cleanUrl = stripTrackingParams(url);
  const title = (input.title ?? '').trim() || inferTitleFromUrl(cleanUrl);
  const manualStoreLabel = (input.manualStoreLabel ?? '').trim();
  const inferredStoreLabel = brandConfig?.displayName ?? (manualStoreLabel || labelFromHostname(cleanUrl.hostname));

  return {
    url: cleanUrl.toString(),
    title,
    source: brandConfig?.source ?? sourceFromHostname(cleanUrl.hostname),
    storeLabel: inferredStoreLabel,
    rawText: input.text ?? undefined,
  };
}

export async function stashPendingSharedProduct(draft: SharedProductDraft): Promise<void> {
  try {
    await setStoredValue(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures; the share can still continue in-memory.
  }
}

export async function consumePendingSharedProduct(): Promise<SharedProductDraft | null> {
  try {
    const raw = await getStoredValue(STORAGE_KEY);
    if (!raw) return null;
    await removeStoredValue(STORAGE_KEY);
    return JSON.parse(raw) as SharedProductDraft;
  } catch {
    return null;
  }
}

export async function peekPendingSharedProduct(): Promise<SharedProductDraft | null> {
  try {
    const raw = await getStoredValue(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SharedProductDraft;
  } catch {
    return null;
  }
}

export function buildShareRoute(draft: SharedProductDraft): string {
  const params = new URLSearchParams({
    url: draft.url,
    title: draft.title,
    source: draft.source,
    storeLabel: draft.storeLabel,
  });
  return `/share?${params.toString()}`;
}

export function buildAppShareUrl(draft: SharedProductDraft): string {
  const params = new URLSearchParams({
    url: draft.url,
    title: draft.title,
    source: draft.source,
    storeLabel: draft.storeLabel,
  });
  return `${env.appScheme}://share?${params.toString()}`;
}
