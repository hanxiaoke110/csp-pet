import { create } from 'zustand';
import type { ExplorationMapDefinition, ExplorationProgress, ExplorationRouteChoice, GridPoint } from '../types/exploration';
import { computeVisible, pointKey } from '../utils/explorationLogic';

const STORAGE_KEY = 'csp_dungeon_exploration_v1';

interface ExplorationSaveCollection {
  schemaVersion: 2;
  maps: Record<string, ExplorationProgress>;
}

interface ExplorationState {
  current: ExplorationProgress | null;
  load: (map: ExplorationMapDefinition, questionIds: string[]) => void;
  move: (map: ExplorationMapDefinition, position: GridPoint) => void;
  resolveEvent: (eventId: string, update?: Partial<Pick<ExplorationProgress, 'sealsSolved' | 'sealsWrong' | 'pendingCoins' | 'pendingExp' | 'activeDebuffs'>>) => void;
  previewEvent: (eventId: string) => void;
  chooseRoute: (choice: ExplorationRouteChoice) => void;
  clearDebuff: (debuffId: string) => boolean;
  markCompleted: () => void;
  markSettled: (coins: number, exp: number) => void;
  reset: (map: ExplorationMapDefinition, questionIds: string[]) => void;
}

function normalizeProgress(parsed: ExplorationProgress | null): ExplorationProgress | null {
  if (!parsed || parsed.schemaVersion !== 1 || !parsed.mapId) return null;
  if (!parsed.position || !Array.isArray(parsed.revealed) || !Array.isArray(parsed.resolvedEventIds)) return null;
  return {
    ...parsed,
    activeDebuffs: Array.isArray(parsed.activeDebuffs) ? parsed.activeDebuffs.filter(item => typeof item === 'string') : [],
    previewedEventIds: Array.isArray(parsed.previewedEventIds) ? parsed.previewedEventIds.filter(item => typeof item === 'string') : [],
  };
}

function readCollection(): ExplorationSaveCollection {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as ExplorationSaveCollection | ExplorationProgress | null;
    if (parsed && 'maps' in parsed && parsed.schemaVersion === 2 && parsed.maps && typeof parsed.maps === 'object') {
      const maps = Object.fromEntries(Object.entries(parsed.maps)
        .map(([id, progress]) => [id, normalizeProgress(progress)])
        .filter((entry): entry is [string, ExplorationProgress] => Boolean(entry[1])));
      return { schemaVersion: 2, maps };
    }
    const legacy = normalizeProgress(parsed as ExplorationProgress | null);
    return { schemaVersion: 2, maps: legacy ? { [legacy.mapId]: legacy } : {} };
  } catch {
    return { schemaVersion: 2, maps: {} };
  }
}

function readProgress(mapId: string): ExplorationProgress | null {
  return readCollection().maps[mapId] || null;
}

function persist(current: ExplorationProgress | null): void {
  try {
    if (!current) return;
    const collection = readCollection();
    collection.maps[current.mapId] = current;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  } catch { /* exploration remains playable for this session */ }
}

function freshProgress(map: ExplorationMapDefinition, questionIds: string[]): ExplorationProgress {
  return {
    schemaVersion: 1,
    mapId: map.id,
    position: map.start,
    revealed: [...computeVisible(map, map.start)].sort(),
    resolvedEventIds: [],
    questionIds,
    sealsSolved: 0,
    sealsWrong: 0,
    steps: 0,
    pendingCoins: 0,
    pendingExp: 0,
    activeDebuffs: [],
    previewedEventIds: [],
    completed: false,
    settled: false,
    startedAt: Date.now(),
  };
}

export const useExplorationStore = create<ExplorationState>((set, get) => ({
  current: null,
  load: (map, questionIds) => {
    const saved = readProgress(map.id);
    const current = saved || freshProgress(map, questionIds);
    set({ current });
    persist(current);
  },
  move: (map, position) => {
    const current = get().current;
    if (!current || current.completed || map.tiles[position.y]?.[position.x] !== 0) return;
    const revealed = new Set(current.revealed);
    for (const key of computeVisible(map, position)) revealed.add(key);
    const next = { ...current, position, steps: current.steps + 1, revealed: [...revealed].sort() };
    set({ current: next });
    persist(next);
  },
  resolveEvent: (eventId, update = {}) => {
    const current = get().current;
    if (!current || current.resolvedEventIds.includes(eventId)) return;
    const next = {
      ...current,
      ...update,
      resolvedEventIds: [...current.resolvedEventIds, eventId],
    };
    set({ current: next });
    persist(next);
  },
  previewEvent: (eventId) => {
    const current = get().current;
    if (!current || current.previewedEventIds.includes(eventId)) return;
    const next = { ...current, previewedEventIds: [...current.previewedEventIds, eventId] };
    set({ current: next });
    persist(next);
  },
  chooseRoute: (choice) => {
    const current = get().current;
    if (!current || current.routeChoice) return;
    const next = { ...current, routeChoice: choice };
    set({ current: next });
    persist(next);
  },
  clearDebuff: (debuffId) => {
    const current = get().current;
    if (!current || !current.activeDebuffs.includes(debuffId)) return false;
    const next = { ...current, activeDebuffs: current.activeDebuffs.filter(item => item !== debuffId) };
    set({ current: next });
    persist(next);
    return true;
  },
  markCompleted: () => {
    const current = get().current;
    if (!current) return;
    const next = { ...current, completed: true };
    set({ current: next });
    persist(next);
  },
  markSettled: (coins, exp) => {
    const current = get().current;
    if (!current || current.settled) return;
    const next = {
      ...current,
      settled: true,
      settledCoins: Math.max(0, Number(coins) || 0),
      settledExp: Math.max(0, Number(exp) || 0),
    };
    set({ current: next });
    persist(next);
  },
  reset: (map, questionIds) => {
    const current = freshProgress(map, questionIds);
    set({ current });
    persist(current);
  },
}));

export function hasFinishedFirstExploration(): boolean {
  return hasFinishedExploration('season-2:dungeon-01:stage-01');
}

export function getExplorationProgress(mapId: string): ExplorationProgress | null {
  return readProgress(mapId);
}

export function hasFinishedExploration(mapId: string): boolean {
  try {
    return Boolean(readProgress(mapId)?.completed);
  } catch {
    return false;
  }
}

export function isExplorationPointRevealed(progress: ExplorationProgress, point: GridPoint): boolean {
  return progress.revealed.includes(pointKey(point));
}
