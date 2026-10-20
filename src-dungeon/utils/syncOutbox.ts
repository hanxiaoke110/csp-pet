import { storageWritesAllowed, RESTORE_GENERATION_KEY } from '../../src/lib/restoreBarrier';

export const DUNGEON_SYNC_OUTBOX_KEY = 'dungeon_sync_outbox_v1';
export interface SyncScope { deviceHash: string; classCode: string; seasonId: string }
interface Pending { version: 1; scope: SyncScope; generation: string; revision: string; patch: Record<string, any>; attempts: number; nextAttemptAt: number }
export interface SyncResult { success: boolean; synced?: boolean; pending?: boolean; reason?: string }
const generation = () => localStorage.getItem(RESTORE_GENERATION_KEY) || '';
const sameScope = (a: SyncScope, b: SyncScope) => a?.deviceHash === b.deviceHash && a?.classCode === b.classCode && a?.seasonId === b.seasonId;
const number = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
const ratings = ['D', 'C', 'B', 'A', 'S', 'SS'];
const statuses = ['locked', 'unlocked', 'in_progress', 'cleared'];

// Only monotonic progress, badges and editable profile fields. Never replay money/rewards.
function mergePatch(before: Record<string, any>, update: Record<string, any>): Record<string, any> {
  const result = { ...before };
  for (const field of ['display_name', 'school']) {
    if (typeof update[field] === 'string') result[field] = update[field].slice(0, 32);
  }
  const progress = new Map<string, any>();
  for (const item of [...(Array.isArray(before.dungeon_progress) ? before.dungeon_progress : []), ...(Array.isArray(update.dungeon_progress) ? update.dungeon_progress : [])]) {
    if (!item || typeof item.dungeonId !== 'string' || !/^dungeon-\d{2}$/.test(item.dungeonId)) continue;
    const previous = progress.get(item.dungeonId);
    progress.set(item.dungeonId, {
      dungeonId: item.dungeonId,
      completedStages: Math.max(previous?.completedStages || 0, number(item.completedStages, 5)),
      totalStages: 5,
      bossDefeated: previous?.bossDefeated === true || item.bossDefeated === true,
      bestScore: Math.max(previous?.bestScore || 0, number(item.bestScore, 10000)),
      bestRating: ratings[Math.max(0, ratings.indexOf(previous?.bestRating), ratings.indexOf(item.bestRating))],
      status: statuses[Math.max(0, statuses.indexOf(previous?.status), statuses.indexOf(item.status))],
    });
  }
  if (progress.size) result.dungeon_progress = [...progress.values()];
  const badges = [...new Set([...(Array.isArray(before.badges) ? before.badges : []), ...(Array.isArray(update.badges) ? update.badges : [])]
    .filter((badge: unknown) => typeof badge === 'string' && /^[\w-]{1,80}$/.test(badge)))];
  if (badges.length > 256) throw new Error('待同步徽章数量异常，请保留数据后重试');
  if (badges.length) result.badges = badges;
  return result;
}
function read(scope: SyncScope): Pending | null {
  const raw = localStorage.getItem(DUNGEON_SYNC_OUTBOX_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !value.patch || typeof value.patch !== 'object' || Array.isArray(value.patch)
    || typeof value.revision !== 'string' || !Number.isFinite(value.nextAttemptAt) || !Number.isInteger(value.attempts) || value.attempts < 0) throw new Error('待同步记录异常，请保留本地数据');
  // An old student's/season's queue, or a pre-restore queue, must never follow a new identity.
  return sameScope(value.scope, scope) && value.generation === generation() ? value : null;
}
function write(value: Pending) {
  const raw = JSON.stringify(value);
  if (raw.length > 128 * 1024) throw new Error('待同步记录过大');
  localStorage.setItem(DUNGEON_SYNC_OUTBOX_KEY, raw);
  if (localStorage.getItem(DUNGEON_SYNC_OUTBOX_KEY) !== raw) throw new Error('待同步记录未能保存');
}
async function locked<T>(action: () => T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('csp-dungeon-sync-v1', action);
  return action(); // Synchronous local commit; old WebViews retain ordinary single-window use.
}
export async function enqueueDungeonSync(scope: SyncScope, patch: Record<string, unknown>): Promise<void> {
  await locked(() => {
    if (!storageWritesAllowed()) return;
    const old = read(scope);
    write({ version: 1, scope, generation: generation(), revision: crypto.randomUUID(),
      patch: mergePatch(old?.patch || {}, patch), attempts: old?.attempts || 0, nextAttemptAt: old?.nextAttemptAt || 0 });
  });
}
let inFlight: Promise<SyncResult> | null = null;
export function flushDungeonSync(scope: SyncScope, send: (patch: Record<string, unknown>, scope: SyncScope) => Promise<SyncResult>): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = flush(scope, send).finally(() => { inFlight = null; });
  return inFlight;
}
async function flush(scope: SyncScope, send: (patch: Record<string, unknown>, scope: SyncScope) => Promise<SyncResult>): Promise<SyncResult> {
  if (!storageWritesAllowed() || !scope.deviceHash || !scope.classCode) return { success: false, pending: true };
  const pending = await locked(() => read(scope));
  if (!pending) return { success: true, synced: true, pending: false };
  if (pending.nextAttemptAt > Date.now() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { success: false, pending: true };
  let response: SyncResult | undefined;
  try { response = await send(mergePatch({}, pending.patch), pending.scope); } catch { /* Persist retry state below; no reward is applied here. */ }
  return locked(() => {
    if (!storageWritesAllowed()) return { success: false, pending: true };
    const current = read(scope);
    if (!current || current.generation !== pending.generation) return { success: false, pending: true };
    if (response?.success === true && response.synced !== false) {
      if (current.revision === pending.revision) {
        localStorage.removeItem(DUNGEON_SYNC_OUTBOX_KEY);
        return { success: true, synced: true, pending: false };
      }
      // New progress arrived while the request was in flight. Never acknowledge it away.
      write({ ...current, attempts: 0, nextAttemptAt: Date.now() + 5000 });
    } else {
      const attempts = Math.min(20, current.attempts + 1);
      const delay = response?.reason === 'daily_write_budget' ? 3600000 : Math.min(1800000, 30000 * 2 ** (attempts - 1));
      write({ ...current, attempts, nextAttemptAt: Date.now() + delay });
    }
    return { success: false, pending: true, reason: response?.reason };
  });
}
