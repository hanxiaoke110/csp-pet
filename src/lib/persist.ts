// Shared persistence helper — used by all Zustand stores.
// Writes to local localStorage first (sync, reliable), then SQLite as backup.
import { sqliteSetFireAndForget, sqliteGet } from './sqlite-storage';
import { safeLsSet } from './storage';
import { storageWritesAllowed } from './restoreBarrier';

/** Dual-write save: localStorage primary, SQLite backup. Call from any store save(). */
export function dualSave(sqliteKey: string, lsKey: string, json: string): void {
  if (!storageWritesAllowed()) return;
  safeLsSet(lsKey, json);
  sqliteSetFireAndForget(sqliteKey, json);
}

/** Dual-read load: localStorage first, SQLite fallback. Also picks the newer copy. */
export async function dualLoad(sqliteKey: string, lsKey: string): Promise<string> {
  // Fallback: SQLite
  let sql = '';
  let readError: unknown;
  try { sql = (await sqliteGet(sqliteKey)) || ''; } catch (error) { readError = error; }
  // Another window may commit while SQLite is pending. Compare its latest local
  // authority, never the wallet or dedupe ledger captured before the await.
  let ls = '';
  try { ls = localStorage.getItem(lsKey) || localStorage.getItem(lsKey + '_tmp') || ''; }
  catch (error) { if (!sql) throw error; }

  // Both empty — nothing to load
  if (!ls && !sql) {
    if (readError) throw new Error('无法确认存档状态，请重试；不要重新领养或清空数据。');
    return '';
  }
  const parse = (raw: string) => {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object') return null;
      if (sqliteKey === 'pet_data' && (!Array.isArray(value.ownedPets)
        || (typeof value.coins !== 'number' && typeof value.coins !== 'string')
        || value.coins === '' || !Number.isFinite(Number(value.coins)) || Number(value.coins) < 0
        || !value.ownedPets.every((pet: any) => pet && typeof pet.petId === 'string' && typeof pet.speciesId === 'string'))) return null;
      return value;
    } catch { return null; }
  };
  const lsObj = parse(ls);
  const sqlObj = parse(sql);
  if (!lsObj && !sqlObj) throw new Error('存档副本无法读取，请保留数据并从备份恢复。');
  if (!lsObj) { safeLsSet(lsKey, sql); return sql; }
  if (!sqlObj) return ls;

  // Both have data — pick the one with the newer updatedAt
  try {
    const lsTime = getSnapshotUpdatedAt(lsObj);
    const sqlTime = getSnapshotUpdatedAt(sqlObj);
    const preferSql = sqlTime > lsTime;
    const preferred = preferSql ? sqlObj : lsObj;
    const alternate = preferSql ? lsObj : sqlObj;

    // Permanent pet entitlements are monotonic. A companion-slot purchase does
    // not touch a pet's updatedAt, so an older snapshot could previously win and
    // make a paid slot disappear after an update/restart.
    const merged = sqliteKey === 'pet_data'
      ? mergePetEntitlements(preferred, alternate)
      : preferred;
    const result = JSON.stringify(merged);
    if (preferSql || result !== ls) {
      safeLsSet(lsKey, result);
    }
    return result;
  } catch {}

  return ls;
}

function getSnapshotUpdatedAt(data: any): number {
  const savedAt = data?.savedAt ? new Date(data.savedAt).getTime() : 0;
  if (Number.isFinite(savedAt) && savedAt > 0) return savedAt;
  let max = 0;
  try {
    if (data.ownedPets) {
      for (const p of data.ownedPets) {
        const t = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
        if (t > max) max = t;
      }
    }
  } catch {}
  return max;
}

function mergePetEntitlements(preferred: any, alternate: any): any {
  const preferredSlots = Math.min(3, Math.max(1, Number(preferred?.companionSlots) || 1));
  const alternateSlots = Math.min(3, Math.max(1, Number(alternate?.companionSlots) || 1));
  const companionSlots = Math.max(preferredSlots, alternateSlots);
  const desktopCompanionIds = alternateSlots > preferredSlots
    && Array.isArray(alternate?.desktopCompanionIds)
    ? alternate.desktopCompanionIds
    : preferred?.desktopCompanionIds;
  return {
    ...preferred,
    companionSlots,
    desktopCompanionIds: Array.isArray(desktopCompanionIds) ? desktopCompanionIds : [],
  };
}
