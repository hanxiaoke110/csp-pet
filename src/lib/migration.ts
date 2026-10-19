// One-time migration: copy core data from localStorage to SQLite.
// localStorage data is NEVER deleted — it remains as a read-only backup.
import { sqliteGet, sqliteSet } from './sqlite-storage';

const MIGRATION_FLAG = 'migration_done_v1';

/**
 * Map of SQLite settings keys → localStorage keys for core data.
 * All values are stored as raw JSON strings (same format as localStorage).
 */
const CORE_KEYS: Record<string, string> = {
  pet_data: 'csp_pet_data',
  hatch_eggs: 'csp_hatch_eggs',
  quiz_state: 'csp_quiz_state',
  problem_status: 'csp_problem_status',
  collector_cards: 'csp_collector_cards_v1',
};

/**
 * Run once at app startup. Copies localStorage core data into SQLite
 * if not already migrated. Safe to call multiple times — it's idempotent.
 */
export async function migrateLocalStorageToSqlite(): Promise<void> {
  try {
    const done = await sqliteGet(MIGRATION_FLAG);
    if (done === '1') return; // Already migrated
  } catch { return; }

  console.log('[migration] Starting localStorage → SQLite migration...');
  let migrated = 0;
  let failed = false;

  for (const [sqlKey, lsKey] of Object.entries(CORE_KEYS)) {
    try {
      const raw = localStorage.getItem(lsKey);
      const existing = await sqliteGet(sqlKey);
      if (raw !== null && existing === null) {
        JSON.parse(raw);
        await sqliteSet(sqlKey, raw);
        migrated++;
      }
    } catch (e) {
      failed = true;
      console.error(`[migration] Failed to migrate ${lsKey}:`, e);
    }
  }

  // Mark migration complete
  if (failed) return;
  try {
    await sqliteSet(MIGRATION_FLAG, '1');
    console.log(`[migration] Done. Migrated ${migrated}/${Object.keys(CORE_KEYS).length} keys.`);
  } catch (e) {
    console.error('[migration] Failed to set migration flag:', e);
  }
}
