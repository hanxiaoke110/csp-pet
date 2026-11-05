// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuizPractice from './QuizPractice';
import { useQuizStore } from '../../stores/quizStore';
import { usePetStore } from '../../stores/petStore';

const { ensure, addCoins, addExp } = vi.hoisted(() => ({ ensure: vi.fn(async () => ({ ok: true })), addCoins: vi.fn(), addExp: vi.fn() }));
vi.mock('../access/ClassAccessGate', () => ({ useClassAccess: () => ({ ensure }), ClassAccessRequired: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock('../shared/KnowledgePointHelp', () => ({ default: () => null }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(async () => {}) }));
vi.mock('../../question-bank/adapters', () => ({ toLegacyQuestion: (q: unknown) => q }));
vi.mock('../../question-bank/repository', () => ({
  beginQuestionBankSession: vi.fn(async () => ({ channels: { daily: [
    { id: 'choice-1', type: 'choice', source: 'gesp', question: '复习选择题', options: ['正确选项', '错误选项'], correctIndex: 0, explanation: '解析', knowledgePoint: '分支', level: 1 },
    { id: 'reading', type: 'reading', source: 'csp_exam', question: '阅读程序', options: [], correctIndex: 0, explanation: '阅读解析', knowledgePoint: '循环', subQuestions: [
      { label: '第一小问', options: ['正确选项', '错误选项'], correctIndex: 0 },
      { label: '第二小问', options: ['正确选项', '错误选项'], correctIndex: 0 },
    ] },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `size-${i}`, type: 'choice', source: 'gesp', question: `错题 ${i}`, options: ['正确选项', '错误选项'], correctIndex: 0, explanation: '解析', level: 1 })),
  ], topic: [
    { id: 'topic-only', topicId: 'branch', type: 'choice', source: 'practice_original', question: '仅在专项频道的错题', options: ['正确选项', '错误选项'], correctIndex: 0, explanation: '专项解析', knowledgePoint: '分支', level: 1 },
    { id: 'choice-1', type: 'choice', source: 'gesp', question: '重复频道题', options: ['正确选项', '错误选项'], correctIndex: 0, explanation: '解析', level: 1 },
  ] } })), refreshQuestionBankV2: vi.fn(),
}));

let root: Root;
let container: HTMLDivElement;
const initial = useQuizStore.getState();
function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text));
  expect(found, `button ${text}`).toBeTruthy();
  return found!;
}
async function click(element: Element) { await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
async function mount() { await act(async () => { root.render(<MemoryRouter><QuizPractice /></MemoryRouter>); }); }
async function answer(correct: boolean) {
  const options = container.querySelectorAll('.quiz-opt');
  await click(options[correct ? 0 : 1]);
  await click(button('提交答案'));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  vi.clearAllMocks();
  ensure.mockResolvedValue({ ok: true });
  useQuizStore.setState({ ...initial, errors: [{ questionId: 'choice-1', wrongAnswer: 1, correctAnswer: 0, attempts: 1, date: '2026-07-01' }],
    weeklyCompletions: 0, lastReviewDate: '', reviewRewardMonth: '', reviewRewardCoins: 0, reviewRewardExp: 0 });
  usePetStore.setState({ loaded: true, ownedPets: [{ petId: 'pet-test' }] as never, activePetId: 'pet-test', addCoins, addExp });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('随时错题练习', () => {
  it.each(['locked', 'rewarded'])('允许在 %s 状态下独立学习，答对清错题但不发奖或消耗月度资格', async status => {
    // Store gate is deterministic regardless of the calendar date used by this test run.
    if (status === 'rewarded') useQuizStore.setState({ lastReviewDate: new Date().toISOString().slice(0, 7) });
    else vi.spyOn(useQuizStore.getState(), 'canDoMonthlyReview').mockReturnValue({ allowed: false, reason: '等待解锁' });
    await mount();
    await click(button('开始错题练习'));
    expect(ensure).not.toHaveBeenCalled();
    const previousDate = useQuizStore.getState().lastReviewDate;
    await answer(true);
    await click(button('查看结果'));
    expect(useQuizStore.getState()).toMatchObject({ errors: [], totalPractice: initial.totalPractice + 1, totalCorrect: initial.totalCorrect + 1, lastReviewDate: previousDate, reviewRewardMonth: '' });
    expect(addCoins).not.toHaveBeenCalled(); expect(addExp).not.toHaveBeenCalled();
    expect(container.textContent).toContain('不占用月度复盘奖励');
  });

  it('答错仍保留错题并记录练习结果', async () => {
    await mount(); await click(button('开始错题练习')); await answer(false); await click(button('查看结果'));
    expect(useQuizStore.getState().errors[0]).toMatchObject({ questionId: 'choice-1', attempts: 2 });
    expect(useQuizStore.getState().totalCorrect).toBe(initial.totalCorrect);
    expect(addCoins).not.toHaveBeenCalled(); expect(addExp).not.toHaveBeenCalled();
  });

  it('无错题显示明确空状态', async () => {
    useQuizStore.setState({ errors: [] }); await mount();
    expect(button('暂无错题，真棒！').disabled).toBe(true);
    expect(ensure).not.toHaveBeenCalled();
  });

  it('旧阅读父题的小问各自移出，不会提前清空未掌握小问', async () => {
    useQuizStore.setState({ errors: [{ questionId: 'reading', wrongAnswer: 1, correctAnswer: 0, attempts: 1, date: '2026-07-01' }] });
    await mount(); await click(button('开始错题练习'));
    expect(useQuizStore.getState().errors).toHaveLength(2);
    await answer(true);
    expect(useQuizStore.getState().errors).toHaveLength(1);
    await click(button('下一题')); await answer(false); await click(button('查看结果'));
    expect(useQuizStore.getState().errors).toHaveLength(1);
    expect(useQuizStore.getState().errors[0].questionId).toMatch(/^reading-q[12]$/);
  });
  it('月度奖励仍需要班级校验，重开会话不重置每月奖励上限', async () => {
    const month = new Date().toISOString().slice(0, 7);
    useQuizStore.setState({ weeklyCompletions: 2, reviewRewardMonth: month, reviewRewardCoins: 295, reviewRewardExp: 390,
      errors: [{ questionId: 'reading', wrongAnswer: 1, correctAnswer: 0, attempts: 1, date: '2026-07-01' }] });
    await mount(); await click(button('开始复盘'));
    expect(ensure).toHaveBeenCalledTimes(1);
    await answer(true);
    expect(addCoins).toHaveBeenCalledWith(5);
    expect(addExp).toHaveBeenCalledWith('pet-test', 10);
    expect(useQuizStore.getState().lastReviewDate).toBe('');
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount(); await click(button('开始复盘')); await answer(true); await click(button('查看结果'));
    expect(addCoins).toHaveBeenCalledTimes(1); expect(addExp).toHaveBeenCalledTimes(1);
    expect(useQuizStore.getState().lastReviewDate).toBe(month);
    expect(useQuizStore.getState().reviewRewardCoins).toBe(300);
    expect(useQuizStore.getState().reviewRewardExp).toBe(400);
    expect(container.textContent).not.toContain('完美复盘额外奖励');
  });

  it.each([[5, '1/5'], [10, '1/10'], [Number.MAX_SAFE_INTEGER, '1/12']])('按所选题量 %s 开始，题库只取错题', async (count, progress) => {
    useQuizStore.setState({ errors: Array.from({ length: 12 }, (_, i) => ({ questionId: `size-${i}`, wrongAnswer: 1, correctAnswer: 0, attempts: 1, date: '2026-07-01' })) });
    await mount();
    const select = container.querySelector('select')!;
    await act(async () => { select.value = String(count); select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button('开始错题练习'));
    expect(container.querySelector('.quiz-progress')?.textContent).toBe(progress);
    expect(container.querySelector('.quiz-q-body')?.textContent).toMatch(/^错题 /);
    expect(ensure).not.toHaveBeenCalled();
  });

  it.each(['wrong', 'review'])('专项频道独有错题可进入 %s，答对移出错题本', async mode => {
    useQuizStore.setState({ weeklyCompletions: 2, errors: [{ questionId: 'topic-only', wrongAnswer: 1, correctAnswer: 0, attempts: 1, date: '2026-07-01' }] });
    await mount(); await click(button(mode === 'wrong' ? '开始错题练习' : '开始复盘'));
    expect(container.querySelector('.quiz-q-body')?.textContent).toBe('仅在专项频道的错题');
    expect(container.querySelector('.quiz-progress')?.textContent).toBe('1/1');
    await answer(true); await click(button('查看结果'));
    expect(useQuizStore.getState().errors).toEqual([]);
    if (mode === 'wrong') {
      expect(ensure).not.toHaveBeenCalled(); expect(addCoins).not.toHaveBeenCalled(); expect(addExp).not.toHaveBeenCalled();
      expect(useQuizStore.getState().lastReviewDate).toBe('');
    } else expect(ensure).toHaveBeenCalledTimes(1);
  });

  it('相同错题在多个频道存在时只出现一次', async () => {
    await mount(); await click(button('开始错题练习'));
    expect(container.querySelector('.quiz-progress')?.textContent).toBe('1/1');
    expect(container.querySelector('.quiz-q-body')?.textContent).toBe('复习选择题');
  });

  it('月度奖励复盘被班级校验拒绝时不进入答题或发奖', async () => {
    ensure.mockResolvedValueOnce({ ok: false });
    useQuizStore.setState({ weeklyCompletions: 2 });
    await mount(); await click(button('开始复盘'));
    expect(container.textContent).toContain('月度奖励复盘需要班级码');
    expect(container.querySelector('.quiz-q-body')).toBeNull();
    expect(useQuizStore.getState().reviewRewardMonth).toBe('');
    expect(addCoins).not.toHaveBeenCalled(); expect(addExp).not.toHaveBeenCalled();
  });

  it('错题未在题库找到时保留记录，不误报错题已清空', async () => {
    useQuizStore.setState({ errors: [{ questionId: 'missing-question', wrongAnswer: 1, correctAnswer: 0, attempts: 1, date: '2026-07-01' }] });
    await mount(); await click(button('开始错题练习'));
    expect(container.textContent).toContain('当前错题暂时没有可用题目');
    expect(container.textContent).not.toContain('错题已清空');
    expect(useQuizStore.getState().errors).toHaveLength(1);
  });

});
