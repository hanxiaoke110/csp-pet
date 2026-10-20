// A persisted generation fences stale stores in every WebView, including the
// restoring window. Only a fresh page may adopt a completed new generation.
export const RESTORE_GENERATION_KEY = 'csp_restore_generation_v1';
const read = () => { try { return localStorage.getItem(RESTORE_GENERATION_KEY) || ''; } catch { return ''; } };
const initialGeneration = read();
export const interruptedRestore = initialGeneration.startsWith('restoring:');
export function storageWritesAllowed(): boolean {
  const current = read();
  return current === initialGeneration && !current.startsWith('restoring:');
}
export function beginRestoreBarrier(): { complete: () => void; cancel: () => void } {
  if (!storageWritesAllowed()) throw new Error('存档恢复状态已改变，请重新加载应用');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(RESTORE_GENERATION_KEY, `restoring:${id}`);
  return {
    complete: () => localStorage.setItem(RESTORE_GENERATION_KEY, `complete:${id}`),
    cancel: () => { if (initialGeneration) localStorage.setItem(RESTORE_GENERATION_KEY, initialGeneration); else localStorage.removeItem(RESTORE_GENERATION_KEY); },
  };
}
