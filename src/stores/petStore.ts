import { create } from 'zustand';
import { emit } from '@tauri-apps/api/event';
import { dualSave, dualLoad } from '../lib/persist';
import type { OwnedPet, PetElement, PetTier, RecycledPet } from '../types/pet';
import { STARTER_PETS, getPetConfig, getPetTier, ALL_SHOP_ITEMS, PET_TIERS, PET_BASE_STATS, TIER_MULTIPLIERS, TIER_PRICES } from '../types/pet';
import type { ShopItem } from '../types/pet';
import { calculateStats } from '../../src-dungeon/utils/combatLogic';
import { validatePetName } from '../utils/validateName';
import { useHatchStore } from './hatchStore';
import { petCopy } from '../components/pet/PetCopy';
import { grantTickets } from '../utils/crypto';

interface PetState {
  activePetId: string | null;
  ownedPets: OwnedPet[];
  coins: number;
  foods: Record<string, number>;
  expPool: number;
  weeklyPassiveClaimWeek: string;
  claimWeeklyPassiveCoins: () => { ok: boolean; amount: number; message: string };

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
  reforgeElement: (petId: string, element: PetElement) => { ok: boolean; cost: number; message?: string };
  recyclePet: (petId: string) => { ok: boolean; message?: string };
  restoreRecycledPet: (petId: string) => boolean;
  dismantleRecycledPet: (petId: string) => { ok: boolean; exp: number; coins: number };

  // Gacha
  gachaDailyPulls: number;
  gachaDate: string;
  gachaPity: number;
  _rollGacha: () => { type: 'pet'; item: ShopItem; rarity: string; autoName?: string; pityBreak: boolean } | { type: 'food'; foodType: string } | { type: 'wishTicket' } | { type: 'renameCard' } | null;
  claimHatchedPet: (speciesId: string, petName: string, tier?: string, acquisitionCost?: number) => boolean;
  doGacha: () => { type: 'pet'; item: ShopItem; rarity: string; pityBreak: boolean } | { type: 'food'; foodType: string } | { type: 'wishTicket' } | { type: 'renameCard' } | null;

  // Inventory
  foodItems: { type: string; count: number }[];
  wishTickets: number;
  gachaHistory: { id: string; type: string; label: string; at: string }[];

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
  autoFeederOwned: boolean;
  autoFeederEnabled: boolean;
  buyAutoFeeder: () => boolean;
  setAutoFeederEnabled: (enabled: boolean) => void;
  runAutoFeeder: () => boolean;
  expShopDate: string;
  expCapsuleBought: number;
  expCoreBought: number;
  buyExpItem: (kind: 'capsule' | 'core') => boolean;
  recycledPets: RecycledPet[];
  companionSlots: number;
  desktopCompanionIds: string[];
  buyCompanionSlot: (expectedCurrentSlots?: number) => boolean;
  setDesktopCompanion: (slot: 2 | 3, petId: string | null) => boolean;

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
  load: () => Promise<boolean>;
}

export const FOODS: Record<string, { name: string; price: number; hunger: number; icon: string }> = {
  basic:   { name: '普通食物', price: 30,  hunger: 30, icon: '🌾' },
  premium: { name: '营养食物', price: 80,  hunger: 60, icon: '🍪' },
  deluxe:  { name: '豪华食物', price: 150, hunger: 100, icon: '🍖' },
};

export const MAX_PET_LEVEL = 20;
export const ELEMENT_REFORGE_COST = 200;
export const AUTO_FEEDER_COST = 1500;
const EXP_SHOP_CAPSULE_COST = 400;
const EXP_SHOP_CORE_COST = 1000;
const EXP_SHOP_CAPSULE_EXP = 120;
const EXP_SHOP_CORE_EXP = 360;
const COMPANION_SLOT_RECEIPT_KEY = 'csp_companion_slot_receipt';

function currentDay(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function currentWeekKey(date = new Date()): string {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

export function getWeeklyPassiveCoinReward(pets: Pick<OwnedPet, 'level'>[]): number {
  const highestLevel = pets.reduce((max, pet) => Math.max(max, Number(pet.level) || 0), 0);
  if (highestLevel >= 20) return 32;
  if (highestLevel >= 10) return 20;
  return 0;
}

export function migrateWeeklyPassiveClaimWeek(
  savedWeek: unknown,
  legacyGrantAt: unknown,
  now = new Date(),
): string {
  const existing = String(savedWeek || '');
  if (existing) return existing;
  const legacyTimestamp = Number(legacyGrantAt);
  if (!Number.isFinite(legacyTimestamp) || legacyTimestamp <= 0) return '';
  return currentWeekKey(new Date(legacyTimestamp)) === currentWeekKey(now) ? currentWeekKey(now) : '';
}

function readCompanionSlotReceipt(): number {
  try {
    const receipt = JSON.parse(localStorage.getItem(COMPANION_SLOT_RECEIPT_KEY) || '{}');
    return Math.min(3, Math.max(1, Number(receipt.slots) || 1));
  } catch {
    return 1;
  }
}

function writeCompanionSlotReceipt(slots: number): void {
  try {
    localStorage.setItem(COMPANION_SLOT_RECEIPT_KEY, JSON.stringify({
      slots: Math.min(3, Math.max(1, slots)),
      updatedAt: new Date().toISOString(),
    }));
  } catch { /* main pet snapshot remains the primary copy */ }
}

function cumulativePetExp(pet: OwnedPet): number {
  let required = 100;
  let total = 0;
  for (let level = 1; level < pet.level; level++) {
    total += required;
    required = Math.floor(required * 1.3);
  }
  return total + pet.exp;
}

// 估算老数据的获取成本：早期记录的 acquisitionCost 为 0，
// 导致回收站金币返还恒为 0。优先取商城标价；其余按稀有度定价
// （与商城 TIER_PRICES 一致：普通 150 / 稀有 260 / 传说 500）。
function estimateAcquisitionCost(pet: { speciesId?: string; tier?: string; acquisitionCost?: number }): number {
  if (pet.acquisitionCost) return pet.acquisitionCost;
  if (pet.speciesId && STARTER_PETS.some(s => s.speciesId === pet.speciesId)) return 0;
  const shopItem = pet.speciesId
    ? ALL_SHOP_ITEMS.find(i => i.itemType === 'pet' && i.speciesId === pet.speciesId)
    : undefined;
  if (shopItem) return shopItem.price;
  const tier = (pet.tier as PetTier | undefined) || (pet.speciesId ? getPetTier(pet.speciesId) : 'common');
  return TIER_PRICES[tier] ?? TIER_PRICES.common;
}

function elementLabel(element: PetElement): string {
  return ({ earth: '地', fire: '火', wind: '风', water: '水', light: '光' } as const)[element];
}

function calculatePetBattleStats(speciesId: string, level: number, currentHp?: number) {
  const base = PET_BASE_STATS[speciesId] || PET_BASE_STATS.default;
  const tier = getPetTier(speciesId);
  const stats = calculateStats(base, TIER_MULTIPLIERS[tier], level);
  const { level: _level, ...baseStats } = stats;
  return {
    ...baseStats,
    currentHp: currentHp === undefined
      ? baseStats.maxHp
      : Math.min(baseStats.maxHp, Math.max(0, currentHp)),
  };
}

// Level milestones
export function getLevelMilestone(level: number): { title: string; pityThreshold: number; weeklyPassiveCoins: number } {
  if (level >= 20) return { title: '大乘(满级)', pityThreshold: 30, weeklyPassiveCoins: 32 };
  if (level >= 15) return { title: '化神', pityThreshold: 50, weeklyPassiveCoins: 20 };
  if (level >= 10) return { title: '元婴', pityThreshold: 100, weeklyPassiveCoins: 20 };
  if (level >= 5)  return { title: '金丹', pityThreshold: 100, weeklyPassiveCoins: 0 };
  return { title: '筑基', pityThreshold: 100, weeklyPassiveCoins: 0 };
}

// Display name with milestone prefix: [大乘(满级)] 宠物名
export function formatPetDisplayName(name: string, level: number): string {
  const title = getLevelMilestone(level).title;
  return `[${title}] ${name}`;
}

// Level badge color by tier
export function getLevelBadgeColor(level: number): string {
  if (level >= 20) return '#dc2626'; // red — max level
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
  weeklyPassiveClaimWeek: '',
  renameCards: 0,
  foodItems: [],
  wishTickets: 0,
  gachaHistory: [],
  gachaDailyPulls: 0,
  gachaDate: '',
  gachaPity: 0,
  trainingCampActive: false,
  trainingCampEndDate: '',
  trainingCampFoodsClaimed: [],
  lastActiveAt: new Date().toISOString(),
  dailyHungerConsumed: 0,
  hungerDate: '',
  autoFeederOwned: false,
  autoFeederEnabled: false,
  expShopDate: '',
  expCapsuleBought: 0,
  expCoreBought: 0,
  recycledPets: [],
  companionSlots: 1,
  desktopCompanionIds: [],

  claimWeeklyPassiveCoins: () => {
    const state = get();
    const amount = getWeeklyPassiveCoinReward(state.ownedPets);
    if (amount <= 0) return { ok: false, amount: 0, message: '最高等级达到 Lv.10 后解锁' };
    const week = currentWeekKey();
    if (state.weeklyPassiveClaimWeek === week) {
      return { ok: false, amount: 0, message: '本周修行金币已领取' };
    }
    set(s => ({ coins: s.coins + amount, weeklyPassiveClaimWeek: week }));
    get().save();
    return { ok: true, amount, message: `本周修行金币 +${amount}，已到账` };
  },

  selectStarter: (speciesId, petName) => {
    const species = STARTER_PETS.find(s => s.speciesId === speciesId);
    if (!species) return;
    const pet: OwnedPet = {
      petId: crypto.randomUUID(), petName,
      speciesId: species.speciesId, element: species.element, nativeElement: species.element,
      acquisitionSource: 'starter', acquisitionCost: 0,
      renderType: species.renderType, modelPath: species.modelPath,
      level: 1, exp: 0, expToNext: 100,
      hunger: 100, mood: 80, affection: 50,
      lastFedAt: null, obtainedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set(s => ({ ownedPets: [...s.ownedPets, pet], activePetId: pet.petId }));
    get().save();
  },

  setActivePet: (petId) => {
    if (!get().ownedPets.some(p => p.petId === petId)) return false;
    set(s => ({ activePetId: petId, desktopCompanionIds: s.desktopCompanionIds.map(id => id === petId ? '' : id) })); get().save();
    return true;
  },

  buyCompanionSlot: (expectedCurrentSlots) => {
    const state = get();
    if (expectedCurrentSlots !== undefined && state.companionSlots !== expectedCurrentSlots) return false;
    const cost = state.companionSlots === 1 ? 2500 : state.companionSlots === 2 ? 5000 : 0;
    if (!cost || state.coins < cost) return false;
    const unlockedSlots = state.companionSlots + 1;
    set(s => ({ companionSlots: unlockedSlots, coins: s.coins - cost }));
    writeCompanionSlotReceipt(unlockedSlots);
    get().save();
    return true;
  },

  setDesktopCompanion: (slot, petId) => {
    const state = get();
    if (slot > state.companionSlots || (petId && !state.ownedPets.some(p => p.petId === petId))) return false;
    if (petId && (petId === state.activePetId || state.desktopCompanionIds.some((id, index) => id === petId && index !== slot - 2))) return false;
    const ids = [...state.desktopCompanionIds];
    ids[slot - 2] = petId || '';
    set({ desktopCompanionIds: ids.slice(0, Math.max(0, state.companionSlots - 1)) });
    get().save();
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
    // Recycled pets still belong to the student until permanently dismantled.
    if (get().recycledPets.some(record =>
      record.pet.modelPath === config.modelPath || record.pet.speciesId === shopSpeciesId
    )) return true;
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
      speciesId, element: config.element, nativeElement: config.element,
      acquisitionSource: 'shop', acquisitionCost: shopItem.price,
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
        while (exp >= expToNext && level < MAX_PET_LEVEL) {
          exp -= expToNext;
          level++;
          expToNext = Math.floor(expToNext * 1.3);
          // Milestone bubble
          const ms = getLevelMilestone(level);
          if (level === 5 || level === 10 || level === 15) {
            emit('pet-bubble', { text: petCopy.levelUp(level, ms.title) }).catch(() => {});
          }
          if (level === MAX_PET_LEVEL) {
            exp = 0;
            expToNext = 0;
            emit('pet-bubble', { text: petCopy.maxLevel() }).catch(() => {});
          }
        }
        return {
          ...p,
          exp,
          expToNext,
          level,
          battle: calculatePetBattleStats(p.speciesId, level, p.battle?.currentHp),
          mood: Math.min(100, p.mood + 3),
          updatedAt: new Date().toISOString(),
        };
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
    if (!Number.isFinite(amount) || amount <= 0) return false;
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
        emit('pet-bubble', { text: petCopy.hunger('empty'), urgent: true }).catch(() => {});
      } catch {}
    } else if (newHunger <= 10) {
      try {
        emit('pet-bubble', { text: petCopy.hunger('veryLow'), urgent: true }).catch(() => {});
      } catch {}
    } else if (newHunger <= 15) {
      try {
        emit('pet-bubble', { text: petCopy.hunger('low'), urgent: true }).catch(() => {});
      } catch {}
    }
    get().runAutoFeeder();
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
    get().runAutoFeeder();
    get().save();
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

  reforgeElement: (petId, element) => {
    const pet = get().ownedPets.find(p => p.petId === petId);
    if (!pet) return { ok: false, cost: 0, message: '没有找到这只智子' };
    if (pet.element === element) return { ok: false, cost: 0, message: `已经是${elementLabel(element)}属性` };
    const cost = pet.freeElementChangeUsed ? ELEMENT_REFORGE_COST : 0;
    if (get().coins < cost) return { ok: false, cost, message: '金币不足' };
    set(s => ({
      coins: s.coins - cost,
      ownedPets: s.ownedPets.map(p => p.petId === petId
        ? { ...p, element, freeElementChangeUsed: true, updatedAt: new Date().toISOString() }
        : p),
    }));
    get().save();
    return { ok: true, cost };
  },

  recyclePet: (petId) => {
    const pet = get().ownedPets.find(p => p.petId === petId);
    if (!pet) return { ok: false, message: '没有找到这只智子' };
    if (get().ownedPets.length <= 1) return { ok: false, message: '至少保留一只智子陪伴你' };
    const returnedExp = Math.floor(cumulativePetExp(pet) * 0.6);
    const returnedCoins = Math.floor((pet.acquisitionCost || 0) * 0.5);
    set(s => ({
      ownedPets: s.ownedPets.filter(p => p.petId !== petId),
      activePetId: s.activePetId === petId ? s.ownedPets.find(p => p.petId !== petId)?.petId || null : s.activePetId,
      desktopCompanionIds: s.desktopCompanionIds.map(id => id === petId ? '' : id),
      recycledPets: [...s.recycledPets, { pet, recycledAt: new Date().toISOString(), returnedExp, returnedCoins }],
    }));
    get().save();
    return { ok: true };
  },

  restoreRecycledPet: (petId) => {
    const record = get().recycledPets.find(item => item.pet.petId === petId);
    if (!record || get().ownedPets.some(p => p.petId === petId)) return false;
    set(s => ({
      ownedPets: [...s.ownedPets, record.pet],
      recycledPets: s.recycledPets.filter(item => item.pet.petId !== petId),
    }));
    get().save();
    return true;
  },

  dismantleRecycledPet: (petId) => {
    const record = get().recycledPets.find(item => item.pet.petId === petId);
    if (!record) return { ok: false, exp: 0, coins: 0 };
    set(s => ({
      recycledPets: s.recycledPets.filter(item => item.pet.petId !== petId),
      expPool: s.expPool + record.returnedExp,
      coins: s.coins + record.returnedCoins,
    }));
    get().save();
    return { ok: true, exp: record.returnedExp, coins: record.returnedCoins };
  },

  // Gacha: 150g/抽，混合奖池（食物/许愿票/精灵/改名卡）
  _rollGacha: () => {
    const s = get();
    const today = currentDay();
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
      if (available.length === 0) {
        set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 150 });
        get().save();
        return { type: 'renameCard' };
      }
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
      set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 150 });
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
  claimHatchedPet: (speciesId: string, petName: string, tier?: string, acquisitionCost?: number) => {
    if (get().isOwned(speciesId)) return false;
    const config = getPetConfig(speciesId);
    if (!config) return false;

    const pet: OwnedPet = {
      petId: crypto.randomUUID(), petName,
      speciesId, element: config.element, nativeElement: config.element,
      acquisitionSource: speciesId.startsWith('workshop-') ? 'workshop' : 'gacha',
      acquisitionCost: Math.max(0, acquisitionCost ?? 150),
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
      const foodType = result.foodType === 'normal' ? 'basic' : result.foodType;
      const label = FOODS[foodType]?.name || '食物';
      set(s => ({
        foods: { ...s.foods, [foodType]: (s.foods[foodType] || 0) + 1 },
        gachaHistory: [{ id: crypto.randomUUID(), type: 'food', label: `${label} ×1`, at: new Date().toISOString() }, ...s.gachaHistory].slice(0, 30),
      }));
      get().save();
      return result;
    }
    if (result.type === 'wishTicket') {
      grantTickets(1);
      window.dispatchEvent(new CustomEvent('tickets-updated'));
      set(s => ({
        gachaHistory: [{ id: crypto.randomUUID(), type: 'wishTicket', label: '许愿票 ×1', at: new Date().toISOString() }, ...s.gachaHistory].slice(0, 30),
      }));
      get().save();
      return result;
    }
    if (result.type === 'renameCard') {
      set(s => ({
        renameCards: s.renameCards + 1,
        gachaHistory: [{ id: crypto.randomUUID(), type: 'renameCard', label: '改名卡 ×1', at: new Date().toISOString() }, ...s.gachaHistory].slice(0, 30),
      }));
      get().save();
      return result;
    }

    // Pet prizes enter the persistent hatching queue in ShopPanel. Do not add the
    // pet here, otherwise the later hatch claim is rejected as "already owned".
    const r = result as any;
    const config = getPetConfig(r.item.speciesId);
    if (!config) return null;
    set(s => ({
      gachaHistory: [{ id: crypto.randomUUID(), type: 'pet', label: `${r.item.name}（${r.rarity === 'legendary' ? '传说' : r.rarity === 'rare' ? '稀有' : '普通'}）`, at: new Date().toISOString() }, ...s.gachaHistory].slice(0, 30),
    }));
    get().save();
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
        while (exp >= expToNext && level < MAX_PET_LEVEL) {
          exp -= expToNext;
          level++;
          expToNext = Math.floor(expToNext * 1.3);
          const ms = getLevelMilestone(level);
          if (level === 5 || level === 10 || level === 15) {
            emit('pet-bubble', { text: petCopy.levelUp(level, ms.title) }).catch(() => {});
          }
          if (level === MAX_PET_LEVEL) {
            exp = 0;
            expToNext = 0;
            emit('pet-bubble', { text: petCopy.maxLevel() }).catch(() => {});
          }
        }
        return {
          ...p,
          exp,
          expToNext,
          level,
          battle: calculatePetBattleStats(p.speciesId, level),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    get().save();
  },

  addExpToPool: (amount: number) => {
    set(state => ({ expPool: state.expPool + amount }));
    get().save();
  },

  buyAutoFeeder: () => {
    if (get().autoFeederOwned || get().coins < AUTO_FEEDER_COST) return false;
    set(s => ({ coins: s.coins - AUTO_FEEDER_COST, autoFeederOwned: true, autoFeederEnabled: true }));
    get().save();
    // 购买时饱食已低于 40 的情况也要立即补喂，而不是等下一次消耗
    get().runAutoFeeder();
    return true;
  },

  setAutoFeederEnabled: (enabled) => {
    if (!get().autoFeederOwned) return;
    set({ autoFeederEnabled: enabled });
    get().save();
    // 重新开启时立即检查一次，覆盖饱食早已低于阈值的情况
    if (enabled) get().runAutoFeeder();
  },

  runAutoFeeder: () => {
    const { autoFeederOwned, autoFeederEnabled, activePetId, foods } = get();
    if (!autoFeederOwned || !autoFeederEnabled || !activePetId) return false;
    const pet = get().ownedPets.find(p => p.petId === activePetId);
    if (!pet || pet.hunger >= 40) return false;
    const foodId = (['basic', 'premium', 'deluxe'] as const).find(id => (foods[id] || 0) > 0);
    if (foodId) return get().feedPet(activePetId, foodId);
    const noticeKey = `csp_auto_feeder_empty_${currentDay()}`;
    if (!localStorage.getItem(noticeKey)) {
      localStorage.setItem(noticeKey, '1');
      emit('pet-bubble', { text: '自动喂食器没有食物了，记得去商城补给。', urgent: true }).catch(() => {});
    }
    return false;
  },

  buyExpItem: (kind) => {
    const today = currentDay();
    const state = get();
    const capsuleBought = state.expShopDate === today ? state.expCapsuleBought : 0;
    const coreBought = state.expShopDate === today ? state.expCoreBought : 0;
    const isCapsule = kind === 'capsule';
    const cost = isCapsule ? EXP_SHOP_CAPSULE_COST : EXP_SHOP_CORE_COST;
    const amount = isCapsule ? EXP_SHOP_CAPSULE_EXP : EXP_SHOP_CORE_EXP;
    const limit = isCapsule ? 3 : 1;
    if ((isCapsule ? capsuleBought : coreBought) >= limit || state.coins < cost) return false;
    set(s => ({
      coins: s.coins - cost,
      expPool: s.expPool + amount,
      expShopDate: today,
      expCapsuleBought: isCapsule ? capsuleBought + 1 : capsuleBought,
      expCoreBought: isCapsule ? coreBought : coreBought + 1,
    }));
    get().save();
    return true;
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

    set(state => ({
      expPool: state.expPool - needed,
      ownedPets: state.ownedPets.map(p =>
        p.petId === petId
          ? {
              ...p,
              level: newLevel,
              exp: 0,
              expToNext: newExpToNext,
              battle: calculatePetBattleStats(p.speciesId, newLevel),
              updatedAt: new Date().toISOString(),
            }
          : p
      ),
    }));
    get().save();
  },

  ensureBattleStats: (pet: OwnedPet): OwnedPet => {
    return {
      ...pet,
      battle: calculatePetBattleStats(pet.speciesId, pet.level, pet.battle?.currentHp),
    };
  },

  // Collection rewards now handled by AchievementsPanel manual claim
  checkCollectionRewards: () => {},

  save: () => {
    const { ownedPets, activePetId, coins, foods, pendingExp, pendingCoins, expPool, weeklyPassiveClaimWeek, renameCards, foodItems, wishTickets, gachaHistory, gachaDailyPulls, gachaDate, gachaPity, trainingCampActive, trainingCampEndDate, trainingCampFoodsClaimed, lastActiveAt, dailyHungerConsumed, hungerDate, autoFeederOwned, autoFeederEnabled, expShopDate, expCapsuleBought, expCoreBought, recycledPets, companionSlots, desktopCompanionIds } = get();
    const data = { savedAt: new Date().toISOString(), ownedPets, activePetId, coins, foods, pendingExp, pendingCoins, expPool, weeklyPassiveClaimWeek, renameCards, foodItems, wishTickets, gachaHistory, gachaDailyPulls, gachaDate, gachaPity, trainingCampActive, trainingCampEndDate, trainingCampFoodsClaimed, lastActiveAt, dailyHungerConsumed, hungerDate, autoFeederOwned, autoFeederEnabled, expShopDate, expCapsuleBought, expCoreBought, recycledPets, companionSlots, desktopCompanionIds };
    dualSave('pet_data', 'csp_pet_data', JSON.stringify(data));
    emit('pet-data-sync', data).catch(() => {});
    // save() 只管数据同步，不管窗口显隐
    // 窗口显隐由学生通过设置面板的开关来控制
    },

  load: async () => {
    const raw = await dualLoad('pet_data', 'csp_pet_data');
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data.ownedPets)) {
        // Repair legacy fields while keeping each student's existing pet identity intact.
        const migrated = data.ownedPets.map((p: any) => {
          const config = getPetConfig(p.speciesId);
          return {
            ...p,
            renderType: p.renderType || config?.renderType || '2d',
            modelPath: p.modelPath || config?.modelPath || '',
            nativeElement: p.nativeElement || (p.speciesId?.startsWith('workshop-') ? undefined : config?.element || p.element || 'fire'),
            element: p.element || config?.element || 'fire',
            freeElementChangeUsed: p.freeElementChangeUsed ?? false,
            acquisitionSource: p.acquisitionSource || 'legacy',
            acquisitionCost: estimateAcquisitionCost(p),
          };
        });
        // 回收站里已存在的记录同样回填金币返还（此前因成本为 0 恒显示 0 金币）
        const migratedRecycled = (data.recycledPets || []).map((r: any) => {
          if (r?.returnedCoins) return r;
          const cost = estimateAcquisitionCost(r?.pet || {});
          return { ...r, returnedCoins: Math.floor(cost * 0.5) };
        });
        // Ensure every loaded pet has battle stats for 智子试炼场
        const loadedPets = migrated.map((p: any) => get().ensureBattleStats(p));
        const migratedFoods = { ...(data.foods || { basic: 3 }) } as Record<string, number>;
        for (const item of data.foodItems || []) {
          const foodId = item.type === 'normal' ? 'basic' : item.type;
          if (FOODS[foodId]) migratedFoods[foodId] = (migratedFoods[foodId] || 0) + (item.count || 0);
        }
        const legacyTickets = data.wishTickets || 0;
        if (legacyTickets > 0 && !data.gachaRewardMigrationDone) {
          grantTickets(legacyTickets);
          window.dispatchEvent(new CustomEvent('tickets-updated'));
        }
        const activePetId = loadedPets.some((p: OwnedPet) => p.petId === data.activePetId)
          ? data.activePetId
          : loadedPets[0]?.petId || null;
        const assignedSlotCount = Array.isArray(data.desktopCompanionIds)
          ? data.desktopCompanionIds.reduce((max: number, id: unknown, index: number) => typeof id === 'string' && id ? Math.max(max, index + 2) : max, 1)
          : 1;
        const companionSlots = Math.min(3, Math.max(
          1,
          Number(data.companionSlots) || 1,
          assignedSlotCount,
          readCompanionSlotReceipt(),
        ));
        if (companionSlots > 1) writeCompanionSlotReceipt(companionSlots);
        const validPetIds = new Set(loadedPets.map((p: OwnedPet) => p.petId));
        const seenCompanions = new Set<string>();
        const rawCompanionIds = Array.isArray(data.desktopCompanionIds) ? data.desktopCompanionIds : [];
        const desktopCompanionIds = Array.from({ length: Math.max(0, companionSlots - 1) }, (_, index) => {
          const id = rawCompanionIds[index];
          if (
            typeof id !== 'string'
            || id === activePetId
            || !validPetIds.has(id)
            || seenCompanions.has(id)
          ) return '';
          seenCompanions.add(id);
          return id;
        });
        const storedCoins = Number(data.coins);
        const weeklyPassiveClaimWeek = migrateWeeklyPassiveClaimWeek(
          data.weeklyPassiveClaimWeek,
          localStorage.getItem('csp_last_passive_coin'),
        );
        set({
          ownedPets: loadedPets,
          activePetId,
          coins: Number.isFinite(storedCoins) && storedCoins >= 0 ? storedCoins : 200,
          foods: migratedFoods,
          pendingExp: data.pendingExp || 0,
          pendingCoins: data.pendingCoins || 0,
          expPool: data.expPool || 0,
          weeklyPassiveClaimWeek,
          renameCards: data.renameCards || 0,
          foodItems: [],
          wishTickets: 0,
          gachaHistory: data.gachaHistory || [],
          gachaDailyPulls: data.gachaDailyPulls || 0,
          gachaDate: data.gachaDate || '',
          gachaPity: data.gachaPity || 0,
          trainingCampActive: data.trainingCampActive || false,
          trainingCampEndDate: data.trainingCampEndDate || '',
          trainingCampFoodsClaimed: data.trainingCampFoodsClaimed || [],
          lastActiveAt: data.lastActiveAt || new Date().toISOString(),
          dailyHungerConsumed: data.dailyHungerConsumed || 0,
          hungerDate: data.hungerDate || '',
          autoFeederOwned: data.autoFeederOwned || false,
          autoFeederEnabled: data.autoFeederEnabled || false,
          expShopDate: data.expShopDate || '',
          expCapsuleBought: data.expCapsuleBought || 0,
          expCoreBought: data.expCoreBought || 0,
          recycledPets: migratedRecycled,
          companionSlots,
          desktopCompanionIds,
        });
        if (!data.gachaRewardMigrationDone) {
          dualSave('pet_data', 'csp_pet_data', JSON.stringify({
            ...data,
            ownedPets: loadedPets,
            foods: migratedFoods,
            foodItems: [],
            wishTickets: 0,
            gachaRewardMigrationDone: true,
          }));
        }
        return true;
      }
    } catch { /* corrupted data — do not overwrite it with defaults */ }
    return false;
  },
}));
