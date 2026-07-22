import { describe, expect, it } from 'vitest';

import { normalizeLegacyQuestion, stableContentHash } from './lib/normalize.mjs';

describe('canonical question normalization', () => {
  it('normalizes a GESP choice question', () => {
    const result = normalizeLegacyQuestion({
      id: 'gesp-2024-03-2-14',
      source: 'gesp',
      year: 2024,
      level: 2,
      questionType: 'choice',
      question: '循环执行次数是（ ）。',
      code: 'for(int i=2;i<=8;i+=2) cout<<i;',
      options: ['A. 3', 'B. 4', 'C. 5', 'D. 6'],
      correctIndex: 1,
      explanation: 'i依次为2、4、6、8。',
      knowledgePoint: '控制结构',
      difficulty: 1,
    });

    expect(result.exam.level).toBe(2);
    expect(result.exam.group).toBeNull();
    expect(result.type).toBe('choice');
    expect(result.answer.correctIndex).toBe(1);
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves CSP multipart children and child answers', () => {
    const result = normalizeLegacyQuestion({
      id: 'csp-j-2023-reading-1',
      year: 2023,
      group: 'J',
      type: 'reading',
      question: '阅读程序并回答问题。',
      code: 'int main(){return 0;}',
      subQuestions: [
        { label: '判断输出', options: ['A', 'B', 'C', 'D'], correctIndex: 2 },
      ],
      knowledgePoint: '程序阅读',
      difficulty: 3,
    });

    expect(result.type).toBe('reading');
    expect(result.children).toHaveLength(1);
    expect(result.children[0]).toMatchObject({
      id: 'csp-j-2023-reading-1:sub:1',
      correctIndex: 2,
    });
  });

  it('produces the same content hash for object keys in a different order', () => {
    expect(stableContentHash({ b: 2, a: 1 })).toBe(stableContentHash({ a: 1, b: 2 }));
  });
});
