import { describe, expect, it } from 'vitest';

import { toLegacyQuestion } from './adapters';
import type { CanonicalQuestion, CanonicalQuestionChild } from './types';

const child: CanonicalQuestionChild = {
  id: 'c1',
  label: '小问1',
  position: 1,
  options: ['√ 正确', '× 错误'],
  correctIndex: 0,
  answer: null,
  explanation: '',
};

function makeQuestion(overrides: Partial<CanonicalQuestion> = {}): CanonicalQuestion {
  return {
    id: 'q1',
    source: 'csp_exam',
    exam: { year: 2022, date: null, group: 'J', level: null, originalNumber: 2 },
    type: 'choice',
    question: '题干',
    code: '#include <iostream>',
    assets: [],
    options: ['A', 'B', 'C', 'D'],
    answer: { correctIndex: 0 },
    children: [],
    explanation: '',
    knowledgePoint: '程序阅读',
    difficulty: 1,
    provenance: { level: 'secondary', url: null, page: null, answerUrl: null, answerPage: null },
    contentHash: 'hash',
    ...overrides,
  };
}

describe('toLegacyQuestion 选择题→阅读题兜底', () => {
  it('带 code、无 options、有 children 的 choice 按 reading 转换', () => {
    const legacy = toLegacyQuestion(makeQuestion({ options: [], children: [child] }));
    expect(legacy.type).toBe('reading');
    expect(legacy.subQuestions).toHaveLength(1);
    expect(legacy.blanks).toBeUndefined();
  });

  it('正常 choice（有 options）保持 choice', () => {
    const legacy = toLegacyQuestion(makeQuestion({ children: [child] }));
    expect(legacy.type).toBe('choice');
    expect(legacy.subQuestions).toBeUndefined();
  });

  it('reading 类型不受影响', () => {
    const legacy = toLegacyQuestion(makeQuestion({ type: 'reading', options: [], children: [child] }));
    expect(legacy.type).toBe('reading');
    expect(legacy.subQuestions).toHaveLength(1);
  });

  it('children 缺失时不抛错', () => {
    const legacy = toLegacyQuestion(makeQuestion({
      options: [],
      children: undefined as unknown as CanonicalQuestion['children'],
    }));
    expect(legacy.subQuestions).toBeUndefined();
    expect(legacy.answers).toEqual([]);
  });
});

describe('toLegacyQuestion 组别推断', () => {
  it('GESP 题 exam.group 为 null 时按 source 推断为 GESP', () => {
    // canonical 数据里 GESP 题的 exam.group 全是 null（级别在 exam.level 上），
    // 试炼场按 group === 'GESP' && level <= 4 过滤，不推断会滤掉全部 GESP 题。
    const legacy = toLegacyQuestion(makeQuestion({
      source: 'gesp',
      exam: { year: 2023, date: '2023-03', group: null, level: 1, originalNumber: 1 },
    }));
    expect(legacy.group).toBe('GESP');
    expect(legacy.level).toBe(1);
  });

  it('CSP 题保留原 exam.group', () => {
    const legacy = toLegacyQuestion(makeQuestion({ source: 'csp_exam' }));
    expect(legacy.group).toBe('J');
  });
});
