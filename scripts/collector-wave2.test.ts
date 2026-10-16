import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { isCollectorCardCatalog } from '../src/data/collectorCards';

const folder = resolve('design/collector-cards-wave2');
const baselinePath = resolve(folder, 'baseline-catalog.json');
const baseline = JSON.parse(readFileSync(existsSync(baselinePath) ? baselinePath : 'cloud-assets-source/collector-cards/catalog.json', 'utf8'));
const candidate = JSON.parse(readFileSync(resolve(folder, 'candidate-catalog.json'), 'utf8'));
const preview = JSON.parse(readFileSync(resolve(folder, 'preview-catalog.json'), 'utf8'));

describe('collector wave II draft', () => {
  it('preserves all existing cards including original Furina', () => {
    expect(candidate.cards.slice(0, baseline.cards.length)).toEqual(baseline.cards);
    expect(candidate.cards.length).toBe(baseline.cards.length + 9);
    expect(new Set(candidate.cards.map((c: {id: string}) => c.id)).size).toBe(candidate.cards.length);
    expect(new Set(candidate.cards.map((c: {number: string}) => c.number)).size).toBe(candidate.cards.length);
  });
  it('uses the shipped catalog schema without new desktop code', () => {
    expect(isCollectorCardCatalog(candidate)).toBe(true);
    expect(isCollectorCardCatalog(preview)).toBe(true);
    expect(preview.cards.map((c: {number: string}) => c.number)).toEqual(['013','014','015','016','017','018','019','020','021']);
  });
  for (const card of preview.cards) {
    it(`${card.number} ${card.name}: verified layers and download budget`, async () => {
      let bytes = 0;
      expect(Object.keys(card.assets).sort()).toEqual(['background','subject','text','thumbnail']);
      for (const [layer, path] of Object.entries(card.assets)) {
        const image = readFileSync(resolve(folder, path as string));
        bytes += image.length;
        expect(createHash('sha256').update(image).digest('hex')).toBe(card.checksums[layer]);
        const metadata = await sharp(image).metadata();
        expect([metadata.width, metadata.height]).toEqual(layer === 'thumbnail' ? [320,480] : [1024,1536]);
        if (layer === 'subject' || layer === 'text') {
          const stats = await sharp(image).stats();
          expect(metadata.hasAlpha).toBe(true);
          expect(stats.channels.at(-1)?.min).toBe(0);
          expect(stats.channels.at(-1)?.max).toBeGreaterThan(200);
        }
      }
      expect(bytes).toBe(card.assetBytes);
      expect(bytes).toBeLessThan(2*1024*1024);
    });
  }
});
