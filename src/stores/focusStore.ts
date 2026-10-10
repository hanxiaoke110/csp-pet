import { create } from 'zustand';
import { dualLoad, dualSave } from '../lib/persist';
import type {
  FocusDailyAggregate,
  FocusMiniCommand,
  FocusOutcome,
  FocusRecord,
  FocusSession,
  FocusSettings,
  FocusSnapshot,
} from '../types/focus';
import {
  deriveFocusTiming,
  pauseFocusSession,
  resumeFocusSession,
  shouldShowFocusReminder,
} from '../utils/focusTimer';
import { localDateKey } from '../utils/localDate';

export const FOCUS_LS_KEY = 'csp_focus_data';
export const FOCUS_SQLITE_KEY = 'focus_data';
export const MAX_FOCUS_RECORDS = 180;

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  defaultMinutes: 25,
  miniWindowEnabled: true,
  gentleReminderEnabled: true,
  endSoundEnabled: true,
};

type StartResult = { ok: true; sessionId: string } | { ok: false; reason: 'goal' | 'duration' | 'active' };
export type FocusTickResult = 'reminder' | 'completed' | null;

interface FocusState {
  settings: FocusSettings;
  activeSession: FocusSession | null;
  records: FocusRecord[];
  archivedDaily: FocusDailyAggregate[];
  recentGoals: string[];
  loaded: boolean;
  storageWarning: string;
  start: (goal: string, minutes: number, nowMs?: number) => StartResult;
  pause: (nowMs?: number) => boolean;
  resume: (nowMs?: number) => boolean;
  requestFinish: (nowMs?: number) => boolean;
  completeNaturally: (nowMs?: number) => boolean;
  saveReview: (outcome: FocusOutcome, nowMs?: number) => boolean;
  discardReview: () => boolean;
  tick: (nowMs?: number) => FocusTickResult;
  updateSettings: (next: Partial<FocusSettings>) => void;
  clearHistory: () => void;
  save: () => void;
  load: (nowMs?: number) => Promise<void>;
}

function finiteInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function validIso(value: unknown, fallback = new Date(0).toISOString()): string {
  const text = typeof value === 'string' ? value : '';
  return Number.isFinite(Date.parse(text)) ? text : fallback;
}

function normalizeSettings(value: unknown): FocusSettings {
  const data = value && typeof value === 'object' ? value as Partial<FocusSettings> : {};
  return {
    defaultMinutes: finiteInt(data.defaultMinutes, DEFAULT_FOCUS_SETTINGS.defaultMinutes, 5, 120),
    miniWindowEnabled: typeof data.miniWindowEnabled === 'boolean' ? data.miniWindowEnabled : true,
    gentleReminderEnabled: typeof data.gentleReminderEnabled === 'boolean' ? data.gentleReminderEnabled : true,
    endSoundEnabled: typeof data.endSoundEnabled === 'boolean' ? data.endSoundEnabled : true,
  };
}

function normalizeSession(value: unknown): FocusSession | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<FocusSession>;
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  const goal = typeof data.goal === 'string' ? data.goal.trim().slice(0, 60) : '';
  const status = data.status === 'paused' || data.status === 'review' ? data.status : 'running';
  const startedAt = validIso(data.startedAt, '');
  if (!id || !goal || !startedAt) return null;
  return {
    id,
    goal,
    plannedSeconds: finiteInt(data.plannedSeconds, 25 * 60, 5 * 60, 120 * 60),
    startedAt,
    pausedSeconds: finiteInt(data.pausedSeconds, 0, 0, 30 * 24 * 60 * 60),
    pauseStartedAt: data.pauseStartedAt ? validIso(data.pauseStartedAt, '') || null : null,
    status,
    reminderShown: Boolean(data.reminderShown),
    endedEarly: typeof data.endedEarly === 'boolean' ? data.endedEarly : undefined,
    finishedAt: data.finishedAt ? validIso(data.finishedAt, '') || undefined : undefined,
  };
}

function normalizeRecord(value: unknown): FocusRecord | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<FocusRecord>;
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  const goal = typeof data.goal === 'string' ? data.goal.trim().slice(0, 60) : '';
  const outcome = data.outcome === 'partial' || data.outcome === 'continue' ? data.outcome : 'completed';
  const startedAt = validIso(data.startedAt, '');
  const endedAt = validIso(data.endedAt, '');
  if (!id || !goal || !startedAt || !endedAt) return null;
  return {
    id,
    goal,
    plannedSeconds: finiteInt(data.plannedSeconds, 25 * 60, 5 * 60, 120 * 60),
    focusedSeconds: finiteInt(data.focusedSeconds, 0, 0, 120 * 60),
    startedAt,
    endedAt,
    outcome,
    endedEarly: Boolean(data.endedEarly),
  };
}

function normalizeAggregates(value: unknown): FocusDailyAggregate[] {
  if (!Array.isArray(value)) return [];
  const byDate = new Map<string, FocusDailyAggregate>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<FocusDailyAggregate>;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))) continue;
    const date = String(item.date);
    const existing = byDate.get(date) || { date, focusedSeconds: 0, sessions: 0 };
    existing.focusedSeconds += finiteInt(item.focusedSeconds, 0, 0, 365 * 24 * 60 * 60);
    existing.sessions += finiteInt(item.sessions, 0, 0, 100_000);
    byDate.set(date, existing);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function compactRecords(records: FocusRecord[], archived: FocusDailyAggregate[]) {
  const sorted = [...records].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
  const recent = sorted.slice(0, MAX_FOCUS_RECORDS);
  const old = sorted.slice(MAX_FOCUS_RECORDS);
  const byDate = new Map(normalizeAggregates(archived).map(item => [item.date, { ...item }]));
  for (const record of old) {
    const date = localDateKey(new Date(record.endedAt));
    const item = byDate.get(date) || { date, focusedSeconds: 0, sessions: 0 };
    item.focusedSeconds += record.focusedSeconds;
    item.sessions += 1;
    byDate.set(date, item);
  }
  return {
    records: recent,
    archivedDaily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function normalizeRecentGoals(value: unknown, records: FocusRecord[]): string[] {
  const source = Array.isArray(value) ? value : records.map(record => record.goal);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of source) {
    const goal = String(raw || '').trim().slice(0, 60);
    if (!goal || seen.has(goal)) continue;
    seen.add(goal);
    result.push(goal);
    if (result.length >= 6) break;
  }
  return result;
}

function newSessionId(nowMs: number): string {
  try { return crypto.randomUUID(); }
  catch { return `focus-${nowMs}-${Math.random().toString(36).slice(2, 9)}`; }
}

function finishSession(session: FocusSession, atMs: number, endedEarly: boolean): FocusSession {
  const resumed = session.status === 'paused' ? resumeFocusSession(session, atMs) : session;
  if (resumed.status === 'review') return resumed;
  return {
    ...resumed,
    status: 'review',
    pauseStartedAt: null,
    endedEarly,
    finishedAt: new Date(atMs).toISOString(),
  };
}

export function applyFocusMiniCommand(session: FocusSession | null, command: FocusMiniCommand, nowMs = Date.now()): FocusSession | null {
  if (!session || session.id !== command.sessionId) return session;
  if (command.type === 'pause') return pauseFocusSession(session, nowMs);
  if (command.type === 'resume') return resumeFocusSession(session, nowMs);
  if (command.type === 'finish') return finishSession(session, nowMs, true);
  return session;
}

export const useFocusStore = create<FocusState>((set, get) => ({
  settings: { ...DEFAULT_FOCUS_SETTINGS },
  activeSession: null,
  records: [],
  archivedDaily: [],
  recentGoals: [],
  loaded: false,
  storageWarning: '',

  start: (rawGoal, rawMinutes, nowMs = Date.now()) => {
    if (get().activeSession) return { ok: false, reason: 'active' };
    const goal = rawGoal.trim().slice(0, 60);
    if (!goal) return { ok: false, reason: 'goal' };
    const minutes = Number(rawMinutes);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 120) return { ok: false, reason: 'duration' };
    const sessionId = newSessionId(nowMs);
    const activeSession: FocusSession = {
      id: sessionId,
      goal,
      plannedSeconds: Math.round(minutes * 60),
      startedAt: new Date(nowMs).toISOString(),
      pausedSeconds: 0,
      pauseStartedAt: null,
      status: 'running',
      reminderShown: false,
    };
    const recentGoals = [goal, ...get().recentGoals.filter(item => item !== goal)].slice(0, 6);
    set({ activeSession, recentGoals });
    get().save();
    return { ok: true, sessionId };
  },

  pause: (nowMs = Date.now()) => {
    const current = get().activeSession;
    if (!current || current.status !== 'running') return false;
    set({ activeSession: pauseFocusSession(current, nowMs) });
    get().save();
    return true;
  },

  resume: (nowMs = Date.now()) => {
    const current = get().activeSession;
    if (!current || current.status !== 'paused') return false;
    set({ activeSession: resumeFocusSession(current, nowMs) });
    get().save();
    return true;
  },

  requestFinish: (nowMs = Date.now()) => {
    const current = get().activeSession;
    if (!current || current.status === 'review') return false;
    set({ activeSession: finishSession(current, nowMs, true) });
    get().save();
    return true;
  },

  completeNaturally: (nowMs = Date.now()) => {
    const current = get().activeSession;
    if (!current || current.status === 'review') return false;
    if (!deriveFocusTiming(current, nowMs).completed) return false;
    set({ activeSession: finishSession(current, nowMs, false) });
    get().save();
    return true;
  },

  saveReview: (outcome, nowMs = Date.now()) => {
    const current = get().activeSession;
    if (!current || current.status !== 'review') return false;
    const finishedAt = current.finishedAt || new Date(nowMs).toISOString();
    const focusedSeconds = deriveFocusTiming({ ...current, finishedAt }, Date.parse(finishedAt)).elapsedSeconds;
    if (focusedSeconds < 60) return false;
    const record: FocusRecord = {
      id: current.id,
      goal: current.goal,
      plannedSeconds: current.plannedSeconds,
      focusedSeconds,
      startedAt: current.startedAt,
      endedAt: finishedAt,
      outcome,
      endedEarly: Boolean(current.endedEarly),
    };
    const compacted = compactRecords([record, ...get().records], get().archivedDaily);
    set({ activeSession: null, ...compacted });
    get().save();
    return true;
  },

  discardReview: () => {
    if (!get().activeSession || get().activeSession?.status !== 'review') return false;
    set({ activeSession: null });
    get().save();
    return true;
  },

  tick: (nowMs = Date.now()) => {
    const current = get().activeSession;
    if (!current || current.status !== 'running') return null;
    if (deriveFocusTiming(current, nowMs).completed) {
      set({ activeSession: finishSession(current, nowMs, false) });
      get().save();
      return 'completed';
    }
    if (get().settings.gentleReminderEnabled && shouldShowFocusReminder(current, nowMs)) {
      set({ activeSession: { ...current, reminderShown: true } });
      get().save();
      return 'reminder';
    }
    return null;
  },

  updateSettings: next => {
    set({ settings: normalizeSettings({ ...get().settings, ...next }) });
    get().save();
  },

  clearHistory: () => {
    set({ records: [], archivedDaily: [], recentGoals: [] });
    get().save();
  },

  save: () => {
    const state = get();
    const compacted = compactRecords(state.records, state.archivedDaily);
    const snapshot: FocusSnapshot = {
      savedAt: new Date().toISOString(),
      settings: state.settings,
      activeSession: state.activeSession,
      records: compacted.records,
      archivedDaily: compacted.archivedDaily,
      recentGoals: state.recentGoals,
    };
    try {
      dualSave(FOCUS_SQLITE_KEY, FOCUS_LS_KEY, JSON.stringify(snapshot));
      if (state.storageWarning) set({ storageWarning: '' });
    } catch {
      set({ storageWarning: '本次专注记录可能无法保存，请稍后重试' });
    }
  },

  load: async (nowMs = Date.now()) => {
    const raw = await dualLoad(FOCUS_SQLITE_KEY, FOCUS_LS_KEY);
    if (!raw) {
      set({ loaded: true });
      return;
    }
    try {
      const data = JSON.parse(raw) as Partial<FocusSnapshot>;
      const normalizedRecords = Array.isArray(data.records)
        ? data.records.map(normalizeRecord).filter((item): item is FocusRecord => Boolean(item))
        : [];
      const compacted = compactRecords(normalizedRecords, normalizeAggregates(data.archivedDaily));
      let activeSession = normalizeSession(data.activeSession);
      if (activeSession?.status === 'running' && deriveFocusTiming(activeSession, nowMs).completed) {
        activeSession = finishSession(activeSession, nowMs, false);
      }
      set({
        settings: normalizeSettings(data.settings),
        activeSession,
        ...compacted,
        recentGoals: normalizeRecentGoals(data.recentGoals, compacted.records),
        loaded: true,
        storageWarning: '',
      });
      if (activeSession?.status === 'review' && !data.activeSession?.finishedAt) get().save();
    } catch {
      set({ loaded: true, storageWarning: '专注记录读取失败，已使用空白记录' });
    }
  },
}));
