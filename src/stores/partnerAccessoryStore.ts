import { create } from 'zustand';
import { emit } from '@tauri-apps/api/event';
import { dualLoad } from '../lib/persist';
import { commitLocalSnapshots, PARTNER_JOURNAL_KEY, recoverPartnerTransaction, withPartnerReadLock, withPartnerTransactionLock } from '../lib/partnerTransactions';
import { BUILTIN_ACCESSORY_CATALOG, defaultAccessorySnapshot, loadAccessoryCatalog, PARTNER_ACCESSORY_KEY, PARTNER_ACCESSORY_SQLITE_KEY, supportedAccessory, validateAccessorySnapshot } from '../data/partnerAccessories';
import type { PartnerAccessoryCatalog, PartnerAccessorySlot, PartnerAccessorySnapshot } from '../types/partnerAccessory';
import { usePetStore } from './petStore';
import { recoverEquipmentTransaction } from '../lib/equipmentTransactions';
type Result = { ok: boolean; message: string };
interface State {
  loaded: boolean; busy: boolean; error: string; snapshot: PartnerAccessorySnapshot; catalog: PartnerAccessoryCatalog;
  load: () => Promise<void>; refresh: () => void;
  purchase: (id: string, expectedPrice: number) => Promise<Result>;
  equip: (petId: string, slot: PartnerAccessorySlot, id: string | null) => Promise<Result>;
}
const parse = (raw: string | null) => { const s = raw ? JSON.parse(raw) : defaultAccessorySnapshot(); if (!validateAccessorySnapshot(s)) throw new Error('配饰存档异常，请保留备份后重试'); return s; };
function save(snapshot: PartnerAccessorySnapshot, pet?: any) {
  const after: Record<string, string> = { [PARTNER_ACCESSORY_KEY]: JSON.stringify(snapshot) };
  const mirrors = { [PARTNER_ACCESSORY_KEY]: PARTNER_ACCESSORY_SQLITE_KEY, ...(pet ? { csp_pet_data: 'pet_data' } : {}) };
  if (pet) after.csp_pet_data = JSON.stringify(pet);
  return validateAccessorySnapshot(snapshot) && commitLocalSnapshots(after, mirrors);
}
let loading: Promise<void> | null = null;
export const usePartnerAccessoryStore = create<State>((set, get) => ({
  loaded: false, busy: false, error: '', snapshot: defaultAccessorySnapshot(), catalog: BUILTIN_ACCESSORY_CATALOG,
  refresh: () => {
    try { if (!localStorage.getItem(PARTNER_JOURNAL_KEY)) set({ snapshot: parse(localStorage.getItem(PARTNER_ACCESSORY_KEY)), loaded: true, error: '' }); }
    catch (e) { set({ error: String(e) }); }
  },
  load: async () => {
    if (loading) return loading;
    loading = (async () => {
      try {
        await withPartnerReadLock(async () => {
          recoverPartnerTransaction();
          const selected = await dualLoad(PARTNER_ACCESSORY_SQLITE_KEY, PARTNER_ACCESSORY_KEY);
          const raw = localStorage.getItem(PARTNER_ACCESSORY_KEY) || selected;
          const snapshot = parse(raw);
          if (raw) localStorage.setItem(PARTNER_ACCESSORY_KEY, raw);
          set({ snapshot, loaded: true, error: '' });
        });
        set({ catalog: await loadAccessoryCatalog() });
      } catch (e) { set({ error: e instanceof Error ? e.message : '配饰资料恢复失败' }); }
    })();
    try { await loading; } finally { loading = null; }
  },
  purchase: async (id, expectedPrice) => {
    if (get().busy || !get().loaded) return { ok: false, message: '配饰资料正在恢复，请稍后重试' };
    set({ busy: true });
    try { return await withPartnerTransactionLock(() => {
      recoverPartnerTransaction(); recoverEquipmentTransaction();
      const item = get().catalog.items.find(i => i.id === id);
      if (!item || !supportedAccessory(item) || get().catalog.minRendererVersion > 1) throw new Error('此配饰需要更新应用后使用');
      const snapshot = parse(localStorage.getItem(PARTNER_ACCESSORY_KEY));
      if (snapshot.ownedIds.includes(id)) { set({ snapshot }); return { ok: true, message: '已永久拥有，无需重复购买' }; }
      if (item.price !== expectedPrice) throw new Error('价格已更新，请重新确认购买');
      const raw = localStorage.getItem('csp_pet_data');
      const pet = raw ? JSON.parse(raw) : null;
      if (!pet || !Array.isArray(pet.ownedPets) || !Number.isSafeInteger(pet.coins) || pet.coins < 0) throw new Error('金币资料异常，请重新打开智子面板');
      if (pet.coins < item.price) throw new Error('金币不足，再完成一些练习吧');
      const savedAt = new Date().toISOString();
      const next = { ...snapshot, ownedIds: [...snapshot.ownedIds, id], savedAt };
      const nextPet = { ...pet, coins: pet.coins - item.price, savedAt };
      if (!save(next, item.price ? nextPet : undefined)) throw new Error('保存失败，未扣除金币，请重试');
      set({ snapshot: next, error: '' });
      if (item.price) { usePetStore.setState({ coins: nextPet.coins, ownedPets: nextPet.ownedPets }); emit('pet-data-sync', nextPet).catch(() => {}); }
      emit('partner-accessories-sync').catch(() => {});
      return { ok: true, message: '已永久收藏，可为每位智子独立搭配' };
    }); } catch (e) { const message = e instanceof Error ? e.message : '购买失败'; set({ error: message }); return { ok: false, message }; }
    finally { set({ busy: false }); }
  },
  equip: async (petId, slot, id) => {
    if (get().busy || !get().loaded) return { ok: false, message: '请等待配饰资料恢复' };
    set({ busy: true });
    try { return await withPartnerTransactionLock(() => {
      recoverPartnerTransaction(); recoverEquipmentTransaction();
      if (!['halo', 'orbit', 'trail'].includes(slot)) throw new Error('配饰位置无效');
      const pets = JSON.parse(localStorage.getItem('csp_pet_data') || '{}').ownedPets;
      if (!Array.isArray(pets) || !pets.some(p => p.petId === petId)) throw new Error('这位智子已不在收藏中');
      const snapshot = parse(localStorage.getItem(PARTNER_ACCESSORY_KEY));
      const item = get().catalog.items.find(i => i.id === id);
      if (id && (!snapshot.ownedIds.includes(id) || !item || item.slot !== slot || !supportedAccessory(item))) throw new Error('请先收藏兼容的配饰');
      const loadout = { ...snapshot.equippedByPet[petId] }; if (id) loadout[slot] = id; else delete loadout[slot];
      const next = { ...snapshot, equippedByPet: { ...snapshot.equippedByPet, [petId]: loadout }, savedAt: new Date().toISOString() };
      if (!save(next)) throw new Error('配饰未能保存，请重试');
      set({ snapshot: next, error: '' }); emit('partner-accessories-sync').catch(() => {});
      return { ok: true, message: id ? '已装备' : '已卸下' };
    }); } catch (e) { const message = e instanceof Error ? e.message : '装备失败'; set({ error: message }); return { ok: false, message }; }
    finally { set({ busy: false }); }
  },
}));
