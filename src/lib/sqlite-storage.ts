// SQLite storage adapter — wraps Rust get_setting/set_setting commands.
// Used as the primary persistence layer replacing localStorage for core data.
import { invoke } from '@tauri-apps/api/core';

/**
 * Read a value from SQLite settings table.
 * Returns the stored string, or null if the key doesn't exist or on error.
 */
export async function sqliteGet(key: string): Promise<string | null> {
  try {
    return await invoke('get_setting', { key }) as string | null;
  } catch (e) {
    console.error(`[sqlite] get_setting failed for "${key}":`, e);
    return null;
  }
}

/**
 * Write a value to SQLite settings table (async, awaits completion).
 * Use for migrations and one-time writes where you need confirmation.
 */
export async function sqliteSet(key: string, value: string): Promise<void> {
  try {
    await invoke('set_setting', { key, value });
  } catch (e) {
    console.error(`[sqlite] set_setting failed for "${key}":`, e);
  }
}

/**
 * Fire-and-forget write to SQLite settings table.
 * Use inside synchronous Zustand store actions where you can't await.
 * Errors are logged but not thrown — the in-memory Zustand state is the
 * source of truth; persistence is eventually consistent.
 */
export function sqliteSetFireAndForget(key: string, value: string): void {
  try {
    invoke('set_setting', { key, value }).catch(e =>
      console.error(`[sqlite] set_setting failed for "${key}":`, e)
    );
  } catch (e) {
    console.error(`[sqlite] set_setting sync throw for "${key}":`, e);
  }
}
