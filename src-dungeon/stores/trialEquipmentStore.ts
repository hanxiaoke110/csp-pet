import { create } from 'zustand';
import type { AcquisitionSource, OwnedTrialItem } from '../types/exploration';
import { TRIAL_EQUIPMENT } from '../data/explorationItems';
import { getUpgradeCost } from '../data/equipmentCatalog';
import { usePetStore } from '../../src/stores/petStore';
import { commitEquipmentTransaction, recoverEquipmentTransaction } from '../../src/lib/equipmentTransactions';

const STORAGE_KEY = 'csp_trial_equipment_v1';

interface TrialEquipmentState {
  ownedItems: OwnedTrialItem[];
  equippedWeaponId: string | null;
  equippedArmorId: string | null;
  equippedArtifactId: string | null;
  soulFragments: number;
  materials: Record<string, number>;
  materialClaims: string[];
  claimExplorationMaterials: (mapId: string, rewards: Array<{ materialId: string; amount: number }>) => boolean;
  load: () => void;
  grantItem: (definitionId: string, source?: AcquisitionSource) => { duplicate: boolean; soulGained: number };
  buyItem: (definitionId: string) => { ok: boolean; reason?: string };
  upgradeItem: (ownedItemId: string) => { ok: boolean; reason?: string };
  dismantleItem: (ownedItemId: string) => { ok: boolean; refundedCoins: number; reason?: string };
  grantMaterial: (materialId: string, amount: number) => void;
  unequipItem: (ownedItemId: string) => void;
  consumeItem: (ownedItemId: string) => boolean;
  equipItem: (ownedItemId: string) => void;
  equipWeapon: (ownedItemId: string) => void;
}

function normalizeOwnedItems(value: unknown): OwnedTrialItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<OwnedTrialItem>;
    if (typeof candidate.id !== 'string' || typeof candidate.definitionId !== 'string') return [];
    return [{
      id: candidate.id,
      definitionId: candidate.definitionId,
      acquiredAt: Number.isFinite(Number(candidate.acquiredAt)) ? Number(candidate.acquiredAt) : Date.now(),
      quantity: Math.max(1, safeAmount(candidate.quantity)),
      upgradeLevel: Math.min(5, safeAmount(candidate.upgradeLevel)),
      purchasePrice: safeAmount(candidate.purchasePrice),
      investedCoins: safeAmount(candidate.investedCoins),
      acquisitionSource: ['legacy', 'shop', 'exploration', 'reward'].includes(candidate.acquisitionSource || '') ? candidate.acquisitionSource! : 'legacy',
    }];
  });
}

function validEquippedId(value: unknown, ownedItems: OwnedTrialItem[], category: 'weapon' | 'armor' | 'artifact'): string | null {
  if (typeof value !== 'string') return null;
  const owned = ownedItems.find(item => item.id === value);
  return owned && TRIAL_EQUIPMENT[owned.definitionId]?.category === category ? value : null;
}

function safeAmount(value: unknown): number { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0; }
function syncWallet(coins: number): void {
  usePetStore.setState({ coins, maxCoinBalance: Math.max(usePetStore.getState().maxCoinBalance, coins) });
  usePetStore.getState().save();
}
function snapshot(state: TrialEquipmentState) {
  return { schemaVersion: 2, ownedItems: state.ownedItems, equippedWeaponId: state.equippedWeaponId, equippedArmorId: state.equippedArmorId, equippedArtifactId: state.equippedArtifactId, soulFragments: state.soulFragments, materials: state.materials, materialClaims: state.materialClaims };
}
function persist(state: TrialEquipmentState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(state))); } catch { /* non-purchase progress remains available in memory */ }
}

export const useTrialEquipmentStore = create<TrialEquipmentState>((set, get) => ({
  ownedItems: [],
  equippedWeaponId: null,
  equippedArmorId: null,
  equippedArtifactId: null,
  soulFragments: 0,
  materials: {},
  materialClaims: [],
  claimExplorationMaterials: (mapId, rewards) => {
    if (!mapId || get().materialClaims.includes(mapId) || !rewards.length) return false;
    const materials = { ...get().materials };
    for (const reward of rewards) {
      if (!/^(earth|fire|wind|water|light)-crystal$/.test(reward.materialId) || !Number.isSafeInteger(reward.amount) || reward.amount <= 0) return false;
      materials[reward.materialId] = (materials[reward.materialId] || 0) + reward.amount;
      if (!Number.isSafeInteger(materials[reward.materialId])) return false;
    }
    const materialClaims = [...get().materialClaims, mapId];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot({ ...get(), materials, materialClaims })));
      set({ materials, materialClaims });
      return true;
    } catch { return false; }
  },
  load: () => {
    try {
      recoverEquipmentTransaction();
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (parsed && Array.isArray(parsed.ownedItems)) {
        const ownedItems = normalizeOwnedItems(parsed.ownedItems);
        set({
          ownedItems,
          equippedWeaponId: validEquippedId(parsed.equippedWeaponId, ownedItems, 'weapon'),
          equippedArmorId: validEquippedId(parsed.equippedArmorId, ownedItems, 'armor'),
          equippedArtifactId: validEquippedId(parsed.equippedArtifactId, ownedItems, 'artifact'),
          soulFragments: safeAmount(parsed.soulFragments),
          materialClaims: Array.isArray(parsed.materialClaims) ? parsed.materialClaims.filter((id: unknown) => typeof id === 'string') : [],
          materials: Object.fromEntries(Object.entries(parsed.materials || {}).filter(([key]) => /^(earth|fire|wind|water|light)-crystal$/.test(key)).map(([key, value]) => [key, safeAmount(value)])),
        });
        persist(get());
      }
    } catch { /* keep safe defaults */ }
  },
  grantItem: (definitionId, source = 'exploration') => {
    const definition = TRIAL_EQUIPMENT[definitionId];
    if (!definition) return { duplicate: false, soulGained: 0 };
    const currentOwnedItems = normalizeOwnedItems(get().ownedItems);
    const existing = currentOwnedItems.find(item => item.definitionId === definitionId);
    if (existing && definition.category !== 'consumable') {
      const soulGained = { common: 2, rare: 5, epic: 12, legendary: 25 }[definition.rarity];
      const next = { ...get(), soulFragments: get().soulFragments + soulGained };
      set({ soulFragments: next.soulFragments });
      persist(next);
      return { duplicate: true, soulGained };
    }
    const ownedItems = existing
      ? currentOwnedItems.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...currentOwnedItems, { id: `${definitionId}-${Date.now()}`, definitionId, acquiredAt: Date.now(), quantity: 1, upgradeLevel: 0, purchasePrice: 0, investedCoins: 0, acquisitionSource: source }];
    const acquiredId = ownedItems.find(item => item.definitionId === definitionId)?.id || null;
    const equippedWeaponId = definition.category === 'weapon' && !get().equippedWeaponId ? acquiredId : get().equippedWeaponId;
    const equippedArmorId = definition.category === 'armor' && !get().equippedArmorId ? acquiredId : get().equippedArmorId;
    const equippedArtifactId = definition.category === 'artifact' && !get().equippedArtifactId ? acquiredId : get().equippedArtifactId;
    const next = { ...get(), ownedItems, equippedWeaponId, equippedArmorId, equippedArtifactId };
    set({ ownedItems, equippedWeaponId, equippedArmorId, equippedArtifactId });
    persist(next);
    return { duplicate: false, soulGained: 0 };
  },
  consumeItem: (ownedItemId) => {
    const owned = get().ownedItems.find(item => item.id === ownedItemId);
    if (!owned || TRIAL_EQUIPMENT[owned.definitionId]?.category !== 'consumable') return false;
    const ownedItems = owned.quantity > 1
      ? get().ownedItems.map(item => item.id === ownedItemId ? { ...item, quantity: item.quantity - 1 } : item)
      : get().ownedItems.filter(item => item.id !== ownedItemId);
    const next = { ...get(), ownedItems };
    set({ ownedItems });
    persist(next);
    return true;
  },
  equipItem: (ownedItemId) => {
    const owned = get().ownedItems.find(item => item.id === ownedItemId);
    const category = owned ? TRIAL_EQUIPMENT[owned.definitionId]?.category : undefined;
    if (!owned || (category !== 'weapon' && category !== 'armor' && category !== 'artifact')) return;
    const update = category === 'weapon'
      ? { equippedWeaponId: ownedItemId }
      : category === 'armor'
        ? { equippedArmorId: ownedItemId }
        : { equippedArtifactId: ownedItemId };
    const next = { ...get(), ...update };
    set(update);
    persist(next);
  },
  equipWeapon: (ownedItemId) => get().equipItem(ownedItemId),
  unequipItem: (ownedItemId) => {
    const next = { ...get(),
      equippedWeaponId: get().equippedWeaponId === ownedItemId ? null : get().equippedWeaponId,
      equippedArmorId: get().equippedArmorId === ownedItemId ? null : get().equippedArmorId,
      equippedArtifactId: get().equippedArtifactId === ownedItemId ? null : get().equippedArtifactId,
    };
    set(next); persist(next);
  },
  grantMaterial: (materialId, amount) => {
    if (!/^(earth|fire|wind|water|light)-crystal$/.test(materialId) || !Number.isSafeInteger(amount) || amount <= 0) return;
    const materials = { ...get().materials, [materialId]: safeAmount(get().materials[materialId]) + amount };
    if (!Number.isSafeInteger(materials[materialId])) return;
    const next = { ...get(), materials }; set({ materials }); persist(next);
  },
  buyItem: (definitionId) => {
    const definition = TRIAL_EQUIPMENT[definitionId];
    if (!definition?.shopAvailable || !Number.isSafeInteger(definition.price) || !definition.price || definition.price < 0) return { ok: false, reason: '这件装备暂不可购买' };
    if (get().ownedItems.some(item => item.definitionId === definitionId)) return { ok: false, reason: '已拥有这件装备，请在我的装备查看' };
    const wallet = usePetStore.getState();
    if (wallet.coins < definition.price) return { ok: false, reason: '金币不足' };
    const item: OwnedTrialItem = { id: crypto.randomUUID(), definitionId, acquiredAt: Date.now(), quantity: 1, upgradeLevel: 0, purchasePrice: definition.price, investedCoins: 0, acquisitionSource: 'shop' };
    const next = { ...get(), ownedItems: [...get().ownedItems, item] };
    wallet.save();
    if (!commitEquipmentTransaction(snapshot(next), wallet.coins - definition.price)) return { ok: false, reason: '保存失败，金币未扣除' };
    set({ ownedItems: next.ownedItems });
    syncWallet(wallet.coins - definition.price);
    return { ok: true };
  },
  upgradeItem: (ownedItemId) => {
    const item = get().ownedItems.find(i => i.id === ownedItemId);
    const definition = item && TRIAL_EQUIPMENT[item.definitionId];
    const cost = definition && getUpgradeCost(definition, item?.upgradeLevel || 0);
    if (!item || !cost) return { ok: false, reason: '已满级或无法升级' };
    const wallet = usePetStore.getState();
    if (wallet.coins < cost.coins) return { ok: false, reason: '金币不足' };
    if ((get().materials[cost.materialId] || 0) < cost.materials) return { ok: false, reason: '探索晶石不足，请到迷雾探索获取' };
    const ownedItems = get().ownedItems.map(i => i.id === ownedItemId ? { ...i, upgradeLevel: (i.upgradeLevel || 0) + 1, investedCoins: (i.investedCoins || 0) + cost.coins } : i);
    const materials = { ...get().materials, [cost.materialId]: get().materials[cost.materialId] - cost.materials };
    const next = { ...get(), ownedItems, materials };
    wallet.save();
    if (!commitEquipmentTransaction(snapshot(next), wallet.coins - cost.coins)) return { ok: false, reason: '保存失败，金币和材料未扣除' };
    set({ ownedItems, materials }); syncWallet(wallet.coins - cost.coins);
    return { ok: true };
  },
  dismantleItem: (ownedItemId) => {
    const item = get().ownedItems.find(i => i.id === ownedItemId);
    if (!item || !['weapon', 'armor'].includes(TRIAL_EQUIPMENT[item.definitionId]?.category)) return { ok: false, refundedCoins: 0, reason: '这件物品无法分解' };
    if ([get().equippedWeaponId, get().equippedArmorId].includes(ownedItemId)) return { ok: false, refundedCoins: 0, reason: '请先卸下装备' };
    const refundedCoins = Math.floor(((item.purchasePrice || 0) + (item.investedCoins || 0)) * .8);
    const wallet = usePetStore.getState();
    const ownedItems = get().ownedItems.filter(i => i.id !== ownedItemId);
    wallet.save();
    if (!commitEquipmentTransaction(snapshot({ ...get(), ownedItems }), wallet.coins + refundedCoins)) return { ok: false, refundedCoins: 0, reason: '保存失败，装备未分解' };
    set({ ownedItems }); syncWallet(wallet.coins + refundedCoins);
    return { ok: true, refundedCoins };
  },
}));
