export type FocusStatus = 'running' | 'paused' | 'review';
export type FocusOutcome = 'completed' | 'partial' | 'continue';

export interface FocusSettings {
  defaultMinutes: number;
  miniWindowEnabled: boolean;
  gentleReminderEnabled: boolean;
  endSoundEnabled: boolean;
}

export interface FocusSession {
  id: string;
  goal: string;
  plannedSeconds: number;
  startedAt: string;
  pausedSeconds: number;
  pauseStartedAt: string | null;
  status: FocusStatus;
  reminderShown: boolean;
  endedEarly?: boolean;
  finishedAt?: string;
}

export interface FocusRecord {
  id: string;
  goal: string;
  plannedSeconds: number;
  focusedSeconds: number;
  startedAt: string;
  endedAt: string;
  outcome: FocusOutcome;
  endedEarly: boolean;
}

export interface FocusDailyAggregate {
  date: string;
  focusedSeconds: number;
  sessions: number;
}

export interface FocusSnapshot {
  savedAt: string;
  settings: FocusSettings;
  activeSession: FocusSession | null;
  records: FocusRecord[];
  archivedDaily: FocusDailyAggregate[];
  recentGoals: string[];
}

export interface FocusTiming {
  elapsedSeconds: number;
  remainingSeconds: number;
  progress: number;
  completed: boolean;
}

export type FocusMiniCommand =
  | { type: 'pause'; sessionId: string }
  | { type: 'resume'; sessionId: string }
  | { type: 'finish'; sessionId: string }
  | { type: 'open'; sessionId: string }
  | { type: 'hide'; sessionId: string };

export interface FocusMiniSnapshot {
  session: FocusSession | null;
  settings: FocusSettings;
  reminderText?: string;
}
