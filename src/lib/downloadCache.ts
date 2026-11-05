import { QUESTION_CACHE_POINTER_KEY } from '../question-bank/cacheStorage';
import { invoke } from '@tauri-apps/api/core';
export interface CacheReport {
  entries: { name: string; bytes: number; cleanableBytes: number }[];
  removedBytes: number;
  skippedFiles: number;
  questionCleanupAvailable: boolean;
}
export function hasDesktopCacheAccess(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
}
export function inspectDownloadCache(clean = false): Promise<CacheReport> {
  if (!hasDesktopCacheAccess()) return Promise.reject(new Error('浏览器预览无法读取本机缓存，请在桌面应用中查看'));
  let questionPointers: string | null = null;
  try { questionPointers = localStorage.getItem(QUESTION_CACHE_POINTER_KEY); } catch { /* Fail closed for unreadable offline references. */ }
  return invoke<CacheReport>('inspect_download_cache', { clean, questionPointers });
}
export function formatCacheBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
