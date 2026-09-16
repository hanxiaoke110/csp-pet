import { BaseDirectory, exists, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type {
  CollectorCardAssets,
  CollectorCardDefinition,
  ResolvedCollectorCardAssets,
} from '../types/collectorCard';

const CACHE_ROOT = 'collector-cards';
const CACHE_META_KEY = 'csp_collector_card_cache_v1';
const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const ASSET_KEYS = ['thumbnail', 'background', 'subject', 'text'] as const;
const blobUrls = new Map<string, string>();

type AssetKey = typeof ASSET_KEYS[number];
type DownloadProgress = (completed: number, total: number, label: string) => void;

function isTauriAvailable(): boolean {
  const runtime = window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };
  return typeof runtime.__TAURI_INTERNALS__?.invoke === 'function';
}

export function isAllowedCollectorCardUrl(url: string): boolean {
  if (url.startsWith('/collector-cards/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (
      parsed.hostname === 'gitee.com'
      || parsed.hostname === 'cards.cspstudy.top'
    );
  } catch {
    return false;
  }
}

function extensionFor(key: AssetKey, url: string): string {
  const pathname = (() => { try { return new URL(url, window.location.origin).pathname; } catch { return ''; } })();
  const ext = pathname.match(/\.(png|webp|jpg|jpeg)$/i)?.[1]?.toLowerCase();
  if (ext) return ext === 'jpeg' ? 'jpg' : ext;
  return key === 'thumbnail' ? 'webp' : 'png';
}

function mimeFor(path: string): string {
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.jpg')) return 'image/jpeg';
  return 'image/png';
}

function cacheMeta(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CACHE_META_KEY) || '{}'); } catch { return {}; }
}

function writeCacheMeta(cardId: string, version: number): void {
  try { localStorage.setItem(CACHE_META_KEY, JSON.stringify({ ...cacheMeta(), [cardId]: version })); } catch {}
}

async function digestSha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes).buffer;
  const hash = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  if (!isAllowedCollectorCardUrl(url)) throw new Error('卡片素材地址不在允许列表中');
  const response = await tauriFetch(url, { connectTimeout: 30_000 });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_ASSET_BYTES) throw new Error('卡片素材大小异常');
  return bytes;
}

async function blobUrlFor(relPath: string): Promise<string> {
  const existing = blobUrls.get(relPath);
  if (existing) return existing;
  const bytes = await readFile(relPath, { baseDir: BaseDirectory.AppData });
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeFor(relPath) }));
  blobUrls.set(relPath, url);
  return url;
}

function usesBundledAssets(assets: CollectorCardAssets): boolean {
  return ASSET_KEYS.every(key => !assets[key] || assets[key]!.startsWith('/collector-cards/'));
}

function assetKeysFor(card: CollectorCardDefinition): AssetKey[] {
  return ASSET_KEYS.filter(key => Boolean(card.assets[key]));
}

export async function areCollectorCardAssetsCached(card: CollectorCardDefinition): Promise<boolean> {
  if (usesBundledAssets(card.assets)) return true;
  if (!isTauriAvailable()) return false;
  if (cacheMeta()[card.id] !== card.version) return false;
  return (await Promise.all(assetKeysFor(card).map(key => {
    const name = `${key}.${extensionFor(key, card.assets[key]!)}`;
    return exists(`${CACHE_ROOT}/${card.id}/${name}`, { baseDir: BaseDirectory.AppData });
  }))).every(Boolean);
}

export async function ensureCollectorCardAssets(
  card: CollectorCardDefinition,
  onProgress?: DownloadProgress,
): Promise<ResolvedCollectorCardAssets> {
  if (usesBundledAssets(card.assets) || !isTauriAvailable()) {
    const total = assetKeysFor(card).length;
    onProgress?.(total, total, '典藏卡已显影');
    return { ...card.assets, source: usesBundledAssets(card.assets) ? 'bundled' : 'remote' };
  }

  const dir = `${CACHE_ROOT}/${card.id}`;
  await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
  const currentVersion = cacheMeta()[card.id];
  const resolved = {} as CollectorCardAssets;
  const assetKeys = assetKeysFor(card);

  for (let index = 0; index < assetKeys.length; index++) {
    const key = assetKeys[index];
    const assetUrl = card.assets[key]!;
    const name = `${key}.${extensionFor(key, assetUrl)}`;
    const path = `${dir}/${name}`;
    const hasCurrent = currentVersion === card.version
      && await exists(path, { baseDir: BaseDirectory.AppData });
    if (!hasCurrent) {
      onProgress?.(index, assetKeys.length, `正在下载${key === 'background' ? '舞台' : key === 'subject' ? '角色' : key === 'text' ? '铭文' : '封面'}…`);
      const bytes = await fetchBytes(assetUrl);
      const expected = card.checksums?.[key]?.toLowerCase();
      if (expected && await digestSha256(bytes) !== expected) throw new Error('素材校验失败，请重试');
      await writeFile(path, bytes, { baseDir: BaseDirectory.AppData });
      const staleBlobUrl = blobUrls.get(path);
      if (staleBlobUrl) URL.revokeObjectURL(staleBlobUrl);
      blobUrls.delete(path);
    }
    resolved[key] = await blobUrlFor(path);
    onProgress?.(index + 1, assetKeys.length, '水幕正在显影…');
  }
  writeCacheMeta(card.id, card.version);
  return { ...resolved, source: currentVersion === card.version ? 'cache' : 'remote' };
}
