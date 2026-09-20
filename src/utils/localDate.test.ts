import { beforeEach, describe, expect, it } from 'vitest';
import { learnedToday, localDateKey, markLearningActivity } from './localDate';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
});

describe('local date activity', () => {
  it('uses the device calendar date instead of UTC slicing', () => {
    const date = new Date(2026, 8, 21, 0, 30, 0);
    expect(localDateKey(date)).toBe('2026-09-21');
  });

  it('records and reads a learning activity for the same local day', () => {
    const date = new Date(2026, 8, 21, 8, 0, 0);
    markLearningActivity(date);
    expect(learnedToday(date)).toBe(true);
    expect(learnedToday(new Date(2026, 8, 22, 8, 0, 0))).toBe(false);
  });
});
