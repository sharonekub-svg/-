import { parseInviteToken, buildAppInviteUrl, buildInviteUrl } from '@/lib/deeplinks';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('deeplinks', () => {
  it('parses shakana:// style url', () => {
    expect(parseInviteToken('shakana://join/ABC_123')).toBe('ABC_123');
  });
  it('parses universal link', () => {
    expect(parseInviteToken('https://shakana.app/join/XYZ-987')).toBe('XYZ-987');
  });
  it('parses the live Vercel invite link', () => {
    expect(parseInviteToken('https://shakana1.vercel.app/join/live_tok')).toBe('live_tok');
  });
  it('returns null for unrelated urls', () => {
    expect(parseInviteToken('https://example.com/other')).toBeNull();
    expect(parseInviteToken(null)).toBeNull();
  });
  it('builds symmetric invite urls', () => {
    expect(buildInviteUrl('tok')).toContain('/join/tok');
    expect(buildAppInviteUrl('tok')).toMatch(/^shakana:\/\/join\/tok$/);
  });
});
