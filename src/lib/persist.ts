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
    // Compare ownedPets max updatedAt as freshness signal
    const lsTime = getMaxUpdatedAt(lsObj);
    const sqlTime = getMaxUpdatedAt(sqlObj);
    if (sqlTime > lsTime) {
      // SQLite is newer — also restore to localStorage
      safeLsSet(lsKey, sql);
      return sql;
    }
  } catch {}

  return ls;
}

function getMaxUpdatedAt(data: any): number {
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
