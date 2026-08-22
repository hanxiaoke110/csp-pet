import { describe, expect, it } from 'vitest';
import { buildMonthlyReviewQuestions, type ReviewableQuestion } from './reviewQuestions';

function base(overrides: Partial<ReviewableQuestion> = {}): ReviewableQuestion {
  return {
    id: 'q1',
    type: 'choice',
    question: '普通选择题',
    options: ['A', 'B'],
    correctIndex: 0,
    explanation: '解析',
    ...overrides,
  };
}

describe('buildMonthlyReviewQuestions', () => {
  it('keeps an ordinary choice error unchanged', () => {
    const question = base();
    expect(buildMonthlyReviewQuestions([question], new Set(['q1']))).toEqual([question]);
  });

  it('rebuilds only the recorded reading child and keeps shared code', () => {
    const parent = base({
      id: 'read-1', type: 'reading', question: '阅读程序并回答问题', options: [], code: 'int main() {}',
      subQuestions: [
        { label: '输出是什么？', options: ['0', '1'], correctIndex: 1, explanation: '子题解析' },
        { label: '复杂度是？', options: ['O(1)', 'O(n)'], correctIndex: 0 },
      ],
    });
    const result = buildMonthlyReviewQuestions([parent], new Set(['read-1-q2']));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'read-1-q2', type: 'choice', question: '复杂度是？', code: 'int main() {}',
      options: ['O(1)', 'O(n)'], correctIndex: 0, reviewErrorId: 'read-1-q2',
      reviewPartLabel: '程序阅读 · 第 2 小问',
    });
  });

  it('expands a legacy parent-level fill error into valid blanks', () => {
    const parent = base({
      id: 'fill-1', type: 'fillBlank', question: '补全程序', options: [], code: '___;',
      blanks: [
        { label: '第 1 空', position: 1, options: ['break', 'continue'], correctIndex: 0 },
        { label: '', position: 2, options: ['x', 'y'], correctIndex: 1 },
      ],
    });
    const result = buildMonthlyReviewQuestions([parent], new Set(['fill-1']));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'fill-1-q1', reviewErrorId: 'fill-1', reviewPartLabel: '程序填空 · 第 1 小问',
    });
  });

  it('deduplicates a question present in multiple source channels', () => {
    const first = base({ id: 'shared' });
    const duplicate = base({ id: 'shared', explanation: '另一频道副本' });
    expect(buildMonthlyReviewQuestions([first, duplicate], new Set(['shared']))).toEqual([first]);
  });

  it('normalizes legacy true/false children to two options', () => {
    const parent = base({
      id: 'judge-1', type: 'reading', question: '判断程序行为', options: [],
      subQuestions: [{
        label: '判断题16：程序不会越界。',
        options: ['A. 正确', 'B. 错误', '', ''],
        correctIndex: 3,
      }],
    });
    const [review] = buildMonthlyReviewQuestions([parent], new Set(['judge-1-q1']));
    expect(review.options).toEqual(['正确', '错误']);
    expect(review.correctIndex).toBe(1);
  });
});
