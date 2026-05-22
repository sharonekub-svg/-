import { IL_CITIES } from '@/lib/israeliCities';
import { rankCities, searchCities, searchStreets } from '@/lib/locationAutocomplete';

describe('locationAutocomplete', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ranks prefix matches before looser matches', () => {
    const ranked = rankCities('tel', ['Bat Yam', 'Tel Aviv', 'Tel Mond', 'Eilat']);
    expect(ranked.slice(0, 2)).toEqual(['Tel Aviv', 'Tel Mond']);
  });

  it('falls back to local Israeli cities when the remote lookup fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const results = await searchCities('אב', 'he');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((city) => IL_CITIES.includes(city))).toBe(true);
  });

  it('extracts street names from the remote response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { address: { road: 'Herzl Street' } },
        { address: { pedestrian: 'Rothschild Boulevard' } },
        { address: { road: 'Herzl Street' } },
      ],
    } as Response);

    const results = await searchStreets('herzl', 'Tel Aviv', 'en');
    expect(results).toEqual(['Herzl Street', 'Rothschild Boulevard']);
  });
});
