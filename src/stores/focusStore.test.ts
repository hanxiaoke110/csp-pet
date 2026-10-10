import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, String(value)),
  removeItem: (key: string) => values.delete(key),
});

import { usePetStore } from './petStore';
import {
  DEFAULT_FOCUS_SETTINGS,
  FOCUS_LS_KEY,
  applyFocusMiniCommand,
  useFocusStore,
} from './focusStore';
import type { FocusRecord, FocusSession } from '../types/focus';

const at = (iso: string) => Date.parse(iso);

function resetFocus() {
  useFocusStore.setState({
    settings: { ...DEFAULT_FOCUS_SETTINGS },
    activeSession: null,
    records: [],
    archivedDaily: [],
    recentGoals: [],
    loaded: true,
    storageWarning: '',
  });
}

describe('focusStore', () => {
  beforeEach(() => {
    values.clear();
    resetFocus();
    usePetStore.setState({ coins: 1400, expPool: 80 });
  });

  it('starts only with a non-empty goal and 5-120 minutes', () => {
    expect(useFocusStore.getState().start('   ', 25)).toEqual({ ok: false, reason: 'goal' });
    expect(useFocusStore.getState().start('阅读', 4)).toEqual({ ok: false, reason: 'duration' });
    expect(useFocusStore.getState().start('阅读', 121)).toEqual({ ok: false, reason: 'duration' });
    expect(useFocusStore.getState().start('  完成英语阅读  ', 25, at('2026-10-10T10:00:00Z')).ok).toBe(true);
    expect(useFocusStore.getState().activeSession).toMatchObject({ goal: '完成英语阅读', plannedSeconds: 1500, status: 'running' });
  });

  it('pause and resume preserve one session id', () => {
    useFocusStore.getState().start('写数学作业', 25, at('2026-10-10T10:00:00Z'));
    const id = useFocusStore.getState().activeSession!.id;
    expect(useFocusStore.getState().pause(at('2026-10-10T10:05:00Z'))).toBe(true);
    expect(useFocusStore.getState().pause(at('2026-10-10T10:06:00Z'))).toBe(false);
    expect(useFocusStore.getState().resume(at('2026-10-10T10:08:00Z'))).toBe(true);
    expect(useFocusStore.getState().activeSession).toMatchObject({ id, status: 'running', pausedSeconds: 180 });
  });

  it('restores an expired running session into review', async () => {
    values.set(FOCUS_LS_KEY, JSON.stringify({
      savedAt: '2026-10-10T10:00:00Z',
      settings: DEFAULT_FOCUS_SETTINGS,
      activeSession: {
        id: 'expired', goal: '背诵古诗', plannedSeconds: 900,
        startedAt: '2026-10-10T10:00:00Z', pausedSeconds: 0,
        pauseStartedAt: null, status: 'running', reminderShown: false,
      },
      records: [], archivedDaily: [], recentGoals: [],
    }));
    resetFocus();
    await useFocusStore.getState().load(at('2026-10-10T10:20:00Z'));
    expect(useFocusStore.getState().activeSession).toMatchObject({ id: 'expired', status: 'review', endedEarly: false });
  });

  it('saves neutral outcomes without changing pet coins or experience', () => {
    useFocusStore.getState().start('练琴', 15, at('2026-10-10T10:00:00Z'));
    useFocusStore.getState().requestFinish(at('2026-10-10T10:08:00Z'));
    expect(useFocusStore.getState().saveReview('partial', at('2026-10-10T10:08:00Z'))).toBe(true);
    expect(useFocusStore.getState().records[0]).toMatchObject({ goal: '练琴', focusedSeconds: 480, outcome: 'partial', endedEarly: true });
    expect(usePetStore.getState()).toMatchObject({ coins: 1400, expPool: 80 });
  });

  it('can discard a short or unwanted review without creating a record', () => {
    useFocusStore.getState().start('整理书包', 15, at('2026-10-10T10:00:00Z'));
    useFocusStore.getState().requestFinish(at('2026-10-10T10:00:30Z'));
    expect(useFocusStore.getState().discardReview()).toBe(true);
    expect(useFocusStore.getState()).toMatchObject({ activeSession: null, records: [] });
  });

  it('keeps recent detail bounded and archives older daily totals', async () => {
    const records: FocusRecord[] = Array.from({ length: 181 }, (_, index) => ({
      id: `r-${index}`,
      goal: `目标 ${index}`,
      plannedSeconds: 1500,
      focusedSeconds: 600,
      startedAt: new Date(Date.UTC(2026, 8, 1 + index, 10)).toISOString(),
      endedAt: new Date(Date.UTC(2026, 8, 1 + index, 10, 10)).toISOString(),
      outcome: 'completed',
      endedEarly: false,
    }));
    values.set(FOCUS_LS_KEY, JSON.stringify({
      savedAt: new Date().toISOString(), settings: DEFAULT_FOCUS_SETTINGS,
      activeSession: null, records, archivedDaily: [], recentGoals: [],
    }));
    resetFocus();
    await useFocusStore.getState().load();
    expect(useFocusStore.getState().records).toHaveLength(180);
    expect(useFocusStore.getState().archivedDaily.reduce((sum, day) => sum + day.sessions, 0)).toBe(1);
  });

  it('clears records without changing settings', () => {
    useFocusStore.setState({
      settings: { ...DEFAULT_FOCUS_SETTINGS, miniWindowEnabled: false },
      records: [{
        id: 'r1', goal: '阅读', plannedSeconds: 900, focusedSeconds: 900,
        startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:15:00Z',
        outcome: 'completed', endedEarly: false,
      }],
    });
    useFocusStore.getState().clearHistory();
    expect(useFocusStore.getState().records).toEqual([]);
    expect(useFocusStore.getState().settings.miniWindowEnabled).toBe(false);
  });
});

describe('focus mini command reducer', () => {
  const session: FocusSession = {
    id: 'active', goal: '阅读', plannedSeconds: 1500,
    startedAt: '2026-10-10T10:00:00Z', pausedSeconds: 0,
    pauseStartedAt: null, status: 'running', reminderShown: false,
  };

  it('ignores stale session ids and repeated commands', () => {
    expect(applyFocusMiniCommand(session, { type: 'pause', sessionId: 'stale' }, at('2026-10-10T10:05:00Z'))).toBe(session);
    const paused = applyFocusMiniCommand(session, { type: 'pause', sessionId: 'active' }, at('2026-10-10T10:05:00Z'))!;
    expect(paused.status).toBe('paused');
    expect(applyFocusMiniCommand(paused, { type: 'pause', sessionId: 'active' }, at('2026-10-10T10:06:00Z'))).toBe(paused);
  });
});
