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
  it.each(BUILTIN_ACCESSORY_CATALOG.items.slice(6))('$name is charged once and keeps its correct slot on reload', async item => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const store = usePartnerAccessoryStore.getState();
    expect((await store.purchase(item.id, item.price)).ok).toBe(true);
    expect((await store.purchase(item.id, item.price)).ok).toBe(true);
    expect((await store.equip('one', item.slot, item.id)).ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(1000 - item.price);
    usePartnerAccessoryStore.setState({ loaded: false, snapshot: defaultAccessorySnapshot() });
    await usePartnerAccessoryStore.getState().load();
    const snapshot = usePartnerAccessoryStore.getState().snapshot;
    expect(snapshot.ownedIds).toContain(item.id);
    expect(snapshot.equippedByPet.one[item.slot]).toBe(item.id);
    expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(1000 - item.price);
  });
  it('finishes local hydration with cached art while the optional online request never resolves', async () => {
    const catalog = { ...structuredClone(BUILTIN_ACCESSORY_CATALOG), version: 2 };
    catalog.items[1].price = 241;
    localStorage.setItem('csp_partner_accessory_catalog_cache_v1', JSON.stringify(catalog));
    const saved = { ...defaultAccessorySnapshot(), equippedByPet: { one: { halo: 'halo-clear' } } };
    localStorage.setItem(PARTNER_ACCESSORY_KEY, JSON.stringify(saved));
    const fetcher = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal('fetch', fetcher);
    usePartnerAccessoryStore.setState({ loaded: false });
    await usePartnerAccessoryStore.getState().load();
    expect(usePartnerAccessoryStore.getState().loaded).toBe(true);
    expect(usePartnerAccessoryStore.getState().snapshot).toEqual(saved);
    expect(usePartnerAccessoryStore.getState().catalog.items[1].price).toBe(241);
    expect(fetcher).toHaveBeenCalledOnce();
  }, 300);
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
    usePartnerAccessoryStore.getState().catalog.items[1].minRendererVersion = 3;
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

it('keeps a pet’s saved accessories after switching away, switching back and reloading', async () => {
  const one = { petId: 'one', speciesId: 'capi' } as any;
  const two = { petId: 'two', speciesId: 'capi' } as any;
  usePetStore.setState({ loaded: true, ownedPets: [one, two], activePetId: 'one', coins: 1000 });
  await usePartnerAccessoryStore.getState().equip('one', 'halo', 'halo-clear');
  const saved = JSON.parse(localStorage.getItem(PARTNER_ACCESSORY_KEY)!);
  expect(usePetStore.getState().setActivePet('two')).toBe(true);
  expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet.one).toEqual({ halo: 'halo-clear' });
  expect(usePetStore.getState().setActivePet('one')).toBe(true);
  usePartnerAccessoryStore.setState({ loaded: false, snapshot: defaultAccessorySnapshot() });
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  await usePartnerAccessoryStore.getState().load();
  expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet.one).toEqual(saved.equippedByPet.one);
  expect(usePetStore.getState().coins).toBe(1000);
});

it('copies an owned loadout once, persists it, and keeps both pets independently editable without a charge', async () => {
  await usePartnerAccessoryStore.getState().equip('one', 'halo', 'halo-clear');
  const beforePet = localStorage.getItem('csp_pet_data');
  expect((await usePartnerAccessoryStore.getState().copyFromPet('one', 'two')).ok).toBe(true);
  expect(JSON.parse(localStorage.getItem(PARTNER_ACCESSORY_KEY)!).equippedByPet).toEqual({ one: { halo: 'halo-clear' }, two: { halo: 'halo-clear' } });
  expect(localStorage.getItem('csp_pet_data')).toBe(beforePet);
  await usePartnerAccessoryStore.getState().equip('two', 'halo', null);
  expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet.one).toEqual({ halo: 'halo-clear' });
  expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet.two).toEqual({});
});

it('rereads saved loadouts under the lock and refuses to overwrite a newer target or use a missing source', async () => {
  await usePartnerAccessoryStore.getState().equip('one', 'halo', 'halo-clear');
  const saved = JSON.parse(localStorage.getItem(PARTNER_ACCESSORY_KEY)!);
  saved.equippedByPet.two = { halo: 'halo-clear' };
  localStorage.setItem(PARTNER_ACCESSORY_KEY, JSON.stringify(saved));
  const before = localStorage.getItem(PARTNER_ACCESSORY_KEY);
  expect((await usePartnerAccessoryStore.getState().copyFromPet('one', 'two')).ok).toBe(false);
  expect(localStorage.getItem(PARTNER_ACCESSORY_KEY)).toBe(before);
  expect((await usePartnerAccessoryStore.getState().copyFromPet('gone', 'two')).ok).toBe(false);
  expect((await usePartnerAccessoryStore.getState().copyFromPet('one', 'one')).ok).toBe(false);
});

it('does not copy unsupported, missing or empty source accessories, and rolls back a failed save', async () => {
  expect((await usePartnerAccessoryStore.getState().copyFromPet('one', 'two')).ok).toBe(false);
  await usePartnerAccessoryStore.getState().equip('one', 'halo', 'halo-clear');
  const catalog = structuredClone(BUILTIN_ACCESSORY_CATALOG);
  catalog.items.find(i => i.id === 'halo-clear')!.minRendererVersion = 3;
  usePartnerAccessoryStore.setState({ catalog });
  expect((await usePartnerAccessoryStore.getState().copyFromPet('one', 'two')).ok).toBe(false);
  usePartnerAccessoryStore.setState({ catalog: structuredClone(BUILTIN_ACCESSORY_CATALOG) });
  const before = localStorage.getItem(PARTNER_ACCESSORY_KEY);
  const original = localStorage.setItem;
  vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => { if (k === PARTNER_ACCESSORY_KEY) throw new Error('disk full'); original(k, v); });
  expect((await usePartnerAccessoryStore.getState().copyFromPet('one', 'two')).ok).toBe(false);
  expect(localStorage.getItem(PARTNER_ACCESSORY_KEY)).toBe(before);
  expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet.two).toBeUndefined();
});
