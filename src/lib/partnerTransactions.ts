import { dualSave } from './persist';
import { PARTNER_GROWTH_KEY, validateGrowthSnapshot, validGrowthId, validGrowthInteger } from '../utils/partnerGrowth';
import { PARTNER_ACCESSORY_KEY, validateAccessorySnapshot } from '../data/partnerAccessories';

export const PARTNER_JOURNAL_KEY = 'csp_partner_transaction_v1';
export const PARTNER_TRANSACTION_LOCK = 'csp-partner-transactions-v1';
/** All application commits and recovery share the browser's cross-window mutex.
 * Never nest this wrapper. Synchronous journal helpers are its locked core.
 */
export async function withPartnerTransactionLock<T>(action: () => T | Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) throw new Error('当前运行环境暂不支持安全交易，请更新系统或应用后重试。原有数据不受影响。');
  return navigator.locks.request(PARTNER_TRANSACTION_LOCK, { mode: 'exclusive' }, action);
}
/** Old read-only saves can open without Web Locks; pending recovery cannot. */
export async function recoverPartnerState(): Promise<void> {
  await withPartnerReadLock(() => recoverPartnerTransaction());
}
export async function withPartnerReadLock<T>(action: () => T | Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    if (localStorage.getItem(PARTNER_JOURNAL_KEY)) throw new Error('成长资料需要安全恢复，请更新运行环境后重试；请勿清空数据。');
    return action();
  }
  return withPartnerTransactionLock(action);
}
type Snapshots = Record<string, string | null>;
interface Journal { version: 1; phase: 'commit' | 'rollback'; before: Snapshots; after: Snapshots; mirrors: Record<string, string> }
function validMirrors(mirrors: unknown, after: Snapshots): mirrors is Record<string, string> {
  return Boolean(mirrors && typeof mirrors === 'object' && !Array.isArray(mirrors)
    && Object.entries(mirrors).every(([key, value]) => Object.prototype.hasOwnProperty.call(after, key)
      && typeof value === 'string' && /^[\w-]{1,80}$/.test(value)));
}

function validCommittedSnapshots(snapshots: Snapshots) {
  return Object.entries(snapshots).every(([key, raw]) => {
    if (raw === null || (key !== 'csp_pet_data' && key !== PARTNER_GROWTH_KEY && key !== PARTNER_ACCESSORY_KEY)) return true;
    try {
      const data = JSON.parse(raw);
      if (key === PARTNER_GROWTH_KEY) return validateGrowthSnapshot(data);
      if (key === PARTNER_ACCESSORY_KEY) return validateAccessorySnapshot(data);
      return Array.isArray(data?.ownedPets) && data.ownedPets.length <= 10_000 && validGrowthInteger(data.coins)
        && data.ownedPets.every((pet: any) => pet && validGrowthId(pet.petId) && validGrowthId(pet.speciesId))
        && new Set(data.ownedPets.map((pet: any) => pet.petId)).size === data.ownedPets.length;
    } catch { return false; }
  });
}

function validSnapshots(value: unknown): value is Snapshots {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.length <= 512 && entries.every(([key, raw]) =>
    /^(csp_|dungeon_)[\w:-]{1,160}$/.test(key) && key !== PARTNER_JOURNAL_KEY
    && (raw === null || (typeof raw === 'string' && raw.length <= 12 * 1024 * 1024)));
}
function write(snapshots: Snapshots) {
  for (const [key, raw] of Object.entries(snapshots)) {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error('未能完整保存成长数据');
  }
}
function mirror(snapshots: Snapshots, mirrors: Record<string, string>) {
  for (const [lsKey, sqliteKey] of Object.entries(mirrors)) {
    const raw = snapshots[lsKey];
    if (raw !== null && raw !== undefined) dualSave(sqliteKey, lsKey, raw);
  }
}
/** Recover before any participating store hydrates or a backup is read/written. */
export function recoverPartnerTransaction(): void {
  const raw = localStorage.getItem(PARTNER_JOURNAL_KEY);
  if (!raw) return;
  const journal: Journal = JSON.parse(raw);
  if (journal.version !== 1 || !['commit', 'rollback'].includes(journal.phase)
    || !validSnapshots(journal.before) || !validSnapshots(journal.after) || !validCommittedSnapshots(journal.after)
    || Object.keys(journal.before).sort().join() !== Object.keys(journal.after).sort().join()
    || !validMirrors(journal.mirrors, journal.after)) {
    throw new Error('成长交易记录异常，请保留备份后重试');
  }
  const selected = journal.phase === 'commit' ? journal.after : journal.before;
  write(selected);
  mirror(selected, journal.mirrors);
  localStorage.removeItem(PARTNER_JOURNAL_KEY);
}

/** Synchronous local commit is the durable authority; SQLite mirrors only follow it.
 * Accessory purchases can supply pet + inventory snapshots using this same API.
 * Callers validate their domain snapshots and publish Zustand only on true.
 */
export function commitLocalSnapshots(after: Snapshots, mirrors: Record<string, string> = {}): boolean {
  if (!validSnapshots(after) || !validCommittedSnapshots(after) || !validMirrors(mirrors, after)) return false;
  try {
    recoverPartnerTransaction();
    const before = Object.fromEntries(Object.keys(after).map(key => [key, localStorage.getItem(key)]));
    // Until every local write is confirmed the durable intent must be rollback.
    // If a full disk also blocks updating the journal, recovery still cannot charge a rejected purchase.
    const journal: Journal = { version: 1, phase: 'rollback', before, after, mirrors };
    localStorage.setItem(PARTNER_JOURNAL_KEY, JSON.stringify(journal));
    try {
      write(after);
      localStorage.setItem(PARTNER_JOURNAL_KEY, JSON.stringify({ ...journal, phase: 'commit' }));
      localStorage.removeItem(PARTNER_JOURNAL_KEY);
    } catch {
      try {
        localStorage.setItem(PARTNER_JOURNAL_KEY, JSON.stringify({ ...journal, phase: 'rollback' }));
        write(before);
        localStorage.removeItem(PARTNER_JOURNAL_KEY);
      } catch { /* The durable journal retains recovery intent. */ }
      return false;
    }
    try { mirror(after, mirrors); } catch { /* durable local snapshots are authoritative */ }
    return true;
  } catch { return false; }
}
