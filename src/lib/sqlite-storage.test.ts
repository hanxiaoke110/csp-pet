import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { sqliteSet, sqliteGet } from './sqlite-storage';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
beforeEach(() => vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: () => {} } }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('reports failed confirmed writes instead of acknowledging them', async () => {
  vi.mocked(invoke).mockRejectedValueOnce(new Error('SQLITE_FULL'));
  await expect(sqliteSet('pet_data', '{}')).rejects.toThrow('SQLITE_FULL');
});
it('distinguishes a failed database read from a missing key', async () => {
  vi.mocked(invoke).mockRejectedValueOnce(new Error('SQLITE_IOERR'));
  await expect(sqliteGet('pet_data')).rejects.toThrow('SQLITE_IOERR');
});
it('keeps a timed-out old write ahead of a newer write until the native operation settles', async () => {
  vi.useFakeTimers();
  let finishOld!: () => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise<void>(resolve => { finishOld = resolve; }));
  const old = sqliteSet('pet_data', 'old');
  const rejected = expect(old).rejects.toThrow('数据库响应超时');
  await vi.advanceTimersByTimeAsync(5001);
  await rejected;
  vi.mocked(invoke).mockResolvedValueOnce(undefined);
  const callCount = vi.mocked(invoke).mock.calls.length;
  const next = sqliteSet('pet_data', 'new');
  await Promise.resolve();
  expect(vi.mocked(invoke).mock.calls.length).toBe(callCount);
  finishOld();
  await next;
  expect(invoke).toHaveBeenLastCalledWith('set_setting', { key: 'pet_data', value: 'new' });
});
