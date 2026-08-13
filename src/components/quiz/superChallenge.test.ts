import { describe, expect, it } from 'vitest';

import { getSuperChallengeItems, isCompleteSuperChallenge } from './superChallenge';

const completeReading = {
  type: 'reading',
  code: 'int main() {}',
  subQuestions: [
    { label: '输出是什么？', options: ['0', '1'], correctIndex: 0 },
  ],
};

describe('超级挑战题完整性校验', () => {
  it('接受带代码和完整子题的阅读题', () => {
    expect(isCompleteSuperChallenge(completeReading)).toBe(true);
    expect(getSuperChallengeItems(completeReading)).toHaveLength(1);
  });

  it('拒绝只有代码但没有小题和选项的数据', () => {
    expect(isCompleteSuperChallenge({ type: 'reading', code: 'int main() {}', subQuestions: [] })).toBe(false);
  });

  it('拒绝答案越界或选项为空的小题', () => {
    expect(isCompleteSuperChallenge({
      ...completeReading,
      subQuestions: [{ label: '输出是什么？', options: ['0', ''], correctIndex: 2 }],
    })).toBe(false);
  });

  it('填空题读取 blanks', () => {
    const question = {
      type: 'fillBlank',
      image: '/question.png',
      blanks: [{ label: '第1空', options: ['a', 'b'], correctIndex: 1 }],
    };
    expect(isCompleteSuperChallenge(question)).toBe(true);
    expect(getSuperChallengeItems(question)).toEqual(question.blanks);
  });
});
