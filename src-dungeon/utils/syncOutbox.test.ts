import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { syncProgress, flushPendingDungeonSync } from './api';
import { DUNGEON_SYNC_OUTBOX_KEY } from './syncOutbox';
import { RESTORE_GENERATION_KEY } from '../../src/lib/restoreBarrier';
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map([['csp_device_hash', 'original-device'], ['csp_class_code', 'CLASS1']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
});
it('retains an HTTP-successful but budget-deferred update across restart and backs off for an hour', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{"success":true,"synced":false,"reason":"daily_write_budget"}'));
  vi.stubGlobal('fetch', fetcher);
  expect(await syncProgress(progress(2))).toMatchObject({ pending: true });
  vi.resetModules();
  const restarted = await import('./api');
  vi.setSystemTime(new Date('2026-10-19T00:30:00Z'));
  await restarted.flushPendingDungeonSync();
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockImplementation(async () => new Response('{"success":true,"synced":true}'));
  vi.setSystemTime(new Date('2026-10-19T01:01:00Z'));
  expect(await restarted.flushPendingDungeonSync()).toMatchObject({ synced: true, pending: false });
  expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body).dungeon_progress[0].completedStages).toBe(2);
});
it('does not discard new progress while acknowledging an older in-flight request', async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  vi.stubGlobal('fetch', fetcher);
  const first = syncProgress(progress(1));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const second = syncProgress({ ...progress(4), badges: ['first_blood'] });
  await vi.waitFor(() => expect(JSON.parse(stored.get(DUNGEON_SYNC_OUTBOX_KEY)!).patch.dungeon_progress[0].completedStages).toBe(4));
  resolve(new Response('{"success":true,"synced":true}'));
  await Promise.all([first, second]);
  fetcher.mockImplementation(async () => new Response('{"success":true,"synced":true}'));
  vi.setSystemTime(new Date('2026-10-19T00:00:06Z'));
  await flushPendingDungeonSync();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const sent = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(sent.dungeon_progress[0].completedStages).toBe(4);
  expect(sent.badges).toEqual(['first_blood']);
});
it.each(['device', 'class', 'restore'])('does not replay another %s scope or pre-restore queue', async (change) => {
  const fetcher = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetcher);
  await syncProgress(progress(1));
  if (change === 'device') stored.set('csp_device_hash', 'another-student');
  if (change === 'class') stored.set('csp_class_code', 'CLASS2');
  if (change === 'restore') stored.set(RESTORE_GENERATION_KEY, 'complete:restored');
  vi.setSystemTime(new Date('2026-10-19T00:01:00Z'));
  await flushPendingDungeonSync();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not send a queue that could not be persisted, or alter the local wallet', async () => {
  stored.set('pet-storage', '{"gold":12360}');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const originalSet = localStorage.setItem;
  vi.stubGlobal('localStorage', { ...localStorage, setItem: (key: string, value: string) => {
    if (key === DUNGEON_SYNC_OUTBOX_KEY) throw new Error('quota');
    originalSet(key, value);
  } });
  await expect(syncProgress(progress(1))).rejects.toThrow('quota');
  expect(fetcher).not.toHaveBeenCalled();
  expect(stored.get('pet-storage')).toBe('{"gold":12360}');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const progress = (completedStages: number) => ({ dungeon_progress: [{ dungeonId: 'dungeon-01', completedStages, totalStages: 5, bestScore: completedStages, bestRating: 'A', bossDefeated: false, status: 'in_progress' }] });
it('persists failed progress, combines later clears and replays it without sending wallet fields', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetcher);
  const result = await syncProgress({ ...progress(1), gold: 99999, exp: 99999 });
  expect(result).toMatchObject({ success: false, pending: true });
  await syncProgress(progress(3));
  expect(fetcher).toHaveBeenCalledTimes(1); // Respect backoff even when another battle completes.
  fetcher.mockResolvedValue(new Response('{"success":true,"synced":true}'));
  vi.setSystemTime(new Date('2026-10-19T00:01:00Z'));
  await flushPendingDungeonSync();
  const sent = JSON.parse(fetcher.mock.calls.at(-1)![1].body);
  expect(sent.dungeon_progress[0].completedStages).toBe(3);
  expect(sent).toMatchObject({ device_hash: 'original-device', class_code: 'CLASS1' });
  expect(sent).not.toHaveProperty('gold'); expect(sent).not.toHaveProperty('exp');
  const count = fetcher.mock.calls.length;
  await flushPendingDungeonSync(); expect(fetcher).toHaveBeenCalledTimes(count);
});
