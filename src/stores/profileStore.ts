import { create } from 'zustand';
import { dualLoad, dualSave } from '../lib/persist';
import { DEFAULT_OWNED_WARDROBE, PROFILE_AVATARS, WARDROBE_BY_ID } from '../data/wardrobe';
import type { ProfileSnapshot, WardrobeCategory } from '../types/profile';
import { usePetStore } from './petStore';

const LS_KEY = 'csp_profile_data';
const SQLITE_KEY = 'profile_data';
export const NICKNAME_CHANGE_COST = 200;

const defaultEquipped: Record<WardrobeCategory, string | null> = {
  avatar: null,
  frame: 'frame-none',
  background: 'background-midnight',
  pendant: 'pendant-none',
  effect: 'effect-none',
  title: 'title-apprentice',
};

interface ProfileState extends ProfileSnapshot {
  loaded: boolean;
  load: () => Promise<void>;
  initialize: (zodiacId: string, constellationId: string) => boolean;
  purchase: (itemId: string) => { ok: boolean; reason?: 'owned' | 'coins' | 'not-for-sale' | 'invalid' };
  grant: (itemId: string) => void;
  equip: (itemId: string) => boolean;
  changeNickname: (nickname: string) => { ok: boolean; reason?: 'empty' | 'long' | 'coins' | 'same'; cost: number };
  setJournal: (date: string, text: string) => void;
  save: () => void;
}

function snapshot(state: ProfileState): ProfileSnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    initialized: state.initialized,
    nickname: state.nickname,
    nicknameChanges: state.nicknameChanges,
    ownedItemIds: state.ownedItemIds,
    equipped: state.equipped,
    journal: state.journal,
  };
}

function sanitize(raw: Partial<ProfileSnapshot> | null): Partial<ProfileState> {
  const owned = new Set(DEFAULT_OWNED_WARDROBE);
  for (const id of raw?.ownedItemIds || []) if (typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) owned.add(id);
  const equipped = { ...defaultEquipped, ...(raw?.equipped || {}) };
  for (const category of Object.keys(equipped) as WardrobeCategory[]) {
    const id = equipped[category];
    if (!id || !owned.has(id)) equipped[category] = defaultEquipped[category];
  }
  return {
    initialized: Boolean(raw?.initialized),
    nickname: typeof raw?.nickname === 'string' && raw.nickname.trim() ? raw.nickname.trim().slice(0, 12) : '小小探索家',
    nicknameChanges: Math.max(0, Number(raw?.nicknameChanges) || 0),
    ownedItemIds: [...owned],
    equipped,
    journal: raw?.journal && typeof raw.journal === 'object' ? raw.journal : {},
  };
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  version: 1,
  savedAt: '',
  initialized: false,
  nickname: '小小探索家',
  nicknameChanges: 0,
  ownedItemIds: [...DEFAULT_OWNED_WARDROBE],
  equipped: { ...defaultEquipped },
  journal: {},
  loaded: false,

  load: async () => {
    try {
      const raw = await dualLoad(SQLITE_KEY, LS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      set({ ...sanitize(parsed), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  initialize: (zodiacId, constellationId) => {
    if (get().initialized) return false;
    const zodiac = PROFILE_AVATARS.find(a => a.id === zodiacId && a.group === 'zodiac');
    const constellation = PROFILE_AVATARS.find(a => a.id === constellationId && a.group === 'constellation');
    if (!zodiac || !constellation) return false;
    set(s => ({ initialized: true, ownedItemIds: [...new Set([...s.ownedItemIds, zodiac.id, constellation.id])], equipped: { ...s.equipped, avatar: zodiac.id } }));
    get().save();
    return true;
  },

  purchase: (itemId) => {
    const item = WARDROBE_BY_ID.get(itemId);
    if (!item) return { ok: false, reason: 'invalid' };
    if (get().ownedItemIds.includes(itemId)) return { ok: false, reason: 'owned' };
    if (item.acquisition.type !== 'coin') return { ok: false, reason: 'not-for-sale' };
    if (!usePetStore.getState().spendCoins(item.acquisition.price)) return { ok: false, reason: 'coins' };
    set(s => ({ ownedItemIds: [...s.ownedItemIds, itemId] }));
    get().save();
    return { ok: true };
  },

  grant: (itemId) => {
    if (!WARDROBE_BY_ID.has(itemId) || get().ownedItemIds.includes(itemId)) return;
    set(s => ({ ownedItemIds: [...s.ownedItemIds, itemId] }));
    get().save();
  },

  equip: (itemId) => {
    const item = WARDROBE_BY_ID.get(itemId);
    if (!item || !get().ownedItemIds.includes(itemId)) return false;
    set(s => ({ equipped: { ...s.equipped, [item.category]: itemId } }));
    get().save();
    return true;
  },

  changeNickname: (value) => {
    const nickname = value.trim();
    if (!nickname) return { ok: false, reason: 'empty', cost: 0 };
    if (nickname.length > 12) return { ok: false, reason: 'long', cost: 0 };
    if (nickname === get().nickname) return { ok: false, reason: 'same', cost: 0 };
    const cost = get().nicknameChanges === 0 ? 0 : NICKNAME_CHANGE_COST;
    if (cost > 0 && !usePetStore.getState().spendCoins(cost)) return { ok: false, reason: 'coins', cost };
    set(s => ({ nickname, nicknameChanges: s.nicknameChanges + 1 }));
    get().save();
    return { ok: true, cost };
  },

  setJournal: (date, text) => {
    const clean = text.slice(0, 1200);
    set(s => ({ journal: { ...s.journal, [date]: clean } }));
    get().save();
  },

  save: () => dualSave(SQLITE_KEY, LS_KEY, JSON.stringify(snapshot(get()))),
}));
