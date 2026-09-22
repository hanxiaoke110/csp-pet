import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, String(value)),
  removeItem: (key: string) => values.delete(key),
});

import { usePetStore } from './petStore';
import { collectStarPathMetrics, STAR_PATH_PROGRESS_KEY, useStarPathStore } from './starPathStore';
import type { StarPathTask } from '../types/starPath';

const task: StarPathTask = {
  id: 'test-correct-10',
  title: '初见锋芒',
  description: '累计答对 10 道题',
  icon: '✦',
  category: 'learning',
  metric: 'quizCorrect',
  target: 10,
  reward: { coins: 30, exp: 20 },
};

describe('starPathStore', () => {
  beforeEach(() => {
    values.clear();
    useStarPathStore.setState({ claimedTaskIds: [], welcomeClaimed: false });
    usePetStore.setState({
      loaded: true,
      activePetId: null,
      coins: 100,
      maxCoinBalance: 100,
      expPool: 0,
      foods: { basic: 1 },
      trainingCampActive: false,
    });
  });

  it('reads lifetime progress from quiz, maze and trial local saves', () => {
    values.set('csp_dungeon_exploration_v1', JSON.stringify({
      schemaVersion: 2,
      maps: {
        a: { sealsSolved: 3, completed: true },
        b: { sealsSolved: 2, completed: false },
      },
    }));
    values.set('dungeon_progress', JSON.stringify([
      { completedStages: 4 },
      { completedStages: 2 },
    ]));
    expect(collectStarPathMetrics({
      totalCorrect: 42,
      totalPractice: 55,
      weeklyCompletions: 3,
      superCompletions: 1,
    })).toEqual({
      quizCorrect: 42,
      quizAnswered: 55,
      weeklyChallenges: 3,
      superChallenges: 1,
      mazeSeals: 5,
      mazeClears: 1,
      trialStages: 6,
    });
  });

  it('never grants a task twice and saves the receipt for backup', () => {
    expect(useStarPathStore.getState().claimTask(task, 9).ok).toBe(false);
    expect(useStarPathStore.getState().claimTask(task, 10).ok).toBe(true);
    expect(usePetStore.getState().coins).toBe(130);
    expect(usePetStore.getState().expPool).toBe(20);
    expect(useStarPathStore.getState().claimTask(task, 99).ok).toBe(false);
    expect(usePetStore.getState().coins).toBe(130);
    expect(JSON.parse(values.get(STAR_PATH_PROGRESS_KEY) || '{}').claimedTaskIds).toEqual([task.id]);
  });

  it('grants the renewal gift once, including local food inventory', () => {
    expect(useStarPathStore.getState().claimWelcomeReward().ok).toBe(true);
    expect(usePetStore.getState()).toMatchObject({ coins: 300, expPool: 100, foods: { basic: 3 } });
    expect(useStarPathStore.getState().claimWelcomeReward().ok).toBe(false);
    expect(usePetStore.getState().coins).toBe(300);
  });

  it('cannot claim rewards before the existing pet save finishes loading', () => {
    usePetStore.setState({ loaded: false });
    expect(useStarPathStore.getState().claimTask(task, 10).ok).toBe(false);
    expect(useStarPathStore.getState().claimWelcomeReward().ok).toBe(false);
    expect(usePetStore.getState().coins).toBe(100);
    expect(values.has(STAR_PATH_PROGRESS_KEY)).toBe(false);

    usePetStore.setState({ loaded: true });
    expect(useStarPathStore.getState().claimTask(task, 10).ok).toBe(true);
    expect(useStarPathStore.getState().claimWelcomeReward().ok).toBe(true);
    expect(usePetStore.getState().coins).toBe(330);
  });
});
