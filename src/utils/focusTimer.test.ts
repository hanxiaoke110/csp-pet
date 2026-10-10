import { describe, expect, it } from 'vitest';
import type { FocusSession } from '../types/focus';
import {
  deriveFocusTiming,
  pauseFocusSession,
  recommendedBreakSeconds,
  reminderThresholdSeconds,
  resumeFocusSession,
  shouldShowFocusReminder,
} from './focusTimer';

const running: FocusSession = {
  id: 's1',
  goal: '完成英语阅读',
  plannedSeconds: 1500,
  startedAt: '2026-10-10T10:00:00.000Z',
  pausedSeconds: 0,
  pauseStartedAt: null,
  status: 'running',
  reminderShown: false,
};

describe('deriveFocusTiming', () => {
  it('derives remaining time from absolute timestamps', () => {
    expect(deriveFocusTiming(running, Date.parse('2026-10-10T10:10:00.000Z')))
      .toEqual({ elapsedSeconds: 600, remainingSeconds: 900, progress: 0.4, completed: false });
  });

  it('freezes elapsed time while paused', () => {
    const paused: FocusSession = {
      ...running,
      status: 'paused',
      pauseStartedAt: '2026-10-10T10:05:00.000Z',
    };
    expect(deriveFocusTiming(paused, Date.parse('2026-10-10T10:20:00.000Z')).elapsedSeconds).toBe(300);
  });

  it('marks elapsed sessions completed and clamps the values', () => {
    expect(deriveFocusTiming(running, Date.parse('2026-10-10T10:30:00.000Z')))
      .toEqual({ elapsedSeconds: 1500, remainingSeconds: 0, progress: 1, completed: true });
  });

  it('never increases remaining time after a system clock rollback', () => {
    expect(deriveFocusTiming(running, Date.parse('2026-10-10T09:55:00.000Z')).remainingSeconds).toBe(1500);
  });

  it('accounts for completed pauses after resuming', () => {
    const resumed = resumeFocusSession({
      ...running,
      status: 'paused',
      pauseStartedAt: '2026-10-10T10:05:00.000Z',
    }, Date.parse('2026-10-10T10:08:00.000Z'));
    expect(resumed.pausedSeconds).toBe(180);
    expect(deriveFocusTiming(resumed, Date.parse('2026-10-10T10:10:00.000Z')).elapsedSeconds).toBe(420);
  });
});

describe('focus session transitions', () => {
  it('pauses and resumes idempotently', () => {
    const paused = pauseFocusSession(running, Date.parse('2026-10-10T10:05:00.000Z'));
    expect(paused.status).toBe('paused');
    expect(pauseFocusSession(paused, Date.parse('2026-10-10T10:06:00.000Z'))).toEqual(paused);
    const resumed = resumeFocusSession(paused, Date.parse('2026-10-10T10:08:00.000Z'));
    expect(resumed).toMatchObject({ status: 'running', pauseStartedAt: null, pausedSeconds: 180 });
    expect(resumeFocusSession(resumed, Date.parse('2026-10-10T10:09:00.000Z'))).toEqual(resumed);
  });
});

describe('focus reminders and breaks', () => {
  it.each([
    [9 * 60, null],
    [15 * 60, 8 * 60],
    [25 * 60, 12 * 60],
    [45 * 60, 15 * 60],
    [90 * 60, 15 * 60],
  ])('uses a child-friendly threshold for %i seconds', (planned, expected) => {
    expect(reminderThresholdSeconds(planned)).toBe(expected);
  });

  it('shows at most one reminder', () => {
    expect(shouldShowFocusReminder(running, Date.parse('2026-10-10T10:11:59.000Z'))).toBe(false);
    expect(shouldShowFocusReminder(running, Date.parse('2026-10-10T10:12:00.000Z'))).toBe(true);
    expect(shouldShowFocusReminder({ ...running, reminderShown: true }, Date.parse('2026-10-10T10:20:00.000Z'))).toBe(false);
  });

  it('suggests five or ten minute breaks without forcing them', () => {
    expect(recommendedBreakSeconds(15 * 60)).toBe(5 * 60);
    expect(recommendedBreakSeconds(25 * 60)).toBe(5 * 60);
    expect(recommendedBreakSeconds(45 * 60)).toBe(10 * 60);
  });
});
