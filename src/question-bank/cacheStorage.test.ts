import { beforeEach, expect, it, vi } from 'vitest';
import { readQuestionCache, writeQuestionCache } from './cacheStorage';
const disk = vi.hoisted(() => new Map<string, string>());
const native = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 }, mkdir: vi.fn(async () => {}),
  writeTextFile: vi.fn(async (path: string, value: string) => { disk.set(path, value); }),
  readTextFile: vi.fn(async (path: string) => { if (!disk.has(path)) throw new Error('missing'); return disk.get(path); }),
  remove: vi.fn(async (path: string) => { disk.delete(path); }),
}));
beforeEach(() => {
  native.invoke.mockReset().mockResolvedValue(undefined);
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

it('pins the actual content-addressed file before writing and preserves the old slots if protection fails', async () => {
  native.invoke.mockImplementation(async (command: string, args: { files: string[] }) => {
    expect(command).toBe('protect_question_cache_files');
    expect(args.files).toHaveLength(1);
    expect(args.files[0]).toMatch(/^[a-f0-9]{64}\.json$/);
    expect(disk.has(`question-bank-cache-v2/${args.files[0]}`)).toBe(false);
  });
  await writeQuestionCache({ version: 2 }, { version: 1 });
  const pointerBefore = localStorage.getItem('question_bank_v2_file_slots');
  const filesBefore = [...disk.entries()];
  native.invoke.mockRejectedValueOnce(new Error('protection unavailable'));
  await expect(writeQuestionCache({ version: 3 }, { version: 2 })).rejects.toThrow('protection unavailable');
  expect(localStorage.getItem('question_bank_v2_file_slots')).toBe(pointerBefore);
  expect([...disk.entries()]).toEqual(filesBefore);
  expect(await readQuestionCache('current')).toEqual({ version: 2 });
  expect(await readQuestionCache('previous')).toEqual({ version: 1 });
});
it('keeps retired real hash files for grace-period cleanup while advancing both offline slots', async () => {
  await writeQuestionCache({ version: 2 }, { version: 1 });
  const retired = JSON.parse(localStorage.getItem('question_bank_v2_file_slots')!).previous.file;
  await writeQuestionCache({ version: 3 }, { version: 2 });
  expect(disk.has(`question-bank-cache-v2/${retired}`)).toBe(true);
  expect(disk.size).toBe(3);
  expect(await readQuestionCache('current')).toEqual({ version: 3 });
  expect(await readQuestionCache('previous')).toEqual({ version: 2 });
});
