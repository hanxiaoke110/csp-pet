export const LEARNING_ACTIVITY_DATE_KEY = 'csp_last_learning_activity_date';

/** 使用设备本地时区生成 YYYY-MM-DD，避免北京时间凌晨被记到前一天。 */
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function markLearningActivity(date = new Date()): void {
  try { localStorage.setItem(LEARNING_ACTIVITY_DATE_KEY, localDateKey(date)); } catch {}
}

export function learnedToday(date = new Date()): boolean {
  try { return localStorage.getItem(LEARNING_ACTIVITY_DATE_KEY) === localDateKey(date); }
  catch { return false; }
}
