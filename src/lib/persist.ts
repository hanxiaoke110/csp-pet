// Shared persistence helper — used by all Zustand stores.
// Writes to local localStorage first (sync, reliable), then SQLite as backup.
import { sqliteSetFireAndForget, sqliteGet } from './sqlite-storage';
import { safeLsSet, safeLsGet } from './storage';

/** Dual-write save: localStorage primary, SQLite backup. Call from any store save(). */
export function dualSave(sqliteKey: string, lsKey: string, json: string): void {
  safeLsSet(lsKey, json);
  sqliteSetFireAndForget(sqliteKey, json);
}

/** Dual-read load: localStorage first (sync), SQLite fallback. Call from async store load(). */
export async function dualLoad(sqliteKey: string, lsKey: string): Promise<string> {
  // Primary: localStorage
  const ls = safeLsGet(lsKey, '');
  if (ls) return ls;
  // Fallback: SQLite
  try {
    const sql = await sqliteGet(sqliteKey);
    if (sql) return sql;
  } catch { /* SQLite unavailable */ }
  return '';
}
