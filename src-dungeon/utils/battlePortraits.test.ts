import { describe, it, expect, vi } from 'vitest';
import { createBattlePortraitLoader, parsePortraitCatalog, type PortraitIO } from './battlePortraits';

const portrait = { speciesId: 'capi', url: 'https://cards.cspstudy.top/battle-portraits/capi.webp', bytes: 100, sha256: 'a'.repeat(64), width: 1024, height: 1024, style: 'painted' };
describe('trusted battle portraits', () => {
  it('accepts the versioned species catalog and rejects unsafe or oversized entries', () => {
    expect(parsePortraitCatalog({ version: 1, portraits: [portrait] }).portraits[0].speciesId).toBe('capi');
    for (const bad of [{ url: 'https://evil.test/a.webp' }, { bytes: 4194305 }, { width: 4096 }, { height: 2048 }, { sha256: 'bad' }]) {
      expect(() => parsePortraitCatalog({ version: 1, portraits: [{ ...portrait, ...bad }] })).toThrow();
    }
    expect(() => parsePortraitCatalog({ version: 2, portraits: [portrait] })).toThrow();
  });
  it('verifies downloads and cached bytes, owns URLs and never substitutes another species', async () => {
    const png = new Uint8Array(100);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.set([73, 72, 68, 82], 12);
    const view = new DataView(png.buffer); view.setUint32(16, 1024); view.setUint32(20, 1024);
    const cache = new Map<string, Uint8Array>();
    const io: PortraitIO = {
      fetch: vi.fn(async url => new Response(url.endsWith('.json') ? JSON.stringify({ version: 1, portraits: [portrait] }) : png)),
      read: async key => cache.get(key) || null, write: async (key, bytes) => { cache.set(key, bytes); },
      digest: async () => portrait.sha256, dimensions: async () => ({ width: 1024, height: 1024 }),
      createUrl: () => 'blob:owned', revokeUrl: vi.fn(), now: () => 0,
    };
    const loader = createBattlePortraitLoader(io);
    const first = await loader.load('capi');
    expect(first?.url).toBe('blob:owned');
    first?.release(); first?.release();
    expect(io.revokeUrl).toHaveBeenCalledTimes(1);
    expect((await loader.load('capi'))?.url).toBe('blob:owned');
    expect(io.fetch).toHaveBeenCalledTimes(2);
    expect(await loader.load('other-pet')).toBeNull();
    cache.clear();
    io.digest = async () => 'b'.repeat(64);
    expect(await loader.load('capi')).toBeNull();
    io.digest = async () => portrait.sha256;
    io.dimensions = async () => ({ width: 4096, height: 4096 });
    expect(await loader.load('capi')).toBeNull();
  });
  it('bounds hanging network waits and rejects oversized streamed downloads', async () => {
    const io: PortraitIO = {
      fetch: async () => new Promise(() => {}), read: async () => null, write: async () => {},
      digest: async () => portrait.sha256, dimensions: async () => ({ width: 1024, height: 1024 }),
      createUrl: vi.fn(), revokeUrl: vi.fn(), now: () => 0,
    };
    expect(await createBattlePortraitLoader(io).load('capi', 5)).toBeNull();
    io.fetch = async url => new Response(url.endsWith('.json') ? JSON.stringify({ version: 1, portraits: [portrait] }) : new Uint8Array(101));
    expect(await createBattlePortraitLoader(io).load('capi')).toBeNull();
    expect(io.createUrl).not.toHaveBeenCalled();
  });
  it('rejects a decompression bomb before decoding and drops late responses after timeout', async () => {
    const bytes = new Uint8Array(100);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); bytes.set([73, 72, 68, 82], 12);
    const view = new DataView(bytes.buffer); view.setUint32(16, 8192); view.setUint32(20, 8192);
    const io: PortraitIO = {
      fetch: async url => new Response(url.endsWith('.json') ? JSON.stringify({ version: 1, portraits: [portrait] }) : bytes),
      read: async () => null, write: async () => {}, digest: async () => portrait.sha256,
      dimensions: vi.fn(async () => ({ width: 8192, height: 8192 })), createUrl: vi.fn(), revokeUrl: vi.fn(), now: () => 0,
    };
    expect(await createBattlePortraitLoader(io).load('capi')).toBeNull();
    expect(io.dimensions).not.toHaveBeenCalled();
    let respond!: (value: Response) => void;
    io.fetch = async () => new Promise(resolve => { respond = resolve; });
    expect(await createBattlePortraitLoader(io).load('capi', 5)).toBeNull();
    respond(new Response(JSON.stringify({ version: 1, portraits: [portrait] })));
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(io.createUrl).not.toHaveBeenCalled();
  });
});
