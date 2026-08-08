import { describe, expect, it, vi } from 'vitest';
import type { Question } from '../types/dungeon';
import {
  getTrustedQuestionImage,
  isBrokenCodeQuestion,
  mergeReviewedQuestionBank,
  pickFallbackChoiceQuestions,
  pickEmergencyQuestions,
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

  it('兜底选函数：返回可用选择题（J/GESP 1-4 级、难度区间内）', () => {
    const q = makeQuestion({
      group: 'GESP', level: 2, difficulty: 2,
      question: '以下哪个是合法的变量名？', knowledgePoint: '语法',
    });
    const picked = pickFallbackChoiceQuestions([q], 1, [1, 4]);
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe('gesp-test');
  });

  it('兜底选函数：过滤 CSP-S、超纲 GESP、选项不足的题', () => {
    const sQuestion = makeQuestion({ id: 's-q', group: 'S' });
    const highLevel = makeQuestion({ id: 'gesp5', group: 'GESP', level: 5, difficulty: 5 });
    const fewOptions = makeQuestion({ id: 'few', group: 'J', options: ['A. 1', 'B. 2'] });
    expect(pickFallbackChoiceQuestions([sQuestion, highLevel, fewOptions], 1, [1, 4])).toHaveLength(0);
  });

  it('兜底选函数：超出难度区间的题不选', () => {
    const hard = makeQuestion({ id: 'hard', group: 'J', difficulty: 4 });
    expect(pickFallbackChoiceQuestions([hard], 1, [1, 2])).toHaveLength(0);
  });

  it('兜底选函数：空题库返回空数组（不会崩溃）', () => {
    expect(pickFallbackChoiceQuestions([], 1)).toHaveLength(0);
  });

  it('应急题库：每种技能在低、高难度副本都有可用题', () => {
    const tags = ['grammar', 'control-flow', 'data-structure', 'algorithm'] as const;
    for (const tag of tags) {
      expect(pickEmergencyQuestions(tag, 1, [1, 2]), `${tag} 低难度`).toHaveLength(1);
      expect(pickEmergencyQuestions(tag, 1, [3, 4]), `${tag} 高难度`).toHaveLength(1);
    }
  });

  it('可用题过滤：直接剔除空选项和答案越界的残缺题', () => {
    const blankOption = makeQuestion({ id: 'blank-option', question: '哪项正确？', options: ['A', 'B', '', ''] });
    const badAnswer = makeQuestion({ id: 'bad-answer', question: '哪项正确？', correctIndex: 8 });
    expect(pickFallbackChoiceQuestions([blankOption, badAnswer], 2)).toHaveLength(0);
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
