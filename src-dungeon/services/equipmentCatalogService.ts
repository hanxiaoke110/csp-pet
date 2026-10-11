import { BUNDLED_EQUIPMENT, TRIAL_EQUIPMENT } from '../data/explorationItems';
import { EQUIPMENT_ELEMENTS, EQUIPMENT_RARITIES } from '../data/equipmentCatalog';
import type { TrialEquipmentDefinition } from '../types/exploration';
export { BUNDLED_EQUIPMENT } from '../data/explorationItems';

const URL_ROOT = 'https://cards.cspstudy.top';
const CACHE_KEY = 'csp_equipment_catalog_cache_v1';
const EFFECT_LIMITS: Record<string, number> = {
  initialShieldRatio: .2, correctShieldRatio: .15, correctShieldLimit: 3,
  nextAttackBoost: .15, firstHpHitReduction: .2, shieldedElementBoost: .15,
  comboThreeBoost: .45, comboThreeLimit: 2, lowHpShieldRatio: .2, lowHpHealRatio: .1,
};

export function validateEquipmentCatalog(value: unknown): TrialEquipmentDefinition[] {
  const catalog = value as { version?: number; items?: unknown[] };
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.items) || catalog.items.length > 300) throw new Error('不支持的装备目录');
  const ids = new Set<string>();
  return catalog.items.map(raw => {
    const item = raw as TrialEquipmentDefinition;
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('装备编号异常');
    ids.add(item.id);
    if (!['weapon', 'armor'].includes(item.category) || !EQUIPMENT_ELEMENTS.includes(item.element!) || !EQUIPMENT_RARITIES.includes(item.rarity)) throw new Error('装备分类异常');
    const bundled = BUNDLED_EQUIPMENT[item.id];
    if (bundled && (bundled.category !== item.category || bundled.element !== item.element || bundled.rarity !== item.rarity)) throw new Error('不能改变已存在装备的身份');
    for (const field of ['name', 'description', 'scope'] as const) {
      if (typeof item[field] !== 'string' || !item[field].trim() || item[field].length > 500) throw new Error('装备说明异常');
    }
    if (!Number.isSafeInteger(item.price) || item.price! < 0 || item.price! > 2000 || typeof item.shopAvailable !== 'boolean' || (item.shopAvailable && !item.price)) throw new Error('装备价格异常');
    for (const stat of [item.attack ?? 0, item.defense ?? 0]) if (!Number.isSafeInteger(stat) || stat < 0 || stat > 20) throw new Error('装备属性异常');
    if (typeof item.icon !== 'string') throw new Error('装备图片异常');
    const icon = new URL(item.icon, URL_ROOT);
    if (icon.origin !== URL_ROOT || !/^\/(equipment|dungeon-exploration)\/[a-zA-Z0-9_./-]+\.(webp|png|svg)$/.test(icon.pathname) || icon.search || icon.hash) throw new Error('装备图片须使用受信任静态素材');
    if (item.combatEffects && (typeof item.combatEffects !== 'object' || Array.isArray(item.combatEffects))) throw new Error('装备效果异常');
    for (const [effect, amount] of Object.entries(item.combatEffects || {})) {
      if (!Object.prototype.hasOwnProperty.call(EFFECT_LIMITS, effect) || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > EFFECT_LIMITS[effect] || (effect.endsWith('Limit') && !Number.isSafeInteger(amount))) throw new Error('装备效果超出支持范围');
    }
    // Copy only supported data; remote JSON cannot install code or new effect types.
    return { id: item.id, category: item.category, rarity: item.rarity, element: item.element, name: item.name,
      description: item.description, scope: item.scope, icon: icon.href, price: item.price,
      attack: item.attack || 0, defense: item.defense || 0, shopAvailable: item.shopAvailable,
      combatEffects: { ...item.combatEffects } };
  });
}

function applyCatalog(items: TrialEquipmentDefinition[]): void {
  for (const item of items) TRIAL_EQUIPMENT[item.id] = item;
}
let request: Promise<void> | undefined;
let lastCheckAt = 0;
export function loadEquipmentCatalog(forceRefresh = false): Promise<void> {
  if (request) return request;
  if (!forceRefresh && lastCheckAt && Date.now() - lastCheckAt < 300_000) return Promise.resolve();
  request = (async () => {
    try { applyCatalog(validateEquipmentCatalog(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'))); } catch { /* bundled fallback */ }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${URL_ROOT}/equipment/catalog.json`, { signal: controller.signal });
      if (!response.ok) return;
      const payload = await response.json();
      const items = validateEquipmentCatalog(payload);
      applyCatalog(items);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, items: Object.values(TRIAL_EQUIPMENT).filter(item => ['weapon', 'armor'].includes(item.category) && item.price !== undefined) })); } catch { /* cache is optional */ }
    } catch { /* offline, HTML, or malformed catalog leaves cached/bundled definitions usable */ }
    finally { clearTimeout(timeout); lastCheckAt = Date.now(); }
  })();
  return request.finally(() => { request = undefined; });
}
