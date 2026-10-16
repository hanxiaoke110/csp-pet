import { beforeEach, expect, it, vi } from 'vitest';
import { dualLoad } from './persist';
import { sqliteGet } from './sqlite-storage';

vi.mock('./sqlite-storage', () => ({ sqliteGet: vi.fn(), sqliteSetFireAndForget: vi.fn() }));
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } });
});

it('re-reads local authority after an asynchronous SQLite read instead of restoring a captured wallet', async () => {
  let finish!: (value: string) => void;
  vi.mocked(sqliteGet).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const old = JSON.stringify({ coins: 600, savedAt: '2026-01-01T00:00:00Z' });
  const recent = JSON.stringify({ coins: 500, savedAt: '2026-01-03T00:00:00Z' });
  localStorage.setItem('csp_pet_data', old);
  const loading = dualLoad('pet_data', 'csp_pet_data');
  localStorage.setItem('csp_pet_data', recent);
  finish(JSON.stringify({ coins: 550, savedAt: '2026-01-02T00:00:00Z' }));
  expect(JSON.parse(await loading).coins).toBe(500);
  expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(500);
});
