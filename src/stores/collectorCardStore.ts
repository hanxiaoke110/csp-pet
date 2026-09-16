import { create } from 'zustand';
import { dualLoad, dualSave } from '../lib/persist';
import { usePetStore } from './petStore';

export const COLLECTOR_CARD_LS_KEY = 'csp_collector_cards_v1';
export const COLLECTOR_CARD_SQLITE_KEY = 'collector_cards';

export interface OwnedCollectorCard {
  cardId: string;
  acquiredAt: string;
}

interface CollectorCardState {
  ownedCards: OwnedCollectorCard[];
  loaded: boolean;
  isOwned: (cardId: string) => boolean;
  purchase: (cardId: string, price: number) => { ok: boolean; reason?: 'owned' | 'coins' | 'invalid' };
  grant: (cardId: string) => boolean;
  save: () => void;
  load: () => Promise<void>;
}

function normalizeOwnedCards(value: unknown): OwnedCollectorCard[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: OwnedCollectorCard[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const cardId = String((entry as OwnedCollectorCard).cardId || '').trim();
    if (!cardId || seen.has(cardId)) continue;
    seen.add(cardId);
    const acquiredAt = String((entry as OwnedCollectorCard).acquiredAt || '') || new Date(0).toISOString();
    result.push({ cardId, acquiredAt });
  }
  return result;
}

export const useCollectorCardStore = create<CollectorCardState>((set, get) => ({
  ownedCards: [],
  loaded: false,

  isOwned: cardId => get().ownedCards.some(card => card.cardId === cardId),

  purchase: (cardId, price) => {
    if (!cardId || !Number.isFinite(price) || price < 0) return { ok: false, reason: 'invalid' };
    if (get().isOwned(cardId)) return { ok: false, reason: 'owned' };
    if (price > 0 && !usePetStore.getState().spendCoins(price)) return { ok: false, reason: 'coins' };
    set(state => ({ ownedCards: [...state.ownedCards, { cardId, acquiredAt: new Date().toISOString() }] }));
    get().save();
    return { ok: true };
  },

  grant: cardId => {
    if (!cardId || get().isOwned(cardId)) return false;
    set(state => ({ ownedCards: [...state.ownedCards, { cardId, acquiredAt: new Date().toISOString() }] }));
    get().save();
    return true;
  },

  save: () => {
    dualSave(COLLECTOR_CARD_SQLITE_KEY, COLLECTOR_CARD_LS_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      ownedCards: get().ownedCards,
    }));
  },

  load: async () => {
    const raw = await dualLoad(COLLECTOR_CARD_SQLITE_KEY, COLLECTOR_CARD_LS_KEY);
    if (!raw) { set({ loaded: true }); return; }
    try {
      const data = JSON.parse(raw);
      set({ ownedCards: normalizeOwnedCards(data?.ownedCards), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
