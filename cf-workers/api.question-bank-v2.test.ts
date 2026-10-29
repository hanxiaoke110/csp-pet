import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './api.js';

const base = 'https://cards.cspstudy.top/course-data/question-bank-v2';
const names = ['daily-gesp', 'super-cspj', 'exam-questions', 'exam-manifests', 'dungeon-mixed', 'topic-practice', 'verification-summary'];
const manifest = { files: Object.fromEntries(names.map(name => [`${name}.json`, { path: `${name}.0123456789ab.json` }])) };
const db = {
  async exec() {},
  prepare() {
    return { async first() { return { value: '14' }; }, async run() { return {}; }, async all() { return { results: [] }; } };
  },
};
const request = (name: string) => worker.fetch(new Request(`https://api.example.test/api/question-bank/v2/${name}`), { DB: db }, { waitUntil() {} });

afterEach(() => vi.unstubAllGlobals());
describe('题库完整热更新接口', () => {
  it.each(names)('放行 %s，按清单访问静态哈希文件且不缓存逻辑别名', async name => {
    const mock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/manifest.json') ? manifest : { name })));
    vi.stubGlobal('fetch', mock);
    const result = await request(`${name}.json`);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ name });
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(mock.mock.calls.map(call => call[0])).toEqual([`${base}/manifest.json`, `${base}/${name}.0123456789ab.json`]);
  });
  it('清单使用静态源，不缓存可变清单', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify(manifest)));
    vi.stubGlobal('fetch', mock);
    const result = await request('manifest');
    expect(await result.json()).toEqual(manifest);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(mock.mock.calls[0][0]).toBe(`${base}/manifest.json`);
  });
  it('拒绝未知文件', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    expect((await request('canonical.json')).status).toBe(404);
    expect(mock).not.toHaveBeenCalled();
  });
  it('拒绝清单中的越界路径', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ files: { 'daily-gesp.json': { path: '../secret.json' } } }))));
    expect((await request('daily-gesp.json')).status).toBe(503);
  });
});
