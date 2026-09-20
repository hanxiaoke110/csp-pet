import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { CollectorCardCatalog, CollectorCardDefinition } from '../types/collectorCard';

export const COLLECTOR_CARD_CATALOG_URL =
  'https://cards.cspstudy.top/collector-cards/catalog.json';
export const COLLECTOR_CARD_CATALOG_FALLBACK_URL =
  'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/collector-cards/catalog.json';

const CATALOG_CACHE_KEY = 'csp_collector_card_catalog_cache_v1';

function isAssetSet(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const assets = value as Record<string, unknown>;
  if (!['thumbnail', 'background'].every(key => typeof assets[key] === 'string' && assets[key].length > 0)) return false;
  return ['subject', 'text'].every(key => assets[key] == null || (typeof assets[key] === 'string' && assets[key].length > 0));
}

export function isCollectorCardCatalog(value: unknown): value is CollectorCardCatalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<CollectorCardCatalog>;
  if (!Number.isInteger(catalog.version) || (catalog.version || 0) < 1 || !Array.isArray(catalog.cards)) return false;
  const ids = new Set<string>();
  return catalog.cards.every(card => {
    if (!card || typeof card !== 'object') return false;
    const item = card as CollectorCardDefinition;
    if (!item.id || ids.has(item.id)) return false;
    ids.add(item.id);
    return Number.isInteger(item.version)
      && item.version > 0
      && Number.isFinite(item.price)
      && item.price >= 0
      && typeof item.name === 'string'
      && typeof item.number === 'string'
      && isAssetSet(item.assets);
  });
}

function normalizeAssetUrl(value: string, sourceUrl: string): string {
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  if (sourceUrl.startsWith('http')) return new URL(value, sourceUrl).href;
  const bundledCatalog = new URL('/collector-cards/catalog.json', window.location.origin);
  return new URL(value, bundledCatalog).pathname;
}

export function normalizeCollectorCardCatalog(
  catalog: CollectorCardCatalog,
  sourceUrl: string,
): CollectorCardCatalog {
  return {
    ...catalog,
    cards: catalog.cards.map(card => ({
      ...card,
      assets: Object.fromEntries(
        Object.entries(card.assets).map(([key, value]) => [key, normalizeAssetUrl(value as string, sourceUrl)]),
      ) as unknown as CollectorCardDefinition['assets'],
    })),
  };
}

async function fetchCatalog(url: string, timeoutMs: number): Promise<CollectorCardCatalog> {
  const runtime = window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };
  if (url.startsWith('https:') && typeof runtime.__TAURI_INTERNALS__?.invoke === 'function') {
    const response = await tauriFetch(url, { connectTimeout: timeoutMs });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!isCollectorCardCatalog(data)) throw new Error('典藏卡清单格式错误');
    return normalizeCollectorCardCatalog(data, url);
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!isCollectorCardCatalog(data)) throw new Error('典藏卡清单格式错误');
    return normalizeCollectorCardCatalog(data, url);
  } finally {
    window.clearTimeout(timer);
  }
}

function readCachedCatalog(): CollectorCardCatalog | null {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
    return isCollectorCardCatalog(data) ? data : null;
  } catch {
    return null;
  }
}

function cacheCatalog(catalog: CollectorCardCatalog): void {
  try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog)); } catch {}
}

export function mergeCollectorCardCatalog(
  bundled: CollectorCardCatalog,
  remote: CollectorCardCatalog | null,
): CollectorCardCatalog {
  const cards = new Map(bundled.cards.map(card => [card.id, card]));
  for (const card of remote?.cards || []) {
    const local = cards.get(card.id);
    // The founder cards already ship with the app. Keep those local assets until
    // an online card has a genuinely newer version, avoiding duplicate downloads.
    if (!local || card.version > local.version) cards.set(card.id, card);
  }
  return {
    version: Math.max(bundled.version, remote?.version || 1),
    updatedAt: remote?.updatedAt || bundled.updatedAt,
    cards: [...cards.values()],
  };
}

export async function loadCollectorCardCatalog(): Promise<CollectorCardCatalog> {
  const bundled = await fetchCatalog('/collector-cards/catalog.json', 5000);
  let remote: CollectorCardCatalog | null = null;
  try {
    remote = await fetchCatalog(COLLECTOR_CARD_CATALOG_URL, 6000);
  } catch {
    try { remote = await fetchCatalog(COLLECTOR_CARD_CATALOG_FALLBACK_URL, 6000); }
    catch { remote = readCachedCatalog(); }
  }
  if (remote) cacheCatalog(remote);
  return mergeCollectorCardCatalog(bundled, remote);
}
