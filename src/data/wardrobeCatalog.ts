import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { registerWardrobeItems, WARDROBE_ITEMS } from './wardrobe';
import type {
  WardrobeAcquisition,
  WardrobeCatalog,
  WardrobeConditionExpression,
  WardrobeItem,
  WardrobeVisualLayer,
} from '../types/profile';

export const WARDROBE_CATALOG_URL =
  'https://cards.cspstudy.top/wardrobe/catalog.json';
export const WARDROBE_V2_CATALOG_URL =
  'https://cards.cspstudy.top/wardrobe/v2/catalog.json';
export const WARDROBE_CATALOG_FALLBACK_URL =
  'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/wardrobe/catalog.json';
export const WARDROBE_CATALOG_CACHE_KEY = 'csp_wardrobe_catalog_cache_v1';
export const WARDROBE_V2_CATALOG_CACHE_KEY = 'csp_wardrobe_catalog_cache_v2';
export const WARDROBE_RENDERER_VERSION = 2;

const categories = new Set(['avatar', 'frame', 'background', 'pendant', 'effect', 'title']);
const rarities = new Set(['common', 'rare', 'epic', 'legendary', 'mythic']);
const metrics = new Set(['quizCorrect', 'highestPetAffection', 'collectorCardCount', 'mazeClearCount', 'dungeonMazeCoverage', 'achievementCount']);
const primitives = new Set(['image', 'particle', 'orbit', 'light-sweep', 'glow', 'sprite', 'text-effect', 'pointer-parallax', 'click-burst']);
const placements = new Set(['background', 'behind-avatar', 'front', 'title']);
const animations = new Set(['none', 'float', 'spin', 'orbit', 'pulse', 'drift-up', 'drift-down', 'sweep', 'flicker', 'glitch', 'burst']);
const blendModes = new Set(['normal', 'screen', 'color-dodge', 'soft-light']);

function isConditionExpression(value: unknown, depth = 0): value is WardrobeConditionExpression {
  if (!value || typeof value !== 'object' || depth > 3) return false;
  const rule = value as Record<string, unknown>;
  if (rule.type === 'metric') {
    return metrics.has(String(rule.metric))
      && (rule.operator === 'gte' || rule.operator === 'eq')
      && Number.isFinite(rule.value)
      && Number(rule.value) >= 0;
  }
  return (rule.type === 'all' || rule.type === 'any')
    && Array.isArray(rule.rules)
    && rule.rules.length > 0
    && rule.rules.length <= 8
    && rule.rules.every(child => isConditionExpression(child, depth + 1));
}

function isAcquisition(value: unknown): value is WardrobeAcquisition {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  if (a.type === 'free') return true;
  if (a.type === 'coin') return Number.isFinite(a.price) && Number(a.price) > 0;
  return a.type === 'condition'
    && typeof a.description === 'string'
    && a.description.length > 0
    && (a.condition == null || isConditionExpression(a.condition));
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

function isVisualLayer(value: unknown): value is WardrobeVisualLayer {
  if (!value || typeof value !== 'object') return false;
  const layer = value as Record<string, unknown>;
  const numericKeys = ['x', 'y', 'width', 'height', 'opacity', 'rotation', 'durationMs', 'delayMs', 'count', 'size', 'blur', 'parallax'];
  return /^[a-z0-9][a-z0-9-]{0,47}$/.test(String(layer.id || ''))
    && primitives.has(String(layer.primitive))
    && placements.has(String(layer.placement))
    && (layer.asset == null || typeof layer.asset === 'string')
    && (layer.checksum == null || /^[a-f0-9]{64}$/i.test(String(layer.checksum)))
    && (layer.animation == null || animations.has(String(layer.animation)))
    && (layer.blendMode == null || blendModes.has(String(layer.blendMode)))
    && (layer.color == null || /^#[0-9a-f]{6,8}$/i.test(String(layer.color)))
    && (layer.secondaryColor == null || /^#[0-9a-f]{6,8}$/i.test(String(layer.secondaryColor)))
    && numericKeys.every(key => layer[key] == null || Number.isFinite(layer[key]));
}

function isVisual(value: unknown): boolean {
  if (value == null) return true;
  if (!value || typeof value !== 'object') return false;
  const visual = value as Record<string, unknown>;
  const safeZone = visual.safeZone as Record<string, unknown> | undefined;
  return visual.rendererVersion === WARDROBE_RENDERER_VERSION
    && Array.isArray(visual.layers)
    && visual.layers.length <= 24
    && visual.layers.every(isVisualLayer)
    && (safeZone == null || ['x', 'y', 'width', 'height'].every(key => Number.isFinite(safeZone[key])));
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
      && isInteraction(item.interaction)
      && isVisual(item.visual)
      && (item.minRendererVersion == null || (Number.isInteger(item.minRendererVersion) && item.minRendererVersion > 0));
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
    visual: item.visual ? {
      ...item.visual,
      safeZone: item.visual.safeZone ? {
        x: clamp(item.visual.safeZone.x, 0, 100),
        y: clamp(item.visual.safeZone.y, 0, 100),
        width: clamp(item.visual.safeZone.width, 1, 100),
        height: clamp(item.visual.safeZone.height, 1, 100),
      } : undefined,
      layers: item.visual.layers.map(layer => normalizeVisualLayer(layer, sourceUrl)),
    } : undefined,
  })) };
}

function clamp(value: number | undefined, minimum: number, maximum: number, fallback = minimum): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? Number(value) : fallback));
}

function normalizeVisualLayer(layer: WardrobeVisualLayer, sourceUrl: string): WardrobeVisualLayer {
  return {
    ...layer,
    asset: normalizeUrl(layer.asset, sourceUrl),
    thumbnail: normalizeUrl(layer.thumbnail, sourceUrl),
    x: clamp(layer.x, 0, 100, 50),
    y: clamp(layer.y, 0, 100, 50),
    width: clamp(layer.width, 1, 180, 100),
    height: clamp(layer.height, 1, 180, 100),
    opacity: clamp(layer.opacity, 0, 1, 1),
    rotation: clamp(layer.rotation, -360, 360, 0),
    durationMs: clamp(layer.durationMs, 500, 30_000, 4_000),
    delayMs: clamp(layer.delayMs, -30_000, 30_000, 0),
    count: Math.round(clamp(layer.count, 1, 48, 8)),
    size: clamp(layer.size, 1, 80, 8),
    blur: clamp(layer.blur, 0, 30, 0),
    parallax: clamp(layer.parallax, -30, 30, 0),
  };
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
    if ((item.minRendererVersion || 1) > WARDROBE_RENDERER_VERSION) continue;
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

function readCachedCatalog(key: string): WardrobeCatalog | null {
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(key) || 'null');
    return isWardrobeCatalog(cached) ? cached : null;
  } catch { return null; }
}

export async function loadWardrobeCatalog(): Promise<WardrobeCatalog> {
  let remote: WardrobeCatalog | null = null;
  try {
    const v2 = await fetchCatalog(WARDROBE_V2_CATALOG_URL, 6000);
    if (v2.schemaVersion !== 2 || v2.rendererVersion !== WARDROBE_RENDERER_VERSION) throw new Error('星相衣橱 v2 目录版本不兼容');
    remote = v2;
    localStorage.setItem(WARDROBE_V2_CATALOG_CACHE_KEY, JSON.stringify(v2));
  } catch {
    remote = readCachedCatalog(WARDROBE_V2_CATALOG_CACHE_KEY);
    if (!remote) {
      try { remote = await fetchCatalog(WARDROBE_CATALOG_URL, 6000); }
      catch {
        try { remote = await fetchCatalog(WARDROBE_CATALOG_FALLBACK_URL, 6000); }
        catch { remote = readCachedCatalog(WARDROBE_CATALOG_CACHE_KEY); }
      }
    }
  }
  if (remote?.schemaVersion !== 2) localStorage.setItem(WARDROBE_CATALOG_CACHE_KEY, JSON.stringify(remote));
  return mergeCatalog(remote);
}
