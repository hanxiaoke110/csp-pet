import { beforeEach, describe, expect, it } from 'vitest';

import { createAchievements } from './achievements';

let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  };
});

function build(weeklyPerfects = 0, superBestScore = 0, superBestTotal = 0) {
  return createAchievements(
    1, 1, 0, 0, 0, false,
    1, superBestScore, superBestTotal,
    weeklyPerfects, 0, 0, 0, [],
  );
}

describe('成就判定', () => {
  it('完美首秀：周常 5/5 全对（weeklyPerfects>=1）解锁', () => {
    store['csp_quiz_state'] = JSON.stringify({ weeklyPerfects: 1 });
    expect(build().find(a => a.id === 'quiz-perfect-1')!.check().unlocked).toBe(true);

    store['csp_quiz_state'] = JSON.stringify({ weeklyPerfects: 0 });
    expect(build().find(a => a.id === 'quiz-perfect-1')!.check().unlocked).toBe(false);
  });

  it('完美通关：5/5、6/6 解锁，5/6 不算全对不解锁', () => {
    expect(build(0, 5, 5).find(a => a.id === 'super-5of5')!.check().unlocked).toBe(true);
    expect(build(0, 6, 6).find(a => a.id === 'super-5of5')!.check().unlocked).toBe(true);
    expect(build(0, 5, 6).find(a => a.id === 'super-5of5')!.check().unlocked).toBe(false);
  });

  it('双料冠军：超级完美 + 周常完美各 1 次才解锁', () => {
    store['csp_quiz_state'] = JSON.stringify({ weeklyPerfects: 1 });
    expect(build(1, 5, 5).find(a => a.id === 'super-double')!.check().unlocked).toBe(true);
    // 超级 5/6 不算完美
    expect(build(1, 5, 6).find(a => a.id === 'super-double')!.check().unlocked).toBe(false);
    // 周常没全对
    store['csp_quiz_state'] = JSON.stringify({ weeklyPerfects: 0 });
    expect(build(0, 5, 5).find(a => a.id === 'super-double')!.check().unlocked).toBe(false);
  });
});
