import { describe, expect, it } from 'vitest';
import type { Question } from '../types/dungeon';
import { pickHealingQuestions } from './healingQuestions';

function makeQuestion(id: string, knowledgePoint: string): Question {
  return {
    id,
    year: 2026,
    group: 'GESP',
    type: 'choice',
    knowledgePoint,
    difficulty: 2,
    question: `${id} 哪项正确？`,
    options: ['A. 1', 'B. 2', 'C. 3', 'D. 4'],
    correctIndex: 0,
  };
}

describe('弱点净化题目选择', () => {
  it('相同题目 ID 即使被多个关卡引用也只出现一次', () => {
    const duplicate = makeQuestion('same-id', '数组');
    const selected = pickHealingQuestions([duplicate, duplicate, makeQuestion('other', '数组')], '数组', 5, [], () => 0);
    expect(selected.map(question => question.id).sort()).toEqual(['other', 'same-id']);
  });

  it('优先选择弱点知识点匹配的题目', () => {
    const selected = pickHealingQuestions([
      makeQuestion('array-1', '数组'),
      makeQuestion('array-2', '数组与字符串'),
      makeQuestion('loop-1', '循环结构'),
    ], '数组', 5, [], () => 0.5);
    expect(selected.slice(0, 2).map(question => question.id).sort()).toEqual(['array-1', 'array-2']);
    expect(selected).toHaveLength(3);
  });

  it('匹配题不足时用其他可靠题补足，避免单题循环', () => {
    const selected = pickHealingQuestions([
      makeQuestion('only-array', '数组'),
      makeQuestion('loop-1', '循环结构'),
      makeQuestion('syntax-1', '基础语法'),
    ], '数组', 3, [], () => 0.5);
    expect(selected[0].id).toBe('only-array');
    expect(new Set(selected.map(question => question.id)).size).toBe(3);
  });

  it('题量充足时避开上一组题目', () => {
    const bank = Array.from({ length: 6 }, (_, index) => makeQuestion(`q-${index}`, '语法'));
    const selected = pickHealingQuestions(bank, '语法', 3, ['q-0', 'q-1', 'q-2'], () => 0.5);
    expect(selected.every(question => !['q-0', 'q-1', 'q-2'].includes(question.id))).toBe(true);
  });
});
