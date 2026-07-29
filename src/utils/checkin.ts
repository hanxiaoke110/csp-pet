export interface CheckinRecord {
  week: string;
  streak: number;
  tip?: unknown;
}

export function getWeekKey(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${week}`;
}

export function getPreviousWeekKey(date = new Date()): string {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 7);
  return getWeekKey(previous);
}

export function loadCheckin(): CheckinRecord {
  try {
    return JSON.parse(localStorage.getItem('csp_checkin') || '{}');
  } catch {
    return { week: '', streak: 0 };
  }
}

/** A streak only continues when the preceding ISO week was checked in. */
export function nextCheckin(): { alreadyChecked: boolean; week: string; streak: number } {
  const week = getWeekKey();
  const previousWeek = getPreviousWeekKey();
  const existing = loadCheckin();
  if (existing.week === week) return { alreadyChecked: true, week, streak: existing.streak || 0 };
  return {
    alreadyChecked: false,
    week,
    streak: existing.week === previousWeek ? (existing.streak || 0) + 1 : 1,
  };
}
