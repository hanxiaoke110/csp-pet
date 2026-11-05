import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePetStore } from './petStore';
import { useQuizStore } from './quizStore';
import { flushSqliteWrites } from '../lib/sqlite-storage';

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

afterEach(async () => {
  try {
    // save() mirrors asynchronously; keep this test's storage alive until its
    // queued writes settle rather than leaking them into another test/teardown.
    await flushSqliteWrites();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

describe('超级挑战次数限制', () => {
  it('普通状态按周限制', () => {
    const quiz = useQuizStore.getState();
    expect(quiz.canDoSuperChallenge()).toBe(true);

    quiz.completeSuperChallenge(4);

    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(false);
  });

  it('旧集训状态不能将超级挑战改成每日领取', () => {
    usePetStore.setState({
      trainingCampActive: true,
      trainingCampEndDate: '2026-07-31',
    });

    const quiz = useQuizStore.getState();
    expect(quiz.canDoSuperChallenge()).toBe(true);

    quiz.completeSuperChallenge(5);
    expect(useQuizStore.getState().lastSuperDate).toMatch(/-W\d+$/);
    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(false);

    vi.setSystemTime(new Date('2026-07-21T08:00:00.000Z'));
    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(false);
  });

  it('保留旧集训按日记录的本周完成状态', () => {
    useQuizStore.setState({ lastSuperDate: '2026-07-20' });
    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(false);
    vi.setSystemTime(new Date('2026-07-21T08:00:00.000Z'));
    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(false);
    vi.setSystemTime(new Date('2026-07-28T08:00:00.000Z'));
    expect(useQuizStore.getState().canDoSuperChallenge()).toBe(true);
  });
});

describe('月度复盘奖励与随时学习分离', () => {
  const error = { questionId: 'wrong-1', wrongAnswer: 1, correctAnswer: 0, attempts: 1, date: '2026-07-20' };
  beforeEach(() => {
    useQuizStore.setState({ errors: [error], lastReviewDate: '', weeklyCompletions: 0,
      reviewRewardMonth: '', reviewRewardCoins: 0, reviewRewardExp: 0 });
  });

  it('未满足周任务条件时不能开启奖励复盘', () => {
    expect(useQuizStore.getState().beginMonthlyReview()).toBeNull();
    expect(useQuizStore.getState().claimMonthlyReviewReward('2026-07', 15, 20)).toEqual({ coins: 0, exp: 0 });
  });

  it('月末仍可开启，已完成月份及无错题不能重复开启', () => {
    vi.setSystemTime(new Date('2026-07-30T08:00:00Z'));
    expect(useQuizStore.getState().beginMonthlyReview()).toBe('2026-07');
    useQuizStore.getState().completeMonthlyReview(1, 1);
    expect(useQuizStore.getState().beginMonthlyReview()).toBeNull();
    expect(useQuizStore.getState().claimMonthlyReviewReward('2026-07', 15, 20)).toEqual({ coins: 0, exp: 0 });
    useQuizStore.setState({ errors: [], lastReviewDate: '', weeklyCompletions: 2 });
    expect(useQuizStore.getState().beginMonthlyReview()).toBeNull();
  });

  it('重开复盘共享同月奖励封顶，跨月旧会话不能领奖', () => {
    useQuizStore.setState({ weeklyCompletions: 2 });
    const month = useQuizStore.getState().beginMonthlyReview()!;
    expect(useQuizStore.getState().claimMonthlyReviewReward(month, 290, 390)).toEqual({ coins: 290, exp: 390 });
    expect(useQuizStore.getState().beginMonthlyReview()).toBe(month);
    expect(useQuizStore.getState().claimMonthlyReviewReward(month, 15, 20)).toEqual({ coins: 10, exp: 10 });
    expect(useQuizStore.getState().claimMonthlyReviewReward(month, 15, 20)).toEqual({ coins: 0, exp: 0 });
    const saved = JSON.parse(localStorage.getItem('csp_quiz_state')!);
    expect(saved).toMatchObject({ reviewRewardMonth: month, reviewRewardCoins: 300, reviewRewardExp: 400 });
    vi.setSystemTime(new Date('2026-08-01T08:00:00Z'));
    expect(useQuizStore.getState().claimMonthlyReviewReward(month, 15, 20)).toEqual({ coins: 0, exp: 0 });
  });

  it('展开旧父题错题后，掌握一个小问不会丢失其他小问', () => {
    useQuizStore.setState({ errors: [{ ...error, questionId: 'reading' }] });
    useQuizStore.getState().expandReviewErrors([
      { id: 'reading-q1', reviewErrorId: 'reading', correctIndex: 0 },
      { id: 'reading-q2', reviewErrorId: 'reading', correctIndex: 1 },
    ]);
    useQuizStore.getState().removeError('reading-q1');
    expect(useQuizStore.getState().errors).toEqual([{ ...error, questionId: 'reading-q2', correctAnswer: 1 }]);
    expect(useQuizStore.getState().lastReviewDate).toBe('');
    expect(useQuizStore.getState().reviewRewardMonth).toBe('');
  });
  it('持久化恢复同月预算，同时兼容缺少新字段的旧存档', async () => {
    useQuizStore.setState({ weeklyCompletions: 2 });
    const month = useQuizStore.getState().beginMonthlyReview()!;
    useQuizStore.getState().claimMonthlyReviewReward(month, 15, 20);
    useQuizStore.setState({ reviewRewardMonth: '', reviewRewardCoins: 0, reviewRewardExp: 0 });
    await useQuizStore.getState().load();
    expect(useQuizStore.getState()).toMatchObject({ reviewRewardMonth: month, reviewRewardCoins: 15, reviewRewardExp: 20 });
    const old = JSON.stringify({ errors: [error], lastReviewDate: '2026-07', lastReviewCorrect: 4, lastReviewTotal: 5 });
    localStorage.setItem('csp_quiz_state', old); localStorage.setItem('quiz_state', old);
    await useQuizStore.getState().load();
    expect(useQuizStore.getState()).toMatchObject({ lastReviewDate: '2026-07', lastReviewCorrect: 4, lastReviewTotal: 5,
      reviewRewardMonth: '', reviewRewardCoins: 0, reviewRewardExp: 0 });
    expect(useQuizStore.getState().beginMonthlyReview()).toBeNull();
  });

});
