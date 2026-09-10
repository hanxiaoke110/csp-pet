import { create } from 'zustand';
import type { OwnedTrialItem } from '../types/exploration';
import { TRIAL_EQUIPMENT } from '../data/explorationItems';

const STORAGE_KEY = 'csp_trial_equipment_v1';

interface TrialEquipmentState {
  ownedItems: OwnedTrialItem[];
  equippedWeaponId: string | null;
  equippedArmorId: string | null;
  equippedArtifactId: string | null;
  soulFragments: number;
  load: () => void;
  grantItem: (definitionId: string) => { duplicate: boolean; soulGained: number };
  consumeItem: (ownedItemId: string) => boolean;
  equipItem: (ownedItemId: string) => void;
  equipWeapon: (ownedItemId: string) => void;
}

function persist(state: Pick<TrialEquipmentState, 'ownedItems' | 'equippedWeaponId' | 'equippedArmorId' | 'equippedArtifactId' | 'soulFragments'>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* independent optional storage */ }
}

export const useTrialEquipmentStore = create<TrialEquipmentState>((set, get) => ({
  ownedItems: [],
  equippedWeaponId: null,
  equippedArmorId: null,
  equippedArtifactId: null,
  soulFragments: 0,
  load: () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (parsed && Array.isArray(parsed.ownedItems)) {
        set({
          ownedItems: parsed.ownedItems,
          equippedWeaponId: typeof parsed.equippedWeaponId === 'string' ? parsed.equippedWeaponId : null,
          equippedArmorId: typeof parsed.equippedArmorId === 'string' ? parsed.equippedArmorId : null,
          equippedArtifactId: typeof parsed.equippedArtifactId === 'string' ? parsed.equippedArtifactId : null,
          soulFragments: Math.max(0, Number(parsed.soulFragments) || 0),
        });
      }
    } catch { /* keep safe defaults */ }
  },
  grantItem: (definitionId) => {
    const definition = TRIAL_EQUIPMENT[definitionId];
    if (!definition) return { duplicate: false, soulGained: 0 };
    const existing = get().ownedItems.find(item => item.definitionId === definitionId);
    if (existing && definition.category !== 'consumable') {
      const soulGained = { common: 2, rare: 5, epic: 12, legendary: 25 }[definition.rarity];
      const next = { ...get(), soulFragments: get().soulFragments + soulGained };
      set({ soulFragments: next.soulFragments });
      persist(next);
      return { duplicate: true, soulGained };
    }
    const ownedItems = existing
      ? get().ownedItems.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...get().ownedItems, { id: `${definitionId}-${Date.now()}`, definitionId, acquiredAt: Date.now(), quantity: 1 }];
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
}));
