// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { formatCacheBytes, inspectDownloadCache } from './downloadCache';
beforeEach(() => { localStorage.clear(); invoke.mockReset(); });
it('browser fallback never pretends to read or clean local disk', async () => {
  await expect(inspectDownloadCache(true)).rejects.toThrow('浏览器预览无法读取本机缓存');
  expect(invoke).not.toHaveBeenCalled();
});
it('desktop uses the fixed command and passes no user-supplied path', async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  try {
    invoke.mockResolvedValue({ entries: [], removedBytes: 0, skippedFiles: 0 });
    await inspectDownloadCache(true);
    expect(invoke).toHaveBeenCalledWith('inspect_download_cache', { clean: true, questionPointers: null });
    expect(formatCacheBytes(1024 * 1024)).toBe('1.0 MB');
  } finally { delete (window as any).__TAURI_INTERNALS__; }
});

it('passes current and previous offline snapshot references fresh on every cleanup request', async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  try {
    const current = 'a'.repeat(64), previous = 'b'.repeat(64);
    const raw = JSON.stringify({ current: { file: `${current}.json`, hash: current }, previous: { file: `${previous}.json`, hash: previous } });
    localStorage.setItem('question_bank_v2_file_slots', raw);
    await inspectDownloadCache(false);
    expect(invoke).toHaveBeenLastCalledWith('inspect_download_cache', { clean: false, questionPointers: raw });
    const next = JSON.stringify({ current: { file: `${previous}.json`, hash: previous } });
    localStorage.setItem('question_bank_v2_file_slots', next);
    await inspectDownloadCache(true);
    expect(invoke).toHaveBeenLastCalledWith('inspect_download_cache', { clean: true, questionPointers: next });
  } finally { delete (window as any).__TAURI_INTERNALS__; }
});
