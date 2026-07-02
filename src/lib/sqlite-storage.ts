// SQLite storage adapter — wraps Rust get_setting/set_setting commands.
// Used as the primary persistence layer replacing localStorage for core data.
import { invoke } from '@tauri-apps/api/core';

// 检测是否在 Tauri 运行时内（浏览器里 invoke 为 undefined，需降级到 localStorage 防崩）
function isTauriAvailable(): boolean {
  return typeof invoke === 'function';
}

// Tauri 不可用时降级到 localStorage（开发期浏览器预览、或异常环境兜底）
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

/**
 * Read a value from SQLite settings table.
 * Returns the stored string, or null if the key doesn't exist or on error.
 * 5-second timeout prevents hanging on slow/blocked SQLite (Windows).
 * Tauri 不可用时降级 localStorage。
 */
export async function sqliteGet(key: string): Promise<string | null> {
  if (!isTauriAvailable()) return lsGet(key);
  try {
    return await Promise.race([
      invoke('get_setting', { key }) as Promise<string | null>,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
  } catch (e) {
    console.error('[sqlite] get_setting failed for "' + key + '":', e);
    return null;
  }
}

/**
 * Write a value to SQLite settings table (async, awaits completion).
 * Use for migrations and one-time writes where you need confirmation.
 * 5-second timeout prevents hanging on slow/blocked SQLite (Windows).
 * Tauri 不可用时降级 localStorage。
 */
export async function sqliteSet(key: string, value: string): Promise<void> {
  if (!isTauriAvailable()) { lsSet(key, value); return; }
  try {
    await Promise.race([
      invoke('set_setting', { key, value }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
  } catch (e) {
    console.error('[sqlite] set_setting failed for "' + key + '":', e);
  }
}

/**
 * Fire-and-forget write to SQLite settings table.
 * Use inside synchronous Zustand store actions where you can't await.
 * Errors are logged but not thrown — the in-memory Zustand state is the
 * source of truth; persistence is eventually consistent.
 * Tauri 不可用时降级 localStorage。
 */
export function sqliteSetFireAndForget(key: string, value: string): void {
  if (!isTauriAvailable()) { lsSet(key, value); return; }
  try {
    invoke('set_setting', { key, value }).catch(e =>
      console.error('[sqlite] set_setting failed for "' + key + '":', e)
    );
  } catch (e) {
    console.error('[sqlite] set_setting sync throw for "' + key + '":', e);
  }
}
