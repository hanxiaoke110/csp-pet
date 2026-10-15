import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPublication, fetchSource, imageKey, publicationFingerprint, sourceFingerprint, verifyPublication } from './workshop-publication.mjs';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const pet = (changes = {}) => ({ id: 'ws-ABC123', name: '小龙', element: 'fire', tier: 'common', price: 200, teacher_name: '王老师', spritesheet_url: 'sheet:abc', thumbnail_url: 'thumb:abc', pet_json: JSON.stringify({ frameWidth: 2, frameHeight: 3, maxFrames: 2, anims: { idle: 2 }, animOrder: ['idle'] }), ...changes });
const sheet = () => sharp({ create: { width: 4, height: 3, channels: 4, background: '#ff0000' } }).png().toBuffer();
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function api(records, bytes, { pages, published, after } = {}) {
  let reads = 0;
  const calls = [];
  const fn = async url => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.pathname === '/api/workshop/pets') {
      reads++;
      return json(pages ? pages[u.searchParams.get('cursor') || 'first'] : { items: after && reads > 1 ? after : records, hasMore: false, nextCursor: null });
    }
    if (u.pathname.endsWith('/catalog.json')) return published ? json(published) : new Response('', { status: 404 });
    return new Response(bytes);
  };
  fn.calls = calls;
  return fn;
}
async function build(records = [pet()], options = {}) {
  const outputRoot = await mkdtemp(join(tmpdir(), 'workshop-publish-')); roots.push(outputRoot);
  return { outputRoot, manifest: await buildPublication({ outputRoot, fetchFn: api(records, await sheet()), ...options }) };
}

describe('workshop snapshot publication', () => {
  it('builds compatible hashed assets and a real first-frame thumbnail', async () => {
    const { outputRoot, manifest } = await build();
    expect(manifest).toMatchObject({ version: 2, count: 1, sourceFingerprint: sourceFingerprint([pet()]) });
    const item = manifest.items[0];
    expect(item.publicationFingerprint).toBe(publicationFingerprint(pet()));
    expect(item.spritesheet_static_url).toMatch(/^\.\/pets\/ws-ABC123\/[a-f0-9]{64}\.png$/);
    const bytes = await readFile(join(outputRoot, 'workshop', item.thumbnail_static_url));
    expect(await sharp(bytes).metadata()).toMatchObject({ format: 'webp', width: 240, height: 260 });
    expect(JSON.parse(await readFile(join(outputRoot, 'workshop/catalog.json'), 'utf8'))).toEqual(manifest);
  });
  it('fingerprints edits/create/delete, ignores timestamps, ordering and JSON formatting', () => {
    const base = pet();
    expect(sourceFingerprint([base])).toBe(sourceFingerprint([pet({ created_at: 'tomorrow', updatedAt: 'now', pet_json: JSON.stringify(JSON.parse(base.pet_json), null, 2) })]));
    for (const changes of [{ name: '新龙' }, { price: 300 }, { thumbnail_url: 'other' }, { description: '新描述' }, { pet_json: base.pet_json.replace('"maxFrames":2', '"maxFrames":3') }]) expect(publicationFingerprint(pet(changes))).not.toBe(publicationFingerprint(base));
    expect(sourceFingerprint([base])).not.toBe(sourceFingerprint([]));
    expect(sourceFingerprint([base, pet({ id: 'ws-DEF456' })])).toBe(sourceFingerprint([pet({ id: 'ws-DEF456' }), base]));
  });
  it('replaces catalog membership across create, edit and delete snapshots', async () => {
    const { outputRoot, manifest } = await build();
    const created = [pet(), pet({ id: 'ws-DEF456', name: '第二只' })];
    const second = await buildPublication({ outputRoot, fetchFn: api(created, await sheet()), published: manifest });
    expect(second.count).toBe(2);
    const edited = [pet({ id: 'ws-DEF456', name: '已修改' })];
    const third = await buildPublication({ outputRoot, fetchFn: api(edited, await sheet()), published: second });
    expect(third.items.map(item => item.name)).toEqual(['已修改']);
    expect(third.sourceFingerprint).not.toBe(second.sourceFingerprint);
    const empty = await buildPublication({ outputRoot, fetchFn: api([], await sheet()), published: third });
    expect(empty.items).toEqual([]);
  });
  it('follows pages and rejects repeated cursors, duplicate IDs and incomplete pages', async () => {
    const pages = { first: { items: [pet()], hasMore: true, nextCursor: 'two' }, two: { items: [pet({ id: 'ws-DEF456' })], hasMore: false } };
    expect(await fetchSource(api([], null, { pages }))).toHaveLength(2);
    await expect(fetchSource(api([], null, { pages: { ...pages, two: pages.first } }))).rejects.toThrow(/duplicate|cursor/i);
    await expect(fetchSource(api([], null, { pages: { first: { items: [], hasMore: true } } }))).rejects.toThrow(/cursor/);
    await expect(fetchSource(api([], null, { pages: { first: {} } }))).rejects.toThrow(/page/);
    await expect(fetchSource(api([], null, { pages: { first: { items: [], hasMore: true, nextCursor: 'loop' }, loop: { items: [], hasMore: true, nextCursor: 'loop' } } }))).rejects.toThrow(/cursor/);
  });
  it('accepts native and exact trusted endpoint keys, rejects unsafe URLs', () => {
    expect(imageKey('/api/workshop/image?key=sheet%3Aabc')).toBe('sheet:abc');
    expect(imageKey('https://api.cspstudy.top/api/workshop/image?key=sheet%3Aabc')).toBe('sheet:abc');
    for (const key of ['https://evil.test/image', '//evil.test/a', '/other/path', 'http://api.cspstudy.top/api/workshop/image?key=x', 'https://api.cspstudy.top/api/workshop/image?key=x&url=http://evil', 'https://user@api.cspstudy.top/api/workshop/image?key=x']) expect(() => imageKey(key)).toThrow();
  });
  it('rejects invalid metadata, image corruption, oversize and frame geometry', async () => {
    for (const changes of [{ id: '../bad' }, { element: 'dark' }, { tier: 'bad' }, { price: -1 }, { price: false }, { pet_json: '{}' }, { pet_json: '{broken' }]) await expect(build([pet(changes)])).rejects.toThrow();
    await expect(build([pet()], { fetchFn: api([pet()], Buffer.from('bad')) })).rejects.toThrow();
    await expect(build([pet()], { fetchFn: api([pet()], Buffer.alloc(25 * 1024 * 1024 + 1)) })).rejects.toThrow(/size|large/i);
    const tooWide = await sharp({ create: { width: 8193, height: 1, channels: 4, background: '#000000' } }).png().toBuffer();
    await expect(build([pet()], { fetchFn: api([pet()], tooWide) })).rejects.toThrow(/dimensions/);
    await expect(build([pet({ pet_json: JSON.stringify({ frameWidth: 2, frameHeight: 3, maxFrames: 2, anims: { idle: 3 } }) })])).rejects.toThrow(/frame/);
    await expect(build([pet({ pet_json: JSON.stringify({ frameWidth: 20, frameHeight: 3, maxFrames: 1, anims: { idle: 1 } }) })])).rejects.toThrow(/frame/i);
  });
  it('allows empty snapshots, protects large deletions and detects concurrent edits', async () => {
    expect((await build([])).manifest.count).toBe(0);
    const published = { count: 30, items: [] };
    await expect(build([], { published })).rejects.toThrow(/delet/i);
    expect((await build([], { published, allowLargeDelete: true })).manifest.count).toBe(0);
    const outputRoot = await mkdtemp(join(tmpdir(), 'workshop-race-')); roots.push(outputRoot);
    await expect(buildPublication({ outputRoot, fetchFn: api([pet()], await sheet(), { after: [pet({ name: 'changed' })] }) })).rejects.toThrow(/changed/i);
    await expect(readFile(join(outputRoot, 'workshop/catalog.json'))).rejects.toThrow();
  });
  it('keeps the previous catalog intact when a replacement image fails validation', async () => {
    const { outputRoot, manifest } = await build();
    await expect(buildPublication({ outputRoot, fetchFn: api([pet({ name: 'changed' })], Buffer.from('invalid')) })).rejects.toThrow();
    expect(JSON.parse(await readFile(join(outputRoot, 'workshop/catalog.json'), 'utf8'))).toEqual(manifest);
  });
  it('verifies deployed source and every image hash; poisoned cache falls back to source', async () => {
    const { outputRoot, manifest } = await build();
    const online = async url => {
      const u = new URL(url);
      return u.pathname.endsWith('catalog.json') ? json(manifest) : new Response(await readFile(join(outputRoot, u.pathname)));
    };
    await expect(verifyPublication({ fetchFn: online, manifest })).resolves.toBeUndefined();
    await expect(verifyPublication({ fetchFn: async url => String(url).endsWith('catalog.json') ? json(manifest) : new Response('poison'), manifest })).rejects.toThrow(/hash/);
    const sourceFetch = api([pet()], await sheet(), { published: manifest });
    const poisonedFetch = url => String(url).includes('cards.cspstudy.top/workshop/pets/') ? new Response('poison') : sourceFetch(url);
    expect((await build([pet()], { fetchFn: poisonedFetch, published: manifest })).manifest.sourceFingerprint).toBe(manifest.sourceFingerprint);
    expect(sourceFetch.calls.some(u => u.includes('/api/workshop/image'))).toBe(true);
  });
  it('reuses unchanged verified sheet bytes and rejects a stale deployed manifest', async () => {
    const { manifest } = await build();
    const sourceFetch = api([pet()], await sheet());
    await build([pet()], { fetchFn: sourceFetch, published: manifest });
    expect(sourceFetch.calls.some(u => u.includes('/api/workshop/image'))).toBe(false);
    await expect(verifyPublication({ manifest, fetchFn: async () => json({ ...manifest, sourceFingerprint: 'stale' }) })).rejects.toThrow(/manifest/);
    const editFetch = api([pet({ name: '改名' })], await sheet());
    await build([pet({ name: '改名' })], { fetchFn: editFetch, published: manifest });
    expect(editFetch.calls.some(u => u.includes('/api/workshop/image'))).toBe(true);
  });
});
