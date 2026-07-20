import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePetStore } from './petStore';
import { useQuizStore } from './quizStore';

function makeLocalStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-20T08:00:00.000Z'));
  vi.stubGlobal('localStorage', makeLocalStorage());
  usePetStore.setState({
    trainingCampActive: false,
    trainingCampEndDate: '',
    trainingCampFoodsClaimed: [],
  });
  useQuizStore.setState({
    lastSuperDate: '',
    superCompletions: 0,
    superBestScore: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('超级挑战次数限制', () => {
  it('普通状态按周限制', () => {
    const quiz = useQuizStore.getState();
    expect(quiz.canDoSuperChallenge()).toBe(true);

    quiz.completeSuperChallenge(4);

    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(false);
  });

  it('集训模式按天限制', () => {
    usePetStore.setState({
      trainingCampActive: true,
      trainingCampEndDate: '2026-07-31',
    });

    const quiz = useQuizStore.getState();
    expect(quiz.canDoSuperChallenge()).toBe(true);

    quiz.completeSuperChallenge(5);
    expect(useQuizStore.getState().lastSuperDate).toBe('2026-07-20');
    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(false);

    vi.setSystemTime(new Date('2026-07-21T08:00:00.000Z'));
    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(true);
  });
});
