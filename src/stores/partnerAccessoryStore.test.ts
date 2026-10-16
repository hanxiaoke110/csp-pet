import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePartnerAccessoryStore } from './partnerAccessoryStore';
import { BUILTIN_ACCESSORY_CATALOG, defaultAccessorySnapshot, PARTNER_ACCESSORY_KEY } from '../data/partnerAccessories';
import { usePetStore } from './petStore';
import { createTestLockManager } from '../testSupport/webLocks';
import { PARTNER_JOURNAL_KEY } from '../lib/partnerTransactions';
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/sqlite-storage', () => ({ sqliteGet: vi.fn().mockResolvedValue(''), sqliteSetFireAndForget: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: createTestLockManager() });
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
  usePartnerAccessoryStore.setState({ loaded: true, busy: false, error: '', snapshot: defaultAccessorySnapshot(), catalog: structuredClone(BUILTIN_ACCESSORY_CATALOG) });
  localStorage.setItem('csp_pet_data', JSON.stringify({ coins: 1000, ownedPets: [{ petId: 'one', speciesId: 'capi' }, { petId: 'two', speciesId: 'capi' }], foods: { apple: 17 }, activePetId: 'one' }));
});
describe('permanent per-instance accessory ownership', () => {
  it('charges once, keeps latest durable inventory, and equips two instances independently', async () => {
    usePetStore.setState({ coins: 2, ownedPets: [] });
    expect((await usePartnerAccessoryStore.getState().purchase('orbit-stars', 120)).ok).toBe(true);
    expect((await usePartnerAccessoryStore.getState().purchase('orbit-stars', 120)).ok).toBe(true);
    const pet = JSON.parse(localStorage.getItem('csp_pet_data')!); expect(pet.coins).toBe(880); expect(pet.foods).toEqual({ apple: 17 }); expect(pet.ownedPets).toHaveLength(2);
    expect((await usePartnerAccessoryStore.getState().equip('one', 'orbit', 'orbit-stars')).ok).toBe(true);
    expect((await usePartnerAccessoryStore.getState().equip('two', 'halo', 'halo-clear')).ok).toBe(true);
    expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet).toEqual({ one: { orbit: 'orbit-stars' }, two: { halo: 'halo-clear' } });
    await usePartnerAccessoryStore.getState().equip('one', 'orbit', null);
    expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet.two).toEqual({ halo: 'halo-clear' });
    expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(880);
  });
  it('rechecks price and refuses unsupported items, invalid wallet and missing pets', async () => {
    expect((await usePartnerAccessoryStore.getState().purchase('halo-prism', 239)).ok).toBe(false);
    usePartnerAccessoryStore.getState().catalog.items[1].minRendererVersion = 2;
    expect((await usePartnerAccessoryStore.getState().purchase('halo-prism', 240)).ok).toBe(false);
    expect((await usePartnerAccessoryStore.getState().equip('ghost', 'halo', 'halo-clear')).ok).toBe(false);
    expect((await usePartnerAccessoryStore.getState().equip('one', 'orbit', 'halo-clear')).ok).toBe(false);
    localStorage.setItem('csp_pet_data', JSON.stringify({ coins: '1000', ownedPets: [] }));
    expect((await usePartnerAccessoryStore.getState().purchase('orbit-stars', 120)).ok).toBe(false);
  });
  it('refuses insufficient coins and fails closed without a cross-window lock', async () => {
    localStorage.setItem('csp_pet_data', JSON.stringify({ coins: 1, ownedPets: [] }));
    expect((await usePartnerAccessoryStore.getState().purchase('orbit-stars', 120)).ok).toBe(false);
    vi.stubGlobal('navigator', {});
    expect((await usePartnerAccessoryStore.getState().purchase('orbit-stars', 120)).message).toContain('安全交易');
  });
  it('does not publish or charge if inventory persistence fails', async () => {
    const before = localStorage.getItem('csp_pet_data'); const original = localStorage.setItem;
    vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => { if (k === PARTNER_ACCESSORY_KEY) throw new Error('disk full'); return original(k, v); });
    expect((await usePartnerAccessoryStore.getState().purchase('orbit-stars', 120)).ok).toBe(false);
    expect(localStorage.getItem('csp_pet_data')).toBe(before);
    expect(usePartnerAccessoryStore.getState().snapshot.ownedIds).toEqual(['halo-clear']);
    expect(localStorage.getItem(PARTNER_JOURNAL_KEY)).toBe(null);
  });
  it('rereads cross-window ownership and never replays live journals in refresh', async () => {
    const other = { ...defaultAccessorySnapshot(), ownedIds: ['halo-clear', 'orbit-stars'], equippedByPet: { two: { orbit: 'orbit-stars' } } };
    localStorage.setItem(PARTNER_ACCESSORY_KEY, JSON.stringify(other));
    expect((await usePartnerAccessoryStore.getState().equip('one', 'halo', 'halo-clear')).ok).toBe(true);
    expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet.two).toEqual({ orbit: 'orbit-stars' });
    localStorage.setItem(PARTNER_JOURNAL_KEY, 'live'); localStorage.setItem(PARTNER_ACCESSORY_KEY, '{}');
    usePartnerAccessoryStore.getState().refresh(); expect(usePartnerAccessoryStore.getState().snapshot.ownedIds).toContain('orbit-stars');
  });
});
