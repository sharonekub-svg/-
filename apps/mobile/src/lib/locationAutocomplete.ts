import { IL_CITIES } from '@/lib/israeliCities';

type NominatimAddress = {
  road?: string;
  pedestrian?: string;
  footway?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  suburb?: string;
};

type NominatimResult = {
  display_name?: string;
  class?: string;
  type?: string;
  name?: string;
  address?: NominatimAddress;
  namedetails?: Record<string, string>;
};

type SearchKind = 'city' | 'street';

const cache = new Map<string, string[]>();
const COMMON_STREETS: readonly string[] = [
  'הרצל',
  'ז׳בוטינסקי',
  'ויצמן',
  'בן גוריון',
  'ביאליק',
  'רוטשילד',
  'דיזנגוף',
  'אלנבי',
  'אבן גבירול',
  'המלך ג׳ורג׳',
  'ארלוזורוב',
  'דרך נמיר',
  'יגאל אלון',
  'העצמאות',
  'הנשיא',
  'ירושלים',
  'הרב קוק',
  'החלוץ',
  'הגפן',
  'הזית',
  'Herzl',
  'Jabotinsky',
  'Weizmann',
  'Ben Gurion',
  'Bialik',
  'Rothschild',
  'Dizengoff',
  'Allenby',
  'Ibn Gabirol',
  'King George',
];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function scoreCandidate(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (c === q) return 10_000;
  if (c.startsWith(q)) return 8_000 - (c.length - q.length);
  if (c.includes(q)) return 5_000 - c.indexOf(q);
  return 0;
}

function sortByQuery(query: string, values: string[]): string[] {
  return [...values].sort((a, b) => scoreCandidate(query, b) - scoreCandidate(query, a) || a.localeCompare(b, 'he'));
}

function buildUrl(kind: SearchKind, query: string, language: 'he' | 'en', city?: string): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    countrycodes: 'il',
    limit: '12',
    'accept-language': language,
  });

  if (kind === 'city') {
    params.set('q', `${query}, Israel`);
    params.set('layer', 'address');
  } else {
    params.set('q', city ? `${query}, ${city}, Israel` : `${query}, Israel`);
  }

  return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

function extractCityName(item: NominatimResult): string | null {
  const direct = item.address?.city ?? item.address?.town ?? item.address?.village ?? item.address?.municipality ?? item.address?.suburb ?? item.address?.hamlet;
  if (direct) return direct;
  const name = item.name ?? item.namedetails?.name ?? item.display_name?.split(',')[0];
  return name?.trim() || null;
}

function extractStreetName(item: NominatimResult): string | null {
  return item.address?.road ?? item.address?.pedestrian ?? item.address?.footway ?? item.name ?? item.display_name?.split(',')[0] ?? null;
}

function extractCandidates(kind: SearchKind, query: string, results: NominatimResult[]): string[] {
  const values: string[] = [];
  for (const item of results) {
    const candidate = kind === 'city' ? extractCityName(item) : extractStreetName(item);
    if (candidate) values.push(candidate);
  }
  const ordered = sortByQuery(query, unique(values));
  return ordered.slice(0, 10);
}

async function searchRemote(
  kind: SearchKind,
  query: string,
  language: 'he' | 'en',
  signal?: AbortSignal,
  city?: string,
): Promise<string[]> {
  const trimmed = query.trim();
  const localPool = kind === 'city' ? IL_CITIES : COMMON_STREETS;
  const fallback = sortByQuery(
    trimmed,
    localPool.filter((value) => normalize(value).includes(normalize(trimmed))),
  ).slice(0, 8);
  if (trimmed.length < 2) return fallback;

  const cacheKey = `${kind}:${language}:${city ?? ''}:${trimmed}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(buildUrl(kind, trimmed, language, city), {
      headers: { 'Accept-Language': language },
      signal,
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as NominatimResult[];
    const result = extractCandidates(kind, trimmed, data);
    const merged = result.length > 0 ? result : fallback;
    cache.set(cacheKey, merged);
    return merged;
  } catch {
    return fallback;
  }
}

export async function searchCities(query: string, language: 'he' | 'en', signal?: AbortSignal): Promise<string[]> {
  return searchRemote('city', query, language, signal);
}

export async function searchStreets(
  query: string,
  city: string,
  language: 'he' | 'en',
  signal?: AbortSignal,
): Promise<string[]> {
  return searchRemote('street', query, language, signal, city);
}

export function rankCities(query: string, candidates: string[]): string[] {
  return sortByQuery(query, unique(candidates));
}
