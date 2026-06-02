// Crash-safe localStorage helpers with temp-key backup.
// Write tmp key first, then swap — reduces corruption risk on crash.

export function safeLsGet(key: string, fallback: string = '{}'): string {
  try {
    let raw = localStorage.getItem(key);
    if (!raw) raw = localStorage.getItem(key + '_tmp');
    if (raw) return raw;
  } catch {}
  return fallback;
}

export function safeLsSet(key: string, json: string): void {
  try {
    localStorage.setItem(key + '_tmp', json);
    localStorage.setItem(key, json);
    localStorage.removeItem(key + '_tmp');
  } catch (e) {
    console.error(`[storage] safeLsSet failed for ${key}:`, e);
  }
}

export function safeLsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(key + '_tmp');
  } catch {}
}
