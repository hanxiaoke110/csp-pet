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

  it('进阶选手/差一步完美：按正确率 ≥60% / ≥80% 判定', () => {
    // 4/6 ≈ 66.7%：解锁 3/5 档，不解锁 4/5 档
    const a = build(0, 4, 6);
    expect(a.find(x => x.id === 'super-3of5')!.check().unlocked).toBe(true);
    expect(a.find(x => x.id === 'super-4of5')!.check().unlocked).toBe(false);
    // 5/6 ≈ 83.3%：两档都解锁
    const b = build(0, 5, 6);
    expect(b.find(x => x.id === 'super-3of5')!.check().unlocked).toBe(true);
    expect(b.find(x => x.id === 'super-4of5')!.check().unlocked).toBe(true);
    // 2/5 = 40%：都不解锁
    const c = build(0, 2, 5);
    expect(c.find(x => x.id === 'super-3of5')!.check().unlocked).toBe(false);
  });

  it('阶段毕业成就：按课程阶段累计题数判定（25/50/68）', () => {
    const completed: Record<string, string> = {};
    for (let i = 0; i < 68; i++) completed[`lesson-${i}`] = 'completed';
    store['csp_problem_status'] = JSON.stringify(completed);
    const all = build(0, 0, 0);
    expect(all.find(a => a.id === 'stage-c1')!.check().unlocked).toBe(true);
    expect(all.find(a => a.id === 'stage-c2')!.check().unlocked).toBe(true);
    expect(all.find(a => a.id === 'stage-c3')!.check().unlocked).toBe(true);
    expect(all.find(a => a.id === 'stage-c4')!.check().unlocked).toBe(false);
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
