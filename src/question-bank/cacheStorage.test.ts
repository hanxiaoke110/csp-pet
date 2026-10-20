import { beforeEach, expect, it, vi } from 'vitest';
import { readQuestionCache, writeQuestionCache } from './cacheStorage';
const disk = vi.hoisted(() => new Map<string, string>());
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 }, mkdir: vi.fn(async () => {}),
  writeTextFile: vi.fn(async (path: string, value: string) => { disk.set(path, value); }),
  readTextFile: vi.fn(async (path: string) => { if (!disk.has(path)) throw new Error('missing'); return disk.get(path); }),
  remove: vi.fn(async (path: string) => { disk.delete(path); }),
}));
beforeEach(() => {
  disk.clear(); const values = new Map<string, string>();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { if (v.length > 2048) throw new Error('quota'); values.set(k, v); },
  });
});
it('stores a >10 MiB bank without using wallet storage and retains the previous version', async () => {
  const old = { data: 'old' }, next = { data: '题'.repeat(6 * 1024 * 1024) };
  await writeQuestionCache(next, old);
  expect(await readQuestionCache('current')).toEqual(next);
  expect(await readQuestionCache('previous')).toEqual(old);
});
it('rejects a damaged file while leaving the previous verified snapshot available', async () => {
  await writeQuestionCache({ data: 'new' }, { data: 'old' });
  const pointers = JSON.parse(localStorage.getItem('question_bank_v2_file_slots')!);
  disk.set(`question-bank-cache-v2/${pointers.current.file}`, '{}');
  expect(await readQuestionCache('current')).toBeNull();
  expect(await readQuestionCache('previous')).toEqual({ data: 'old' });
});
