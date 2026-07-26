import { describe, expect, it } from 'vitest';
import {
  collectUnlockedWindowSkins,
  getWindowSkinProgress,
  WINDOW_SKINS,
  type WindowSkinMetrics,
} from './windowSkin';

function metrics(overrides: Partial<WindowSkinMetrics> = {}): WindowSkinMetrics {
  return {
    weeklyCompletions: 0,
    totalCorrect: 0,
    completedCourses: 0,
    freeStreak: 0,
    monthlyReviews: 0,
    defeatedDungeons: new Set(),
    ...overrides,
  };
}

describe('window skin unlocks', () => {
  it('always unlocks the two starter skins', () => {
    expect(collectUnlockedWindowSkins([], metrics())).toEqual(['default', 'academy']);
  });

  it('unlocks learning skins at their exact thresholds', () => {
    const unlocked = collectUnlockedWindowSkins([], metrics({
      weeklyCompletions: 1,
      totalCorrect: 30,
      completedCourses: 5,
      freeStreak: 10,
      monthlyReviews: 1,
    }));
    expect(unlocked).toEqual([
      'default',
      'academy',
      'observatory',
      'crystal',
      'verdant',
      'skyline',
      'cloud',
    ]);
  });

  it('unlocks only the defeated dungeon scene', () => {
    const unlocked = collectUnlockedWindowSkins([], metrics({
      defeatedDungeons: new Set(['dungeon-03']),
    }));
    expect(unlocked).toContain('lingma');
    expect(unlocked).not.toContain('tianji');
    expect(unlocked).not.toContain('qianlong');
  });

  it('keeps a previously unlocked skin permanently', () => {
    expect(collectUnlockedWindowSkins(['cloud'], metrics())).toContain('cloud');
  });

  it('returns clear progress and condition text', () => {
    const crystal = WINDOW_SKINS.find(skin => skin.id === 'crystal');
    expect(crystal).toBeDefined();
    expect(getWindowSkinProgress(crystal!, metrics({ totalCorrect: 18 }))).toEqual({
      current: 18,
      target: 30,
      unlocked: false,
      label: '自由练习累计答对 30 题',
    });
  });
});
