import { describe, expect, it, vi } from 'vitest';
import type { Question } from '../types/dungeon';
import {
  getTrustedQuestionImage,
  isBrokenCodeQuestion,
  mergeReviewedQuestionBank,
} from './questionLoader';

vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
});

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'gesp-test',
    year: 2024,
    group: 'GESP',
    type: 'choice',
    knowledgePoint: '控制结构',
    difficulty: 2,
    question: '下面代码执行后输出是（ ）。',
    options: ['A. 1', 'B. 2', 'C. 3', 'D. 4'],
    correctIndex: 0,
    ...overrides,
  };
}

describe('试炼场题目可靠性', () => {
  it('不把可能包含邻题和答案的 GESP 页面截图用于作答', () => {
    const question = makeQuestion({
      image: '/course-data/gesp-code-images/gesp-test.png',
    });

    expect(getTrustedQuestionImage(question)).toBeNull();
    expect(isBrokenCodeQuestion(question)).toBe(true);
  });

  it('有结构化代码时保留题目，但仍隐藏旧页面截图', () => {
    const question = makeQuestion({
      code: 'for (int i = 0; i < 4; i++) cout << i;',
      image: '/course-data/gesp-code-images/gesp-test.png',
    });

    expect(isBrokenCodeQuestion(question)).toBe(false);
    expect(getTrustedQuestionImage(question)).toBeNull();
  });

  it('保留流程图等必要题目素材', () => {
    const question = makeQuestion({
      question: '下列流程图的输出结果是（ ）。',
      image: '/course-data/flowchart-test.svg',
    });

    expect(getTrustedQuestionImage(question)).toBe('/course-data/flowchart-test.svg');
    expect(isBrokenCodeQuestion(question)).toBe(false);
  });

  it('用教师端审校结果覆盖旧副本题目内容', () => {
    const base = makeQuestion({ correctIndex: 2, explanation: '旧解析' });
    const merged = mergeReviewedQuestionBank([base], {
      [base.id]: {
        id: base.id,
        source: 'gesp',
        year: 2024,
        level: 2,
        questionType: 'choice',
        question: base.question,
        options: base.options,
        correctIndex: 1,
        explanation: '审校后的解析',
      },
    });

    expect(merged[0].correctIndex).toBe(1);
    expect(merged[0].explanation).toBe('审校后的解析');
    expect(merged[0].group).toBe('GESP');
  });
});
