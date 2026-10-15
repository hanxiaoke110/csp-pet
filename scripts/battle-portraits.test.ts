import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { parsePortraitCatalog } from '../src-dungeon/utils/battlePortraits';

const catalog=JSON.parse(readFileSync('cloud-assets-source/battle-portraits/catalog.json','utf8'));
describe('cloud-only battle art',()=>{
  it('uses the production loader schema and includes all four original starters',()=>{
    expect(parsePortraitCatalog(catalog)).toEqual(catalog);
    for(const id of ['capi','boba','bubu-2','miga']) expect(catalog.portraits.some((p:{speciesId:string})=>p.speciesId===id)).toBe(true);
  });
  for(const item of catalog.portraits.filter((p:{speciesId:string})=>!p.speciesId.startsWith('ws-'))){
    it(`${item.speciesId}: has real transparent high-resolution art and matching download hash`,async()=>{
      const file=resolve('cloud-assets-source',new URL(item.url).pathname.slice(1));
      const bytes=readFileSync(file);
      expect(bytes.length).toBe(item.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
      const meta=await sharp(bytes).metadata();
      expect([meta.width,meta.height]).toEqual([1024,1024]);
      expect(meta.hasAlpha).toBe(true);
      const stats=await sharp(bytes).stats();
      expect(stats.channels[3].min).toBe(0);
      expect(stats.channels[3].max).toBeGreaterThan(200);
      expect(bytes.length).toBeLessThan(4*1024*1024);
    });
  }
});
