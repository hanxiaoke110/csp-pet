import { describe, expect, it } from 'vitest';
import { BUILTIN_ACCESSORY_CATALOG, defaultAccessorySnapshot, equippedPartnerAccessories, supportedAccessory, validateAccessoryCatalog, validateAccessorySnapshot } from './partnerAccessories';
describe('partner accessory catalog boundary', () => {
  it('ships six bounded cosmetics and one permanent free gift', () => {
    expect(validateAccessoryCatalog(BUILTIN_ACCESSORY_CATALOG)).toBe(true);
    expect(BUILTIN_ACCESSORY_CATALOG.items.map(i => [i.id, i.price])).toEqual([['halo-clear', 0], ['halo-prism', 240], ['orbit-stars', 120], ['orbit-lantern', 180], ['trail-comet', 300], ['trail-pixel', 360]]);
    expect(BUILTIN_ACCESSORY_CATALOG.items.every(supportedAccessory)).toBe(true);
    expect(defaultAccessorySnapshot().ownedIds).toEqual(['halo-clear']);
  });
  it.each([{ price: -1 }, { price: NaN }, { price: '240' }, { minRendererVersion: 0 }, { name: 'x'.repeat(41) }])('rejects unsafe metadata %j', edit => {
    const c = structuredClone(BUILTIN_ACCESSORY_CATALOG); Object.assign(c.items[0], edit); expect(validateAccessoryCatalog(c)).toBe(false);
  });
  it.each([{ count: 9 }, { count: -1 }, { durationMs: 299 }, { durationMs: 20001 }, { color: 'url(https://bad)' }, { size: 0 }, { size: 1.5 }, { size: NaN }, { svg: '<svg onload=alert(1) />' }])('rejects unbounded or executable visuals %j', edit => {
    const c = structuredClone(BUILTIN_ACCESSORY_CATALOG); Object.assign(c.items[0].visual, edit); expect(validateAccessoryCatalog(c)).toBe(false);
  });
  it('accepts bounded optional online size without changing old catalogs', () => {
    const c = structuredClone(BUILTIN_ACCESSORY_CATALOG); c.items[2].visual.size = 1.2;
    expect(validateAccessoryCatalog(c)).toBe(true);
    expect(validateAccessoryCatalog(BUILTIN_ACCESSORY_CATALOG)).toBe(true);
  });
  it('retains future metadata but never renders unsupported items', () => {
    const c = structuredClone(BUILTIN_ACCESSORY_CATALOG); c.items[0].minRendererVersion = 2; expect(validateAccessoryCatalog(c)).toBe(true); expect(supportedAccessory(c.items[0])).toBe(false);
    c.items[1].visual.primitive = 'remote-svg' as any; expect(supportedAccessory(c.items[1])).toBe(false);
    c.items[2].slot = 'halo'; expect(supportedAccessory(c.items[2])).toBe(false);
  });
  it('rejects duplicate IDs, non-owned equipment and invalid save clocks', () => {
    const c = structuredClone(BUILTIN_ACCESSORY_CATALOG); c.items.push(c.items[0]); expect(validateAccessoryCatalog(c)).toBe(false);
    expect(validateAccessorySnapshot({ ...defaultAccessorySnapshot(), equippedByPet: { a: { halo: 'halo-prism' } } })).toBe(false);
    expect(validateAccessorySnapshot({ ...defaultAccessorySnapshot(), savedAt: 'bad' })).toBe(false);
  });
  it('only passes correctly slotted, owned and supported instance equipment into battle', () => {
    const snapshot = { ...defaultAccessorySnapshot(), ownedIds: ['halo-clear', 'orbit-stars'], equippedByPet: { one: { halo: 'halo-clear', orbit: 'orbit-stars', trail: 'halo-clear' }, two: { halo: 'halo-prism' } } };
    expect(equippedPartnerAccessories(BUILTIN_ACCESSORY_CATALOG, snapshot, 'one').map(i => i.id)).toEqual(['halo-clear', 'orbit-stars']);
    expect(equippedPartnerAccessories(BUILTIN_ACCESSORY_CATALOG, snapshot, 'two')).toEqual([]);
    expect(equippedPartnerAccessories({ ...BUILTIN_ACCESSORY_CATALOG, minRendererVersion: 2 }, snapshot, 'one')).toEqual([]);
  });
});
