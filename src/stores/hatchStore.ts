import { create } from 'zustand';
import { downloadPetSprites } from '../utils/spriteDownloader';
import { sqliteSetFireAndForget, sqliteGet } from '../lib/sqlite-storage';
import { safeLsSet, safeLsGet } from '../lib/storage';

export type HatchRarity = 'common' | 'rare' | 'legendary';
export type HatchStatus = 'waiting' | 'incubating' | 'ready' | 'failed';

export const HATCH_DURATIONS: Record<HatchRarity, { min: number; max: number }> = {
  common:    { min: 1.5 * 60_000,  max: 3 * 60_000    },  // 1.5 – 3 min
  rare:      { min: 5 * 60_000,    max: 10 * 60_000   },  // 5 – 10 min
  legendary: { min: 10 * 60_000,   max: 20 * 60_000   },  // 10 – 20 min
};

export interface HatchingEgg {
  eggId: string;
  speciesId: string;
  petName: string;
  rarity: HatchRarity;
  startTime: number | null;   // null = not started yet
  duration: number;           // randomized total ms
  status: HatchStatus;
  downloadStatus: 'pending' | 'downloading' | 'done' | 'error';
  downloadProgress: string;
}

interface HatchState {
  eggs: HatchingEgg[];

  // Operations
  addEgg: (speciesId: string, petName: string, rarity: HatchRarity) => HatchingEgg;
  startHatching: (eggId: string) => void;
  checkEggs: () => void;                   // poll — updates ready eggs
  claimEgg: (eggId: string) => HatchingEgg | null;
  retryEgg: (eggId: string) => void;
  removeEgg: (eggId: string) => void;

  // Persistence
  save: () => void;
  load: () => Promise<void>;
}

function randomDuration(rarity: HatchRarity): number {
  const { min, max } = HATCH_DURATIONS[rarity];
  return Math.floor(min + Math.random() * (max - min));
}

const STORAGE_KEY = 'csp_hatch_eggs';

// Shared download logic — used by startHatching and load (app restart recovery)
function resumeDownload(get: () => HatchState, set: (fn: (s: HatchState) => Partial<HatchState>) => void, eggId: string, speciesId: string) {
  set(s => ({
    eggs: s.eggs.map(e =>
      e.eggId === eggId ? { ...e, downloadStatus: 'downloading' as const, downloadProgress: '正在连接...' } : e
    ),
  }));
  downloadPetSprites(speciesId, (phase) => {
    const current = get().eggs.find(e => e.eggId === eggId);
    if (!current || current.downloadStatus === 'done') return;
    if (phase === 'downloading') {
      set(s => ({
        eggs: s.eggs.map(e =>
          e.eggId === eggId ? { ...e, downloadProgress: '下载中...' } : e
        ),
      }));
    }
  }).then(result => {
    const current = get().eggs.find(e => e.eggId === eggId);
    if (!current) return;
    if (result.errors.length === 0) {
      set(s => ({
        eggs: s.eggs.map(e =>
          e.eggId === eggId ? { ...e, downloadStatus: 'done' as const, downloadProgress: '' } : e
        ),
      }));
      get().save();
    } else {
      set(s => ({
        eggs: s.eggs.map(e =>
          e.eggId === eggId ? {
            ...e,
            downloadStatus: 'error' as const,
            downloadProgress: result.errors.join(', '),
          } : e
        ),
      }));
      get().save();
    }
  }).catch(err => {
    const current = get().eggs.find(e => e.eggId === eggId);
    if (!current) return;
    set(s => ({
      eggs: s.eggs.map(e =>
        e.eggId === eggId ? {
          ...e,
          downloadStatus: 'error' as const,
          downloadProgress: String(err).slice(0, 200),
        } : e
      ),
    }));
    get().save();
  });
}

export const useHatchStore = create<HatchState>((set, get) => ({
  eggs: [],

  addEgg: (speciesId, petName, rarity) => {
    const egg: HatchingEgg = {
      eggId: crypto.randomUUID(),
      speciesId,
      petName,
      rarity,
      startTime: null,
      duration: randomDuration(rarity),
      status: 'waiting',
      downloadStatus: 'pending',
      downloadProgress: '',
    };
    set(s => ({ eggs: [...s.eggs, egg] }));
    get().save();
    return egg;
  },

  startHatching: (eggId) => {
    const egg = get().eggs.find(e => e.eggId === eggId);
    if (!egg || egg.status !== 'waiting') return;

    const startTime = Date.now();
    set(s => ({
      eggs: s.eggs.map(e =>
        e.eggId === eggId ? { ...e, startTime, status: 'incubating' as HatchStatus } : e
      ),
    }));
    get().save();

    // Start download in background for rare/legendary (skip workshop — already cached)
    if (egg.rarity !== 'common' && !egg.speciesId.startsWith('workshop-')) {
      resumeDownload(get, set, eggId, egg.speciesId);
    } else {
      // Common pets need no download
      set(s => ({
        eggs: s.eggs.map(e =>
          e.eggId === eggId ? { ...e, downloadStatus: 'done' as const } : e
        ),
      }));
      get().save();
    }
  },

  checkEggs: () => {
    const now = Date.now();
    let changed = false;
    set(s => ({
      eggs: s.eggs.map(e => {
        if (e.status === 'incubating' && e.startTime) {
          const elapsed = now - e.startTime;
          if (elapsed >= e.duration && e.downloadStatus === 'done') {
            changed = true;
            return { ...e, status: 'ready' as HatchStatus };
          }
          // If time's up but download not done, mark as delayed
          if (elapsed >= e.duration && e.downloadStatus === 'downloading') {
            // Keep incubating, download is still going
            return e;
          }
          if (elapsed >= e.duration && e.downloadStatus === 'error') {
            changed = true;
            return { ...e, status: 'failed' as HatchStatus };
          }
        }
        return e;
      }),
    }));
    if (changed) get().save();
  },

  claimEgg: (eggId) => {
    const egg = get().eggs.find(e => e.eggId === eggId);
    if (!egg || egg.status !== 'ready') return null;
    set(s => ({ eggs: s.eggs.filter(e => e.eggId !== eggId) }));
    get().save();
    return egg;
  },

  retryEgg: (eggId) => {
    const egg = get().eggs.find(e => e.eggId === eggId);
    if (!egg || egg.status !== 'failed') return;
    set(s => ({
      eggs: s.eggs.map(e =>
        e.eggId === eggId ? {
          ...e,
          startTime: null,
          duration: randomDuration(e.rarity),
          status: 'waiting' as HatchStatus,
          downloadStatus: 'pending' as const,
          downloadProgress: '',
        } : e
      ),
    }));
    get().save();
    // Auto-start the retry
    get().startHatching(eggId);
  },

  removeEgg: (eggId) => {
    set(s => ({ eggs: s.eggs.filter(e => e.eggId !== eggId) }));
    get().save();
  },

  save: () => {
    try {
      const { eggs } = get();
      const json = JSON.stringify(eggs);
      sqliteSetFireAndForget('hatch_eggs', json);
      safeLsSet(STORAGE_KEY, json); // backup
    } catch { /* quota exceeded or filesystem error */ }
  },

  load: async () => {
    const hydrate = (raw: string | null) => {
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        set({ eggs: data });
        setTimeout(() => {
          get().checkEggs();
          for (const egg of get().eggs) {
            if (egg.status === 'incubating' && egg.rarity !== 'common' && egg.downloadStatus !== 'done') {
              resumeDownload(get, set, egg.eggId, egg.speciesId);
            }
          }
        }, 100);
      }
    };

    // Primary: SQLite
    try {
      const raw = await sqliteGet('hatch_eggs');
      if (raw) { hydrate(raw); return; }
    } catch { /* SQLite unavailable */ }

    // Fallback: localStorage
    try {
      const raw = safeLsGet(STORAGE_KEY, '');
      hydrate(raw || null);
    } catch { /* unrecoverable */ }
  },
}));
