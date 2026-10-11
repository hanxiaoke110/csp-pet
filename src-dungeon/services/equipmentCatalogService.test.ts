import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEquipmentCatalog, loadEquipmentCatalog } from './equipmentCatalogService';
import { BUNDLED_EQUIPMENT, TRIAL_EQUIPMENT } from '../data/explorationItems';
const item = BUNDLED_EQUIPMENT['fire-weapon-epic'];
beforeEach(() => {
  const data = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  Object.assign(TRIAL_EQUIPMENT, BUNDLED_EQUIPMENT);
});
describe('静态装备目录', () => {
  it('拒绝未知效果、重复ID、越界价格、身份变更和不可信图片', () => {
    for (const overrides of [{ combatEffects: { runScript: 1 } }, { combatEffects: JSON.parse('{"__proto__":0}') }, { combatEffects: { constructor: 0 } }, { price: 99999 }, { element: 'water' }, { icon: 'https://example.com/a.webp' }, { combatEffects: { comboThreeLimit: 1.5 } }]) {
      expect(() => validateEquipmentCatalog({ version: 1, items: [{ ...item, ...overrides }] })).toThrow();
    }
    expect(() => validateEquipmentCatalog({ version: 1, items: [item, item] })).toThrow();
  });
  it('在线价格可更新，但不会修改已拥有装备的历史购买金额', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 1, items: [{ ...item, price: 400 }] }) }));
    await loadEquipmentCatalog(true);
    expect(TRIAL_EQUIPMENT[item.id].price).toBe(400);
    expect(BUNDLED_EQUIPMENT[item.id].price).toBe(380);
  });
  it('网络断开、HTML响应、空在线目录都保留内置装备', async () => {
    for (const response of [{ ok: false }, { ok: true, json: async () => { throw new Error('Unexpected token <'); } }, { ok: true, json: async () => ({ version: 1, items: [] }) }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await loadEquipmentCatalog(true);
      expect(TRIAL_EQUIPMENT[item.id]).toBeDefined();
      expect(TRIAL_EQUIPMENT['xuanwu-hammer-common']).toBeDefined();
    }
  });
});
