import { beforeAll, describe, expect, it, vi } from 'vitest';
import { isCollectorCardCatalog, mergeCollectorCardCatalog, normalizeCollectorCardCatalog } from './collectorCards';
import type { CollectorCardCatalog } from '../types/collectorCard';

const catalog: CollectorCardCatalog = {
  version: 1,
  updatedAt: '2026-09-15T00:00:00.000Z',
  cards: [{
    id: 'demo-001', version: 1, number: '001', name: '样卡', title: '初次显影',
    element: 'water', rarity: 'legendary', price: 100, description: '测试', quote: '测试',
    assets: {
      thumbnail: './demo/thumbnail.webp', background: './demo/background.png',
      subject: './demo/subject.png', text: './demo/text.png',
    },
  }],
};

describe('collector card catalog', () => {
  beforeAll(() => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:4182' } });
  });

  it('accepts a valid catalog and rejects duplicate card ids', () => {
    expect(isCollectorCardCatalog(catalog)).toBe(true);
    expect(isCollectorCardCatalog({ ...catalog, cards: [...catalog.cards, catalog.cards[0]] })).toBe(false);
  });

  it('resolves the same relative assets for bundled and remote catalogs', () => {
    const local = normalizeCollectorCardCatalog(catalog, '/collector-cards/catalog.json');
    expect(local.cards[0].assets.subject).toBe('/collector-cards/demo/subject.png');

    const remote = normalizeCollectorCardCatalog(
      catalog,
      'https://gitee.com/example/project/raw/master/public/collector-cards/catalog.json',
    );
    expect(remote.cards[0].assets.subject).toBe(
      'https://gitee.com/example/project/raw/master/public/collector-cards/demo/subject.png',
    );
  });

  it('keeps bundled founder assets until an online card version is newer', () => {
    const online = normalizeCollectorCardCatalog(catalog, 'https://cards.cspstudy.top/collector-cards/catalog.json');
    const sameVersion = mergeCollectorCardCatalog(catalog, online);
    expect(sameVersion.cards[0].assets.background).toBe('./demo/background.png');

    const upgraded = mergeCollectorCardCatalog(catalog, {
      ...online,
      cards: [{ ...online.cards[0], version: 2 }],
    });
    expect(upgraded.cards[0].assets.background).toBe('https://cards.cspstudy.top/collector-cards/demo/background.png');
  });
});
