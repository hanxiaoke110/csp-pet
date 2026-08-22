import { describe, expect, it } from 'vitest';
import { isStandaloneChoiceQuestion } from './questionEligibility';

describe('isStandaloneChoiceQuestion', () => {
  it('accepts normal choice and true/false questions', () => {
    expect(isStandaloneChoiceQuestion({
      type: 'choice', question: '结果是（ ）。', options: ['1', '2', '3', '4'], correctIndex: 1,
    })).toBe(true);
    expect(isStandaloneChoiceQuestion({
      type: 'choice', question: '说法正确吗？', options: ['正确', '错误'], correctIndex: 0,
    })).toBe(true);
  });

  it('rejects a program-reading parent even if stale data labels it as choice', () => {
    expect(isStandaloneChoiceQuestion({
      type: 'choice',
      question: '阅读以下程序，请回答后面的问题。',
      options: [],
      correctIndex: 0,
    })).toBe(false);
  });

  it('rejects missing, blank, or out-of-range answers', () => {
    expect(isStandaloneChoiceQuestion({ type: 'reading', question: '阅读题', options: ['A', 'B'], correctIndex: 0 })).toBe(false);
    expect(isStandaloneChoiceQuestion({ type: 'choice', question: '题目', options: ['A', ''], correctIndex: 0 })).toBe(false);
    expect(isStandaloneChoiceQuestion({ type: 'choice', question: '题目', options: ['A', 'B'], correctIndex: 2 })).toBe(false);
  });
});
