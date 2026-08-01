// Shared persistence helper — used by all Zustand stores.
// Writes to local localStorage first (sync, reliable), then SQLite as backup.
import { sqliteSetFireAndForget, sqliteGet } from './sqlite-storage';
import { safeLsSet, safeLsGet } from './storage';

/** Dual-write save: localStorage primary, SQLite backup. Call from any store save(). */
export function dualSave(sqliteKey: string, lsKey: string, json: string): void {
  safeLsSet(lsKey, json);
  sqliteSetFireAndForget(sqliteKey, json);
}

/** Dual-read load: localStorage first, SQLite fallback. Also picks the newer copy. */
export async function dualLoad(sqliteKey: string, lsKey: string): Promise<string> {
  const ls = safeLsGet(lsKey, '');
  // Fallback: SQLite
  let sql = '';
  try { sql = (await sqliteGet(sqliteKey)) || ''; } catch {}

  // Both empty — nothing to load
  if (!ls && !sql) return '';

  // Only one has data
  if (!ls) return sql;
  if (!sql) return ls;

  // Both have data — pick the one with the newer updatedAt
  try {
    const lsObj = JSON.parse(ls);
    const sqlObj = JSON.parse(sql);
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
