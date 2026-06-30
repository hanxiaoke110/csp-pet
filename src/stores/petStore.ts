import { create } from 'zustand';
import { emit } from '@tauri-apps/api/event';
import { dualSave, dualLoad } from '../lib/persist';
import type { OwnedPet } from '../types/pet';
import { STARTER_PETS, getPetConfig, getPetTier, ALL_SHOP_ITEMS, PET_TIERS, PET_BASE_STATS, TIER_MULTIPLIERS } from '../types/pet';
import type { ShopItem } from '../types/pet';
import { calculateStats } from '../../src-dungeon/utils/combatLogic';
import { validatePetName } from '../utils/validateName';
import { useHatchStore } from './hatchStore';

interface PetState {
  activePetId: string | null;
  ownedPets: OwnedPet[];
  coins: number;
  foods: Record<string, number>;
  expPool: number;

  // Pet management
  selectStarter: (speciesId: string, petName: string) => void;
  setActivePet: (petId: string) => boolean;
  getActivePet: () => OwnedPet | null;
  hasStarter: () => boolean;
  buyPet: (speciesId: string, petName: string) => boolean;
  isOwned: (speciesId: string) => boolean;

  // Rename
  renameCards: number;
  addRenameCards: (amount: number) => void;
  buyRenameCard: () => boolean;
  renamePet: (petId: string, newName: string) => string;

  // Gacha
  gachaDailyPulls: number;
  gachaDate: string;
  gachaPity: number;
  _rollGacha: () => { type: 'pet'; item: ShopItem; rarity: string; autoName?: string; pityBreak: boolean } | { type: 'food'; foodType: string } | { type: 'wishTicket' } | { type: 'renameCard' } | null;
  claimHatchedPet: (speciesId: string, petName: string, tier?: string) => boolean;
  doGacha: () => { type: 'pet'; item: ShopItem; rarity: string; pityBreak: boolean } | { type: 'food'; foodType: string } | { type: 'wishTicket' } | { type: 'renameCard' } | null;

  // Inventory
  foodItems: { type: string; count: number }[];
  wishTickets: number;

  // Attributes
  addExp: (petId: string, amount: number) => void;
  addCoins: (amount: number) => void;
  addAffection: (petId: string, amount: number) => void;
  spendCoins: (amount: number) => boolean;
  feedPet: (petId: string, foodId: string) => boolean;
  tickHunger: () => void;
  lastActiveAt: string;
  applyOfflineHunger: () => number;
  dailyHungerConsumed: number;
  hungerDate: string;

  // Pending rewards
  pendingExp: number;
  pendingCoins: number;
  addPendingRewards: (exp: number, coins: number) => void;
  claimPendingRewards: () => void;

  // Training camp
  trainingCampActive: boolean;
  trainingCampEndDate: string;
  activateTrainingCamp: (password: string) => boolean;
  getRewardMultiplier: () => number;
  claimTrainingCampFoods: () => boolean;
  trainingCampFoodsClaimed: string[];

  // Experience pool
  allocateExpFromPool: (petId: string, amount: number) => void;
  addExpToPool: (amount: number) => void;
  canLevelUp: (petId: string) => boolean;
  levelUp: (petId: string) => void;
  ensureBattleStats: (pet: OwnedPet) => OwnedPet;

  // Collection rewards
  checkCollectionRewards: () => void;

  // Persistence
  save: () => void;
  load: () => Promise<void>;
}

export const FOODS: Record<string, { name: string; price: number; hunger: number; icon: string }> = {
  basic:   { name: '普通食物', price: 30,  hunger: 30, icon: '🌾' },
  premium: { name: '营养食物', price: 80,  hunger: 60, icon: '🍪' },
  deluxe:  { name: '豪华食物', price: 150, hunger: 100, icon: '🍖' },
};

// Level milestones
export function getLevelMilestone(level: number): { title: string; pityThreshold: number; dailyPassiveCoins: number } {
  if (level >= 15) return { title: '化神', pityThreshold: 50, dailyPassiveCoins: 5 };
  if (level >= 10) return { title: '元婴', pityThreshold: 100, dailyPassiveCoins: 5 };
  if (level >= 5)  return { title: '金丹', pityThreshold: 100, dailyPassiveCoins: 0 };
  return { title: '筑基', pityThreshold: 100, dailyPassiveCoins: 0 };
}

// Display name with milestone prefix: [金丹] 小企鹅
export function formatPetDisplayName(name: string, level: number): string {
  const title = getLevelMilestone(level).title;
  return `[${title}] ${name}`;
}

// Level badge color by tier
export function getLevelBadgeColor(level: number): string {
  if (level >= 15) return '#f59e0b'; // gold
  if (level >= 10) return '#3b82f6'; // blue
  if (level >= 5)  return '#22c55e'; // green
  return '#94a3b8'; // gray
}

export const usePetStore = create<PetState>((set, get) => ({
  activePetId: null,
  ownedPets: [],
  coins: 200,
  foods: { basic: 3 },
  pendingExp: 0,
  pendingCoins: 0,
  expPool: 0,
  renameCards: 0,
  foodItems: [],
  wishTickets: 0,
  gachaDailyPulls: 0,
  gachaDate: '',
  gachaPity: 0,
  trainingCampActive: false,
  trainingCampEndDate: '',
  trainingCampFoodsClaimed: [],
  lastActiveAt: new Date().toISOString(),
  dailyHungerConsumed: 0,
  hungerDate: '',

  selectStarter: (speciesId, petName) => {
    const species = STARTER_PETS.find(s => s.speciesId === speciesId);
    if (!species) return;
    const pet: OwnedPet = {
      petId: crypto.randomUUID(), petName,
      speciesId: species.speciesId, element: species.element,
      renderType: species.renderType, modelPath: species.modelPath,
      level: 1, exp: 0, expToNext: 100,
      hunger: 100, mood: 80, affection: 50,
      lastFedAt: null, obtainedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set(s => ({ ownedPets: [...s.ownedPets, pet], activePetId: pet.petId }));
    get().save();
  },

  setActivePet: (petId) => {
    set({ activePetId: petId }); get().save();
    return true;
  },

  getActivePet: () => {
    const { ownedPets, activePetId } = get();
    return ownedPets.find(p => p.petId === activePetId) || null;
  },

  hasStarter: () => get().ownedPets.length > 0,

  // Check if a shop speciesId is effectively owned (starters use different speciesIds)
  isOwned: (shopSpeciesId: string) => {
    const config = getPetConfig(shopSpeciesId);
    if (!config) return false;
    // Check owned pets
    if (get().ownedPets.some(p => p.modelPath === config.modelPath || p.speciesId === shopSpeciesId)) return true;
    // Check hatching eggs (prevent duplicate gacha/shop while incubating)
    const eggs = useHatchStore.getState().eggs;
    return eggs.some(e => e.speciesId === shopSpeciesId);
  },

  buyPet: (speciesId, petName) => {
    const shopItem = ALL_SHOP_ITEMS.find(i => i.speciesId === speciesId);
    if (!shopItem) return false;
    if (get().coins < shopItem.price) return false;
    if (get().isOwned(speciesId)) return false;

    const config = getPetConfig(speciesId);
    if (!config) return false;

    const pet: OwnedPet = {
      petId: crypto.randomUUID(), petName,
      speciesId, element: config.element,
      renderType: config.renderType, modelPath: config.modelPath,
      tier: PET_TIERS[speciesId] || undefined,
      level: 1, exp: 0, expToNext: 100,
      hunger: 100, mood: 80, affection: 50,
      lastFedAt: null, obtainedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set(s => ({ ownedPets: [...s.ownedPets, pet], coins: s.coins - shopItem.price }));
    get().save();
    get().checkCollectionRewards();
    return true;
  },

  addExp: (petId, amount) => {
    const mult = get().getRewardMultiplier();
    const total = Math.floor(amount * mult);
    const petShare = Math.floor(total * 0.3);
    const poolShare = total - petShare;
    // Check mood multiplier for active pet
    const pet = get().ownedPets.find(p => p.petId === petId);
    const moodMult = pet && pet.mood >= 80 ? 1.2 : pet && pet.mood <= 20 ? 0.8 : 1.0;
    const effectiveExp = Math.floor(petShare * moodMult);
    set(s => {
      const updated = s.ownedPets.map(p => {
        if (p.petId !== petId) return p;
        let { exp, expToNext, level } = p;
        exp += effectiveExp;
        while (exp >= expToNext) {
          exp -= expToNext;
          level++;
          expToNext = Math.floor(expToNext * 1.3);
          // Milestone bubble
          const ms = getLevelMilestone(level);
          if (level === 5 || level === 10 || level === 15) {
            const tips: Record<number, string> = { 5: '🎉 突破金丹！抽卡功能已解锁，快去试试手气吧！', 10: '🎉 突破元婴！每周自动获得 20g，躺着也能赚钱~', 15: '🎉 突破化神！抽卡保底减半，传说不再是梦！' };
            emit('pet-bubble', { text: tips[level] || `突破 ${ms.title}！` }).catch(() => {});
          }
        }
        return { ...p, exp, expToNext, level, mood: Math.min(100, p.mood + 3), updatedAt: new Date().toISOString() };
      });
      return { ownedPets: updated, expPool: s.expPool + poolShare };
    });
    get().save();
  },

  addCoins: (amount) => { set(s => ({ coins: s.coins + amount })); get().save(); },
  addAffection: (petId, amount) => {
    set(s => ({
      ownedPets: s.ownedPets.map(p =>
        p.petId === petId
          ? { ...p, affection: Math.min(100, (p.affection || 0) + amount) }
          : p
      ),
    }));
    get().save();
  },

  spendCoins: (amount) => {
    if (get().coins < amount) return false;
    set(s => ({ coins: s.coins - amount }));
    get().save();
    return true;
  },

  feedPet: (petId, foodId) => {
    const food = FOODS[foodId];
    if (!food) return false;
    const foods = get().foods;
    if ((foods[foodId] || 0) <= 0) return false;

    // Track feed count for achievements
    try {
      const count = parseInt(localStorage.getItem('csp_feed_count') || '0') + 1;
      localStorage.setItem('csp_feed_count', String(count));
    } catch {}

    set(s => ({
      foods: { ...s.foods, [foodId]: (s.foods[foodId] || 0) - 1 },
      ownedPets: s.ownedPets.map(p => {
        if (p.petId !== petId) return p;
        return {
          ...p, hunger: Math.min(100, p.hunger + food.hunger),
          mood: Math.min(100, p.mood + 5),
          affection: Math.min(100, p.affection + 3),
          lastFedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    get().save();
    return true;
  },

  tickHunger: () => {
    const { activePetId, dailyHungerConsumed, hungerDate } = get();
    if (!activePetId) return;
    const today = new Date().toISOString().slice(0, 10);
    const consumed = hungerDate === today ? dailyHungerConsumed : 0;
    if (consumed >= 15) return; // Daily cap reached
    set(s => ({
      dailyHungerConsumed: consumed + 1,
      hungerDate: today,
      ownedPets: s.ownedPets.map(p =>
        p.petId === activePetId
          ? { ...p, hunger: Math.max(0, p.hunger - 1), mood: p.hunger <= 20 ? Math.max(0, p.mood - 1) : p.mood }
          : p
      ),
    }));
    // Hunger warnings: emit events when crossing thresholds
    const newHunger = get().ownedPets.find(p => p.petId === activePetId)?.hunger ?? 100;
    if (newHunger <= 0) {
      try {
        emit('pet-bubble', { text: '我快饿晕了...再不喂食我就要消失了！😿💔', urgent: true }).catch(() => {});
      } catch {}
    } else if (newHunger <= 10) {
      try {
        emit('pet-bubble', { text: '我太饿了，进入虚弱状态...快给我喂食吧！😿', urgent: true }).catch(() => {});
      } catch {}
    } else if (newHunger <= 15) {
      try {
        emit('pet-bubble', { text: '我有点饿了...请及时喂食给我补充饥饿值 🍖', urgent: true }).catch(() => {});
      } catch {}
    }
    get().save();
  },

  // Calculate and apply offline hunger when app opens
  // Every 7 days offline → -25 hunger, max -75
  applyOfflineHunger: () => {
    const { lastActiveAt, activePetId } = get();
    if (!activePetId) return 0;
    const now = Date.now();
    const last = new Date(lastActiveAt).getTime();
    if (!last || last >= now) return 0;
    const daysOffline = Math.floor((now - last) / 86400000);
    if (daysOffline < 7) return 0;
    const penalty = Math.min(Math.floor(daysOffline / 7) * 25, 75);
    set(s => ({
      lastActiveAt: new Date().toISOString(),
      ownedPets: s.ownedPets.map(p =>
        p.petId === activePetId
          ? { ...p, hunger: Math.max(0, p.hunger - penalty) }
          : p
      ),
    }));
    return penalty;
  },

  addPendingRewards: (exp, coins) => {
    set(s => ({ pendingExp: s.pendingExp + exp, pendingCoins: s.pendingCoins + coins }));
    get().save();
  },

  claimPendingRewards: () => {
    const { pendingExp, pendingCoins, activePetId } = get();
    if (pendingExp === 0 && pendingCoins === 0) return;
    if (activePetId) get().addExp(activePetId, pendingExp);
    const mult = get().getRewardMultiplier();
    get().addCoins(Math.floor(pendingCoins * mult));
    set({ pendingExp: 0, pendingCoins: 0 });
    get().save();
  },

  addRenameCards: (amount: number) => {
    set(s => ({ renameCards: s.renameCards + amount }));
    get().save();
  },

  buyRenameCard: () => {
    if (get().coins < 200) return false;
    set(s => ({ coins: s.coins - 200, renameCards: s.renameCards + 1 }));
    get().save();
    return true;
  },

  renamePet: (petId: string, newName: string): string => {
    if (get().renameCards <= 0) return '没有改名卡';
    const err = validatePetName(newName);
    if (err) return err;
    const n = newName.trim();
    if (get().ownedPets.some(p => p.petId !== petId && p.petName === n)) return '名字已被其他智子使用';
    set(s => ({
      renameCards: s.renameCards - 1,
      ownedPets: s.ownedPets.map(p =>
        p.petId === petId ? { ...p, petName: n, updatedAt: new Date().toISOString() } : p
      ),
    }));
    get().save();
    return '';
  },

  // Gacha: 150g/抽，混合奖池（食物/许愿票/精灵/改名卡）
  _rollGacha: () => {
    const s = get();
    const today = new Date().toISOString().slice(0, 10);
    let gachaDailyPulls = s.gachaDailyPulls;
    let gachaDate = s.gachaDate;
    let gachaPity = s.gachaPity;
    if (gachaDate !== today) { gachaDailyPulls = 0; gachaDate = today; }
    if (gachaDailyPulls >= 5) return null;
    if (s.coins < 150) return null;
    gachaDailyPulls++; gachaPity++;

    const activePet = s.ownedPets.find(p => p.petId === s.activePetId);
    const pityThreshold = activePet ? getLevelMilestone(activePet.level).pityThreshold : 100;

    const roll = Math.random() * 100;

    // Pity break: guaranteed legendary pet
    if (gachaPity >= pityThreshold || roll < 4) {
      gachaPity = 0;
      const legends = ALL_SHOP_ITEMS.filter(i => i.itemType === 'pet' && PET_TIERS[i.speciesId!] === 'legendary');
      const available = legends.filter(i => !get().isOwned(i.speciesId!));
      if (available.length === 0) return { type: 'renameCard' };
      const item = available[Math.floor(Math.random() * available.length)];
      if (!item?.speciesId) return null;
      const ownedNames = s.ownedPets.map(p => p.petName);
      const autoName = item.name + (ownedNames.includes(item.name) ? Math.floor(Math.random()*100).toString() : '');
      set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 150 });
      get().save();
      return { type: 'pet', item, rarity: 'legendary', autoName, pityBreak: true };
    }

    // Non-legendary: 70% consumables, 30% pets/rename card
    if (roll < 30) {
      // 30% 普通食物
      set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 150 });
      get().save();
      return { type: 'food', foodType: 'normal' };
    } else if (roll < 50) {
      // 20% 高级食物
      set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 150 });
      get().save();
      return { type: 'food', foodType: 'premium' };
    } else if (roll < 70) {
      // 20% 许愿票
      set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 150 });
      get().save();
      return { type: 'wishTicket' };
    } else if (roll < 80) {
      // 10% 普通精灵
    } else if (roll < 88) {
      // 8% 稀有精灵
    } else if (roll < 96) {
      // 8% 改名卡
      set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 150 });
      get().save();
      return { type: 'renameCard' };
    } else {
      // 4% 传说 (already handled by pity above, but catch the natural roll)
    }

    // Fall through to pet draw
    let rarity: string;
    if (roll < 80) rarity = 'common';
    else if (roll < 88) rarity = 'rare';
    else { rarity = 'common'; }

    const allPets = ALL_SHOP_ITEMS.filter(i => i.itemType === 'pet');
    const commons = allPets.filter(i => (PET_TIERS[i.speciesId!] || 'common') === 'common');
    const rares = allPets.filter(i => PET_TIERS[i.speciesId!] === 'rare');
    const pool = rarity === 'rare' ? rares.length ? rares : commons : commons;

    const available = pool.filter(i => !get().isOwned(i.speciesId!));
    if (available.length === 0) {
      set({ gachaDailyPulls, gachaDate: today, gachaPity: s.gachaPity, coins: s.coins - 150 });
      get().save();
      return { type: 'renameCard' }; // All owned → fallback rename card
    }

    const item = available[Math.floor(Math.random() * available.length)];
    if (!item?.speciesId) return null;

    const ownedNames = s.ownedPets.map(p => p.petName);
    const autoName = item.name + (ownedNames.includes(item.name) ? Math.floor(Math.random()*100).toString() : '');

    set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 150 });
    get().save();
    return { type: 'pet', item, rarity, autoName, pityBreak: false };
  },

  // Add pet after hatching — coins already deducted in gacha/shop flow
  claimHatchedPet: (speciesId: string, petName: string, tier?: string) => {
    if (get().isOwned(speciesId)) return false;
    const config = getPetConfig(speciesId);
    if (!config) return false;

    const pet: OwnedPet = {
      petId: crypto.randomUUID(), petName,
      speciesId, element: config.element,
      renderType: config.renderType, modelPath: config.modelPath,
      tier: tier || undefined,
      level: 1, exp: 0, expToNext: 100,
      hunger: 100, mood: 80, affection: 50,
      lastFedAt: null, obtainedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set(s => ({ ownedPets: [...s.ownedPets, pet] }));
    // Mark as newly obtained for badge display
    try {
      const news = JSON.parse(localStorage.getItem('csp_new_pets') || '[]');
      news.push(pet.petId);
      localStorage.setItem('csp_new_pets', JSON.stringify(news));
    } catch {}
    get().save();
    return true;
  },

  doGacha: () => {
    const result = get()._rollGacha();
    if (!result) return null;

    // Non-pet prizes
    if (result.type === 'food') {
      set(s => {
        const items = [...s.foodItems];
        const existing = items.find(f => f.type === result.foodType);
        if (existing) existing.count++;
        else items.push({ type: result.foodType!, count: 1 });
        return { foodItems: items };
      });
      get().save();
      return result;
    }
    if (result.type === 'wishTicket') {
      set(s => ({ wishTickets: s.wishTickets + 1 }));
      get().save();
      return result;
    }
    if (result.type === 'renameCard') {
      set(s => ({ renameCards: s.renameCards + 1 }));
      get().save();
      return result;
    }

    // Pet prize
    const r = result as any;
    const config = getPetConfig(r.item.speciesId);
    if (!config) return null;
    const pet: OwnedPet = {
      petId: crypto.randomUUID(), petName: r.autoName || r.item.name,
      speciesId: r.item.speciesId!, element: config.element,
      renderType: config.renderType, modelPath: config.modelPath,
      tier: r.rarity || undefined,
      level: 1, exp: 0, expToNext: 100,
      hunger: 100, mood: 80, affection: 50,
      lastFedAt: null, obtainedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set(s => ({ ownedPets: [...s.ownedPets, pet] }));
    get().save();
    get().checkCollectionRewards();
    return result;
  },

  // ─── Training camp ───
  activateTrainingCamp: (password: string) => {
    // CAMP-{date}-{check}-{rand} format — rand is part of the hash
    const match = password.match(/^CAMP-(\d{8})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
    if (match) {
      const [, date, check, rand] = match;
      // Validate hash — rand is now included, changing any char invalidates the code
      const SECRET = 'csp-camp-2025';
      const s = `${date}-${rand}-${SECRET}`;
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      }
      const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      let expected = '';
      let v = Math.abs(h);
      for (let i = 0; i < 4; i++) {
        expected = chars[v % chars.length] + expected;
        v = Math.floor(v / chars.length);
      }
      if (expected !== check) return false;
      const end = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
      set({ trainingCampActive: true, trainingCampEndDate: end, trainingCampFoodsClaimed: [] });
      get().save();
      return true;
    }
    return false;
  },

  getRewardMultiplier: () => {
    const { trainingCampActive, trainingCampEndDate } = get();
    if (!trainingCampActive) return 1.0;
    const today = new Date().toISOString().slice(0, 10);
    if (today <= trainingCampEndDate) return 1.5;
    // Camp expired
    set({ trainingCampActive: false });
    get().save();
    return 1.0;
  },

  claimTrainingCampFoods: () => {
    const { trainingCampActive, trainingCampEndDate, trainingCampFoodsClaimed } = get();
    if (!trainingCampActive) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (today > trainingCampEndDate) return false;
    if (trainingCampFoodsClaimed.includes(today)) return false;
    set(s => ({
      foods: { ...s.foods, basic: (s.foods.basic || 0) + 3 },
      trainingCampFoodsClaimed: [...s.trainingCampFoodsClaimed, today],
    }));
    get().save();
    return true;
  },

  // ─── Experience pool ───
  allocateExpFromPool: (petId: string, amount: number) => {
    const s = get();
    if (s.expPool < amount) return;
    const clamped = Math.min(amount, s.expPool);
    set(s2 => ({ expPool: s2.expPool - clamped }));
    // Allocate exp without adding to pool again (use original addExp logic without split)
    set(s2 => ({
      ownedPets: s2.ownedPets.map(p => {
        if (p.petId !== petId) return p;
        let { exp, expToNext, level } = p;
        exp += clamped;
        while (exp >= expToNext) {
          exp -= expToNext;
          level++;
          expToNext = Math.floor(expToNext * 1.3);
          const ms = getLevelMilestone(level);
          if (level === 5 || level === 10 || level === 15) {
            const tips: Record<number, string> = { 5: '🎉 突破金丹！抽卡功能已解锁！', 10: '🎉 突破元婴！每周自动获得 20g~', 15: '🎉 突破化神！保底减半至 50 抽！' };
            emit('pet-bubble', { text: tips[level] || `突破 ${ms.title}！` }).catch(() => {});
          }
        }
        return { ...p, exp, expToNext, level, updatedAt: new Date().toISOString() };
      }),
    }));
    get().save();
  },

  addExpToPool: (amount: number) => {
    set(state => ({ expPool: state.expPool + amount }));
    get().save();
  },

  canLevelUp: (petId: string): boolean => {
    const pet = get().ownedPets.find(p => p.petId === petId);
    if (!pet) return false;
    return get().expPool >= pet.expToNext;
  },

  levelUp: (petId: string) => {
    const pet = get().ownedPets.find(p => p.petId === petId);
    if (!pet || !get().canLevelUp(petId)) return;

    const needed = pet.expToNext;
    const newLevel = pet.level + 1;
    const newExpToNext = Math.floor(needed * 1.3);

    const speciesId = pet.speciesId;
    const base = PET_BASE_STATS[speciesId] || PET_BASE_STATS.default;
    const tier = getPetTier(speciesId);
    const stats = calculateStats(base, TIER_MULTIPLIERS[tier], newLevel);
    const { level, ...baseStats } = stats;

    set(state => ({
      expPool: state.expPool - needed,
      ownedPets: state.ownedPets.map(p =>
        p.petId === petId
          ? {
              ...p,
              level: newLevel,
              exp: 0,
              expToNext: newExpToNext,
              battle: {
                ...baseStats,
                currentHp: baseStats.maxHp,
              },
            }
          : p
      ),
    }));
    get().save();
  },

  ensureBattleStats: (pet: OwnedPet): OwnedPet => {
    if (pet.battle) return pet;
    const base = PET_BASE_STATS[pet.speciesId] || PET_BASE_STATS.default;
    const tier = getPetTier(pet.speciesId);
    const stats = calculateStats(base, TIER_MULTIPLIERS[tier], pet.level);
    const { level, ...baseStats } = stats;
    return {
      ...pet,
      battle: { ...baseStats, currentHp: baseStats.maxHp },
    };
  },

  // Collection rewards now handled by AchievementsPanel manual claim
  checkCollectionRewards: () => {},

  save: () => {
    const { ownedPets, activePetId, coins, foods, pendingExp, pendingCoins, expPool, renameCards, foodItems, wishTickets, gachaDailyPulls, gachaDate, gachaPity, trainingCampActive, trainingCampEndDate, trainingCampFoodsClaimed, lastActiveAt, dailyHungerConsumed, hungerDate } = get();
    const data = { ownedPets, activePetId, coins, foods, pendingExp, pendingCoins, expPool, renameCards, foodItems, wishTickets, gachaDailyPulls, gachaDate, gachaPity, trainingCampActive, trainingCampEndDate, trainingCampFoodsClaimed, lastActiveAt, dailyHungerConsumed, hungerDate };
    dualSave('pet_data', 'csp_pet_data', JSON.stringify(data));
    emit('pet-data-sync', data).catch(() => {});
    // save() 只管数据同步，不管窗口显隐
    // 窗口显隐由学生通过设置面板的开关来控制
    },

  load: async () => {
    const raw = await dualLoad('pet_data', 'csp_pet_data');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.ownedPets) {
        // Migrate old pets without renderType/modelPath
        const migrated = data.ownedPets.map((p: any) => {
          if (p.renderType) return p;
          const config = getPetConfig(p.speciesId);
          return { ...p, renderType: config?.renderType || '2d', modelPath: config?.modelPath || '' };
        });
        // Ensure every loaded pet has battle stats for 智子试炼场
        const loadedPets = migrated.map((p: any) => get().ensureBattleStats(p));
        set({
          ownedPets: loadedPets,
          activePetId: data.activePetId || null,
          coins: data.coins ?? 200,
          foods: data.foods || { basic: 3 },
          pendingExp: data.pendingExp || 0,
          pendingCoins: data.pendingCoins || 0,
          expPool: data.expPool || 0,
          renameCards: data.renameCards || 0,
          foodItems: data.foodItems || [],
          wishTickets: data.wishTickets || 0,
          gachaDailyPulls: data.gachaDailyPulls || 0,
          gachaDate: data.gachaDate || '',
          gachaPity: data.gachaPity || 0,
          trainingCampActive: data.trainingCampActive || false,
          trainingCampEndDate: data.trainingCampEndDate || '',
          trainingCampFoodsClaimed: data.trainingCampFoodsClaimed || [],
          lastActiveAt: data.lastActiveAt || new Date().toISOString(),
          dailyHungerConsumed: data.dailyHungerConsumed || 0,
          hungerDate: data.hungerDate || '',
        });
      }
    } catch { /* corrupted data — ignore */ }
  },
}));
