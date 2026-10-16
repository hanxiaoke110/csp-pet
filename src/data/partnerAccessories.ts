import type { PartnerAccessory, PartnerAccessoryCatalog, PartnerAccessorySnapshot } from '../types/partnerAccessory';
export const PARTNER_ACCESSORY_KEY = 'csp_partner_accessories_v1';
export const PARTNER_ACCESSORY_SQLITE_KEY = 'partner_accessories';
export const ACCESSORY_RENDERER_VERSION = 1;
const CACHE_KEY = 'csp_partner_accessory_catalog_cache_v1';
const primitives = { halo: ['ring', 'prism'], orbit: ['star', 'lantern'], trail: ['comet', 'pixel'] };
export const PARTNER_ACCESSORIES: PartnerAccessory[] = [
  { id: 'halo-clear', name: '澄明星环', description: '一圈清透星光，送给每一位同行者。', slot: 'halo', price: 0, minRendererVersion: 1, visual: { primitive: 'ring', color: '#64e8ff', accent: '#ffffff', count: 1, durationMs: 6000 } },
  { id: 'halo-prism', name: '棱镜星图', description: '折射青金光芒的精密星轨。', slot: 'halo', price: 240, minRendererVersion: 1, visual: { primitive: 'prism', color: '#6aeaff', accent: '#ffd477', count: 3, durationMs: 8000 } },
  { id: 'orbit-stars', name: '环游星群', description: '三颗小星星，有自己的公转计划。', slot: 'orbit', price: 120, minRendererVersion: 1, visual: { primitive: 'star', color: '#ffe3a0', accent: '#7defff', count: 3, durationMs: 7000 } },
  { id: 'orbit-lantern', name: '暖灯夜航', description: '两盏圆滚滚的灯，照亮下一站。', slot: 'orbit', price: 180, minRendererVersion: 1, visual: { primitive: 'lantern', color: '#ffb98e', accent: '#fff0b0', count: 2, durationMs: 9000 } },
  { id: 'trail-comet', name: '彗星航迹', description: '迈出脚步，留下青金色的流星。', slot: 'trail', price: 300, minRendererVersion: 1, visual: { primitive: 'comet', color: '#6aeaff', accent: '#ffd477', count: 5, durationMs: 900 } },
  { id: 'trail-pixel', name: '像素跃迁', description: '每次出发，点亮几枚像素坐标。', slot: 'trail', price: 360, minRendererVersion: 1, visual: { primitive: 'pixel', color: '#74f6e0', accent: '#e0ff91', count: 6, durationMs: 700 } },
];
export const BUILTIN_ACCESSORY_CATALOG: PartnerAccessoryCatalog = { version: 1, minRendererVersion: 1, items: PARTNER_ACCESSORIES };
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][\w:-]{0,119}$/.test(v);
const integer = (v: unknown, min: number, max: number) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
export function supportedAccessory(item: PartnerAccessory): boolean {
  return item.minRendererVersion <= ACCESSORY_RENDERER_VERSION && primitives[item.slot]?.includes(item.visual.primitive) === true;
}
export function validateAccessoryCatalog(value: unknown): value is PartnerAccessoryCatalog {
  const c = value as PartnerAccessoryCatalog;
  return Boolean(c && integer(c.version, 1, 1e9) && integer(c.minRendererVersion, 1, 1000) && Array.isArray(c.items) && c.items.length <= 100
    && new Set(c.items.map(i => i?.id)).size === c.items.length && c.items.every(i => i && id(i.id)
      && typeof i.name === 'string' && i.name.length > 0 && i.name.length <= 40 && typeof i.description === 'string' && i.description.length <= 240
      && ['halo', 'orbit', 'trail'].includes(i.slot) && integer(i.price, 0, 100000) && integer(i.minRendererVersion, 1, 1000)
      && i.visual && typeof i.visual.primitive === 'string' && i.visual.primitive.length <= 40
      && /^#[\da-f]{6}$/i.test(i.visual.color) && /^#[\da-f]{6}$/i.test(i.visual.accent)
      && integer(i.visual.count, 1, 8) && integer(i.visual.durationMs, 300, 20000)
      && Object.keys(i.visual).every(k => ['primitive', 'color', 'accent', 'count', 'durationMs'].includes(k))));
}
export function defaultAccessorySnapshot(): PartnerAccessorySnapshot {
  return { version: 1, ownedIds: ['halo-clear'], equippedByPet: {}, savedAt: new Date().toISOString() };
}
export function validateAccessorySnapshot(value: unknown): value is PartnerAccessorySnapshot {
  const s = value as PartnerAccessorySnapshot;
  return Boolean(s && s.version === 1 && Array.isArray(s.ownedIds) && s.ownedIds.length <= 10000 && s.ownedIds.every(id)
    && new Set(s.ownedIds).size === s.ownedIds.length && s.equippedByPet && typeof s.equippedByPet === 'object' && !Array.isArray(s.equippedByPet)
    && Object.keys(s.equippedByPet).length <= 10000 && Object.entries(s.equippedByPet).every(([pet, loadout]) => id(pet) && loadout && typeof loadout === 'object' && !Array.isArray(loadout)
      && Object.entries(loadout).every(([slot, item]) => ['halo', 'orbit', 'trail'].includes(slot) && id(item) && s.ownedIds.includes(item)))
    && typeof s.savedAt === 'string' && Number.isFinite(Date.parse(s.savedAt)));
}
export function cachedAccessoryCatalog(): PartnerAccessoryCatalog {
  let fallback = BUILTIN_ACCESSORY_CATALOG;
  try { const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (validateAccessoryCatalog(cached) && cached.minRendererVersion <= 1) fallback = cached; } catch {}
  return fallback;
}
export function equippedPartnerAccessories(catalog: PartnerAccessoryCatalog, snapshot: PartnerAccessorySnapshot, petId: string): PartnerAccessory[] {
  if (catalog.minRendererVersion > ACCESSORY_RENDERER_VERSION) return [];
  return Object.entries(snapshot.equippedByPet[petId] || {}).flatMap(([slot, id]) => {
    const item = catalog.items.find(i => i.id === id && i.slot === slot);
    return item && snapshot.ownedIds.includes(id) && supportedAccessory(item) ? [item] : [];
  });
}
export async function loadAccessoryCatalog(): Promise<PartnerAccessoryCatalog> {
  const fallback = cachedAccessoryCatalog();
  try {
    const response = await fetch('https://cards.cspstudy.top/partner-accessories/catalog.json', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return fallback;
    const raw = await response.text(); if (raw.length > 100000) return fallback;
    const catalog = JSON.parse(raw);
    if (validateAccessoryCatalog(catalog) && catalog.minRendererVersion <= 1 && catalog.version >= fallback.version) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(catalog)); } catch {}
      return catalog;
    }
  } catch {}
  return fallback;
}
