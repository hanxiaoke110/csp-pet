import { BaseDirectory, exists, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { ResolvedWardrobeAsset, WardrobeItem } from '../types/profile';

const CACHE_ROOT = 'wardrobe-assets';
const CACHE_META_KEY = 'csp_wardrobe_asset_cache_v1';
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const blobUrls = new Map<string, string>();

function isTauriAvailable(): boolean {
  const runtime = window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };
  return typeof runtime.__TAURI_INTERNALS__?.invoke === 'function';
}

export function isAllowedWardrobeUrl(url: string): boolean {
  if (url.startsWith('/profile/') || url.startsWith('/wardrobe/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === 'gitee.com' || parsed.hostname === 'cards.cspstudy.top');
  } catch { return false; }
}

function isBundled(url: string): boolean { return url.startsWith('/profile/') || url.startsWith('/wardrobe/'); }
function extension(url: string): string { return url.match(/\.(png|webp|jpg|jpeg)(?:\?|$)/i)?.[1]?.toLowerCase().replace('jpeg', 'jpg') || 'webp'; }
function mime(path: string): string { return path.endsWith('.png') ? 'image/png' : path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp'; }
function readMeta(): Record<string, number> { try { return JSON.parse(localStorage.getItem(CACHE_META_KEY) || '{}'); } catch { return {}; } }
function writeMeta(id: string, version: number): void { try { localStorage.setItem(CACHE_META_KEY, JSON.stringify({ ...readMeta(), [id]: version })); } catch {} }

async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function blobUrl(path: string): Promise<string> {
  const current = blobUrls.get(path);
  if (current) return current;
  const bytes = await readFile(path, { baseDir: BaseDirectory.AppData });
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime(path) }));
  blobUrls.set(path, url);
  return url;
}

export async function isWardrobeAssetCached(item: WardrobeItem): Promise<boolean> {
  if (!item.asset || isBundled(item.asset)) return true;
  if (!isTauriAvailable() || readMeta()[item.id] !== item.version) return false;
  return exists(`${CACHE_ROOT}/${item.id}/asset.${extension(item.asset)}`, { baseDir: BaseDirectory.AppData });
}

export async function ensureWardrobeAsset(item: WardrobeItem, onProgress?: (label: string) => void): Promise<ResolvedWardrobeAsset> {
  if (!item.asset) return { url: '', source: 'none' };
  if (!isAllowedWardrobeUrl(item.asset)) throw new Error('装扮素材地址不在允许列表中');
  if (isBundled(item.asset)) return { url: item.asset, source: 'bundled' };
  if (!isTauriAvailable()) return { url: item.asset, source: 'remote' };

  const path = `${CACHE_ROOT}/${item.id}/asset.${extension(item.asset)}`;
  const current = readMeta()[item.id] === item.version && await exists(path, { baseDir: BaseDirectory.AppData });
  if (!current) {
    onProgress?.('正在从星云中取回装扮…');
    const response = await tauriFetch(item.asset, { connectTimeout: 30_000 });
    if (!response.ok) throw new Error(`装扮下载失败（HTTP ${response.status}）`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_ASSET_BYTES) throw new Error('装扮素材大小异常');
    if (item.assetBytes && bytes.byteLength !== item.assetBytes) throw new Error('装扮素材大小校验失败');
    if (item.checksum && await sha256(bytes) !== item.checksum.toLowerCase()) throw new Error('装扮素材校验失败');
    await mkdir(`${CACHE_ROOT}/${item.id}`, { baseDir: BaseDirectory.AppData, recursive: true });
    await writeFile(path, bytes, { baseDir: BaseDirectory.AppData });
    writeMeta(item.id, item.version);
    const stale = blobUrls.get(path); if (stale) URL.revokeObjectURL(stale); blobUrls.delete(path);
  }
  return { url: await blobUrl(path), source: current ? 'cache' : 'remote' };
}

export async function ensureWardrobeInteractionAsset(item: WardrobeItem, onProgress?: (label: string) => void): Promise<ResolvedWardrobeAsset> {
  const interaction = item.interaction;
  if (!interaction) return { url: '', source: 'none' };
  return ensureWardrobeAsset({
    ...item,
    id: `${item.id}-interaction`,
    asset: interaction.atlas,
    assetBytes: interaction.atlasBytes,
    checksum: interaction.atlasChecksum,
  }, onProgress);
}
