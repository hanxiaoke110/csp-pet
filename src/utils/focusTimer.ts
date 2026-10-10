import type { FocusSession, FocusTiming } from '../types/focus';

function safeTime(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safePlannedSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function deriveFocusTiming(session: FocusSession, nowMs = Date.now()): FocusTiming {
  const plannedSeconds = safePlannedSeconds(session.plannedSeconds);
  const startedAt = safeTime(session.startedAt, nowMs);
  const effectiveNow = session.status === 'paused'
    ? safeTime(session.pauseStartedAt, nowMs)
    : session.status === 'review'
      ? safeTime(session.finishedAt, nowMs)
      : nowMs;
  const elapsedMs = Math.max(0, effectiveNow - startedAt);
  const pausedSeconds = Math.max(0, Number.isFinite(session.pausedSeconds) ? session.pausedSeconds : 0);
  const elapsedSeconds = Math.min(plannedSeconds, Math.max(0, Math.floor(elapsedMs / 1000) - Math.floor(pausedSeconds)));
  const remainingSeconds = Math.max(0, plannedSeconds - elapsedSeconds);
  const completed = session.status === 'review' || (plannedSeconds > 0 && remainingSeconds === 0);
  const progress = plannedSeconds > 0 ? elapsedSeconds / plannedSeconds : 0;
  return { elapsedSeconds, remainingSeconds, progress, completed };
}

export function pauseFocusSession(session: FocusSession, atMs = Date.now()): FocusSession {
  if (session.status !== 'running') return session;
  return {
    ...session,
    status: 'paused',
    pauseStartedAt: new Date(atMs).toISOString(),
  };
}

export function resumeFocusSession(session: FocusSession, atMs = Date.now()): FocusSession {
  if (session.status !== 'paused') return session;
  const pausedAt = safeTime(session.pauseStartedAt, atMs);
  const addedPauseSeconds = Math.max(0, Math.floor((atMs - pausedAt) / 1000));
  return {
    ...session,
    status: 'running',
    pausedSeconds: Math.max(0, session.pausedSeconds) + addedPauseSeconds,
    pauseStartedAt: null,
  };
}

export function reminderThresholdSeconds(plannedSeconds: number): number | null {
  const planned = safePlannedSeconds(plannedSeconds);
  if (planned < 10 * 60) return null;
  if (planned <= 20 * 60) return 8 * 60;
  if (planned <= 30 * 60) return 12 * 60;
  return 15 * 60;
}

export function shouldShowFocusReminder(session: FocusSession, nowMs = Date.now()): boolean {
  if (session.reminderShown || session.status !== 'running') return false;
  const threshold = reminderThresholdSeconds(session.plannedSeconds);
  if (threshold === null) return false;
  const timing = deriveFocusTiming(session, nowMs);
  return !timing.completed && timing.elapsedSeconds >= threshold;
}

export function recommendedBreakSeconds(plannedSeconds: number): number {
  return safePlannedSeconds(plannedSeconds) >= 45 * 60 ? 10 * 60 : 5 * 60;
}
