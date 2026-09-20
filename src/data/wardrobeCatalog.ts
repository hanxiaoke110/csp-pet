import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { registerWardrobeItems, WARDROBE_ITEMS } from './wardrobe';
import type { WardrobeAcquisition, WardrobeCatalog, WardrobeItem } from '../types/profile';

export const WARDROBE_CATALOG_URL =
  'https://cards.cspstudy.top/wardrobe/catalog.json';
export const WARDROBE_CATALOG_FALLBACK_URL =
  'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/wardrobe/catalog.json';
export const WARDROBE_CATALOG_CACHE_KEY = 'csp_wardrobe_catalog_cache_v1';

const categories = new Set(['avatar', 'frame', 'background', 'pendant', 'effect', 'title']);
const rarities = new Set(['common', 'rare', 'epic', 'legendary', 'mythic']);

function isAcquisition(value: unknown): value is WardrobeAcquisition {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  if (a.type === 'free') return true;
  if (a.type === 'coin') return Number.isFinite(a.price) && Number(a.price) > 0;
  return a.type === 'condition' && typeof a.description === 'string' && a.description.length > 0;
}

function isInteraction(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'object') return false;
  const interaction = value as Record<string, unknown>;
  return interaction.type === 'direction-grid'
    && typeof interaction.atlas === 'string'
    && interaction.columns === 5
    && interaction.rows === 5
    && (interaction.atlasChecksum == null || /^[a-f0-9]{64}$/i.test(String(interaction.atlasChecksum)));
}

export function isWardrobeCatalog(value: unknown): value is WardrobeCatalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<WardrobeCatalog>;
  if (!Number.isInteger(catalog.version) || (catalog.version || 0) < 1 || !Array.isArray(catalog.items)) return false;
  const ids = new Set<string>();
  return catalog.items.every(raw => {
    const item = raw as WardrobeItem;
    if (!item || typeof item !== 'object' || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(item.id || '') || ids.has(item.id)) return false;
    ids.add(item.id);
    return Number.isInteger(item.version) && item.version > 0
      && categories.has(item.category)
      && rarities.has(item.rarity)
      && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 30
      && isAcquisition(item.acquisition)
      && (item.asset == null || typeof item.asset === 'string')
      && (item.thumbnail == null || typeof item.thumbnail === 'string')
      && (item.checksum == null || /^[a-f0-9]{64}$/i.test(item.checksum))
      && isInteraction(item.interaction);
  });
}

function normalizeUrl(value: string | undefined, sourceUrl: string): string | undefined {
  if (!value) return undefined;
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  if (sourceUrl.startsWith('http')) return new URL(value, sourceUrl).href;
  return new URL(value, new URL('/wardrobe/catalog.json', window.location.origin)).pathname;
}

export function normalizeWardrobeCatalog(catalog: WardrobeCatalog, sourceUrl: string): WardrobeCatalog {
  return { ...catalog, items: catalog.items.map(item => ({
    ...item,
    asset: normalizeUrl(item.asset, sourceUrl),
    thumbnail: normalizeUrl(item.thumbnail, sourceUrl),
    interaction: item.interaction ? { ...item.interaction, atlas: normalizeUrl(item.interaction.atlas, sourceUrl)! } : undefined,
  })) };
}

async function fetchCatalog(url: string, timeoutMs: number): Promise<WardrobeCatalog> {
  const runtime = window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };
  if (url.startsWith('https:') && typeof runtime.__TAURI_INTERNALS__?.invoke === 'function') {
    const response = await tauriFetch(url, { connectTimeout: timeoutMs });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!isWardrobeCatalog(data)) throw new Error('星相衣橱目录格式错误');
    return normalizeWardrobeCatalog(data, url);
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!isWardrobeCatalog(data)) throw new Error('星相衣橱目录格式错误');
    return normalizeWardrobeCatalog(data, url);
  } finally { window.clearTimeout(timer); }
}

function mergeCatalog(remote: WardrobeCatalog | null): WardrobeCatalog {
  const merged = new Map(WARDROBE_ITEMS.map(item => [item.id, item]));
  for (const item of remote?.items || []) {
    const bundled = merged.get(item.id);
    if (!bundled || item.version > bundled.version) merged.set(item.id, item);
  }
  const catalog = {
    version: Math.max(1, remote?.version || 1),
    updatedAt: remote?.updatedAt || '2026-09-16T00:00:00.000Z',
    items: [...merged.values()],
  };
  registerWardrobeItems(catalog.items);
  return catalog;
}

export async function loadWardrobeCatalog(): Promise<WardrobeCatalog> {
  let remote: WardrobeCatalog | null = null;
  try {
    remote = await fetchCatalog(WARDROBE_CATALOG_URL, 6000);
  } catch {
    try { remote = await fetchCatalog(WARDROBE_CATALOG_FALLBACK_URL, 6000); }
    catch {
      try {
        const cached: unknown = JSON.parse(localStorage.getItem(WARDROBE_CATALOG_CACHE_KEY) || 'null');
        if (isWardrobeCatalog(cached)) remote = cached;
      } catch { /* use bundled catalog */ }
    }
  }
  if (remote) localStorage.setItem(WARDROBE_CATALOG_CACHE_KEY, JSON.stringify(remote));
  return mergeCatalog(remote);
}
