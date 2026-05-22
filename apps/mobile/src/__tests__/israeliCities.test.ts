import { matchCities, IL_CITIES } from '@/lib/israeliCities';

describe('matchCities', () => {
  it('returns empty for empty query', () => {
    expect(matchCities('')).toEqual([]);
  });
  it('filters by Hebrew substring', () => {
    const res = matchCities('תל');
    expect(res).toContain('תל אביב');
    expect(res.length).toBeLessThanOrEqual(7);
  });
  it('includes 60+ cities total', () => {
    expect(IL_CITIES.length).toBeGreaterThanOrEqual(60);
  });
});
