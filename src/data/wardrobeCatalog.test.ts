import { describe, expect, it } from 'vitest';
import { isWardrobeCatalog, normalizeWardrobeCatalog } from './wardrobeCatalog';
import { PROFILE_AVATARS } from './wardrobe';

const remoteItem = {
  id: 'avatar-summer-comet',
  version: 1,
  category: 'avatar' as const,
  name: '夏夜彗星',
  rarity: 'epic' as const,
  acquisition: { type: 'coin' as const, price: 520 },
  asset: './items/summer-comet.webp',
  thumbnail: './thumbs/summer-comet.webp',
  assetBytes: 12345,
  checksum: 'a'.repeat(64),
};

describe('wardrobe catalog', () => {
  it('accepts a safe remotely published item', () => {
    expect(isWardrobeCatalog({ version: 2, updatedAt: '2026-09-16T00:00:00Z', items: [remoteItem] })).toBe(true);
  });

  it('rejects duplicate ids, invalid prices and malformed checksums', () => {
    expect(isWardrobeCatalog({ version: 2, updatedAt: '', items: [remoteItem, remoteItem] })).toBe(false);
    expect(isWardrobeCatalog({ version: 2, updatedAt: '', items: [{ ...remoteItem, acquisition: { type: 'coin', price: 0 } }] })).toBe(false);
    expect(isWardrobeCatalog({ version: 2, updatedAt: '', items: [{ ...remoteItem, checksum: 'bad' }] })).toBe(false);
  });

  it('resolves relative asset paths against the online catalog directory', () => {
    const normalized = normalizeWardrobeCatalog(
      { version: 2, updatedAt: '', items: [remoteItem] },
      'https://gitee.com/example/repo/raw/master/public/wardrobe/catalog.json',
    );
    expect(normalized.items[0].asset).toBe('https://gitee.com/example/repo/raw/master/public/wardrobe/items/summer-comet.webp');
    expect(normalized.items[0].thumbnail).toBe('https://gitee.com/example/repo/raw/master/public/wardrobe/thumbs/summer-comet.webp');
  });

  it('ships all 24 zodiac and constellation avatars as interactive 5x5 atlases', () => {
    expect(PROFILE_AVATARS).toHaveLength(24);
    expect(new Set(PROFILE_AVATARS.map(item => item.interaction?.atlas)).size).toBe(24);
    for (const item of PROFILE_AVATARS) {
      expect(item.version).toBeGreaterThanOrEqual(2);
      expect(item.interaction).toMatchObject({
        type: 'direction-grid', columns: 5, rows: 5, clickReaction: 'squash-bounce',
      });
      expect(item.interaction?.atlas).toMatch(/^\/profile\/avatars-interactive\//);
    }
  });

  it('validates and normalizes interaction atlas metadata', () => {
    const item = {
      ...remoteItem,
      interaction: { type: 'direction-grid' as const, atlas: './summer-atlas.webp', columns: 5 as const, rows: 5 as const },
    };
    expect(isWardrobeCatalog({ version: 2, updatedAt: '', items: [item] })).toBe(true);
    const normalized = normalizeWardrobeCatalog(
      { version: 2, updatedAt: '', items: [item] },
      'https://cards.cspstudy.top/wardrobe/catalog.json',
    );
    expect(normalized.items[0].interaction?.atlas).toBe('https://cards.cspstudy.top/wardrobe/summer-atlas.webp');
    expect(isWardrobeCatalog({ version: 2, updatedAt: '', items: [{ ...item, interaction: { ...item.interaction, rows: 4 } }] })).toBe(false);
  });
});
