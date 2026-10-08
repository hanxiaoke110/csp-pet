import { describe, expect, it } from 'vitest';
import { isWardrobeCatalog, normalizeWardrobeCatalog } from './wardrobeCatalog';
import { PROFILE_AVATARS } from './wardrobe';
import type { WardrobeItem } from '../types/profile';
import publishedWardrobeV2 from '../../cloud-assets-source/wardrobe/v2/catalog.json';

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

  it('accepts v2 visual primitives, resolves layer assets and clamps unsafe values', () => {
    const item = {
      ...remoteItem,
      minRendererVersion: 2,
      visual: {
        rendererVersion: 2 as const,
        safeZone: { x: 50, y: 42, width: 38, height: 44 },
        layers: [{
          id: 'star-dust', primitive: 'particle' as const, placement: 'front' as const,
          asset: './items/star.webp', count: 999, opacity: 4, blur: 90, durationMs: 50,
        }],
      },
    };
    const catalog = { schemaVersion: 2 as const, rendererVersion: 2, version: 3, updatedAt: '', items: [item] };
    expect(isWardrobeCatalog(catalog)).toBe(true);
    const normalized = normalizeWardrobeCatalog(catalog, 'https://cards.cspstudy.top/wardrobe/v2/catalog.json');
    expect(normalized.items[0].visual?.layers[0]).toMatchObject({ count: 48, opacity: 1, blur: 30, durationMs: 500 });
    expect(normalized.items[0].visual?.layers[0].asset).toBe('https://cards.cspstudy.top/wardrobe/v2/items/star.webp');
  });

  it('rejects arbitrary visual primitives and malformed condition expressions', () => {
    expect(isWardrobeCatalog({ version: 2, updatedAt: '', items: [{
      ...remoteItem,
      visual: { rendererVersion: 2, layers: [{ id: 'bad', primitive: 'javascript', placement: 'front' }] },
    }] })).toBe(false);
    expect(isWardrobeCatalog({ version: 2, updatedAt: '', items: [{
      ...remoteItem,
      acquisition: { type: 'condition', description: '测试', condition: { type: 'metric', metric: 'secret-key', operator: 'gte', value: 1 } },
    }] })).toBe(false);
  });

  it('publishes the complete 20-item v2 catalog with valid local assets', () => {
    const catalog = publishedWardrobeV2;
    const items = catalog.items as unknown as WardrobeItem[];
    expect(isWardrobeCatalog(catalog)).toBe(true);
    expect(catalog).toMatchObject({ schemaVersion: 2, rendererVersion: 2, version: 1 });
    expect(catalog.items).toHaveLength(20);
    expect(items.filter(item => item.acquisition.type === 'coin')).toHaveLength(14);
    expect(items.filter(item => item.acquisition.type === 'condition')).toHaveLength(6);
    expect(Object.fromEntries(['frame', 'background', 'pendant', 'effect', 'title'].map(category => [category, items.filter(item => item.category === category).length])))
      .toEqual({ frame: 5, background: 4, pendant: 3, effect: 5, title: 3 });
    expect(catalog.items.every(item => item.thumbnail.endsWith('.webp'))).toBe(true);
    expect(catalog.items.filter(item => item.asset).every(item => item.checksum?.length === 64 && Number(item.assetBytes) > 0)).toBe(true);
  });
});
