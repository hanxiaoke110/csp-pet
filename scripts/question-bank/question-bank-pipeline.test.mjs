import { describe, expect, it } from 'vitest';

import { normalizeLegacyQuestion, stableContentHash } from './lib/normalize.mjs';
import { buildExamManifests, mergeCanonicalInputs } from './build-canonical.mjs';
import { validateReviewedExport } from './export-reviewed-bank.mjs';
import { decideVerdict, validateQuestion } from './lib/validate.mjs';
import { mergeJuryResponses } from './lib/ai-jury.mjs';
import { detectDeterministicCandidate, solveDeterministically } from './lib/deterministic.mjs';
import { matchOfficialSource } from './lib/source-match.mjs';

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

describe('strong evidence collectors', () => {
  it('requires official page content and answer evidence', async () => {
    const question = normalizeLegacyQuestion({
      id: 'gesp-2024-03-2-14',
      source: 'gesp',
      year: 2024,
      level: 2,
      originalNumber: 14,
      sourceUrl: 'https://gesp.ccf.org.cn/paper.pdf',
      sourcePage: 2,
      question: '2+2等于（ ）。',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
    });
    const unrelated = await matchOfficialSource(question, {
      extractPage: async () => ({ text: '无关内容 【答案】 B', sha256: 'a'.repeat(64), pageNumber: 2 }),
    });
    const matched = await matchOfficialSource(question, {
      extractPage: async () => ({
        text: '14. 2+2等于（ ）。 A.3 B.4 C.5 D.6 【答案】 B 【解析】2加2得到4。',
        sha256: 'b'.repeat(64),
        pageNumber: 2,
      }),
    });

    expect(unrelated.officialMatch).toBe(false);
    expect(matched).toMatchObject({
      officialMatch: true,
      extractedAnswerIndex: 1,
      explanationVerified: true,
    });
  });

  it('executes only a complete no-input C++ program', async () => {
    const question = normalizeLegacyQuestion({
      id: 'cpp',
      question: '输出是（ ）。',
      code: '#include <iostream>\nint main(){std::cout << 4;}',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
    });

    expect(detectDeterministicCandidate(question).supported).toBe(true);
    expect(await solveDeterministically(question)).toMatchObject({ answerIndex: 1, supported: true });
    expect(detectDeterministicCandidate({ ...question, code: 'int main(){std::cin >> n;}' }).supported)
      .toBe(false);
  });

  it('accepts only complete parseable jury responses', () => {
    const merged = mergeJuryResponses([
      { answerIndex: 1, complete: true, ambiguous: false },
      { answerIndex: 1, complete: true, ambiguous: false },
      { answerIndex: 1, complete: true, ambiguous: false },
      { answerIndex: '1', complete: true, ambiguous: false },
    ], 4);
    expect(merged).toMatchObject({ modelAnswers: [1, 1, 1], modelComplete: true });
  });
});

describe('automatic structural verdicts', () => {
  it('blocks missing referenced code and answer-sheet images', () => {
    const missingCode = normalizeLegacyQuestion({
      id: 'missing',
      question: '阅读下面代码，执行后输出是（ ）。',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
    });
    const leakedImage = {
      ...missingCode,
      id: 'leak',
      assets: ['/course-data/gesp-code-images/leak.png'],
    };

    expect(validateQuestion(missingCode).blockers).toContain('missing_code_context');
    expect(validateQuestion(leakedImage).blockers).toContain('untrusted_answer_sheet_image');
  });

  it('does not mistake an inline code expression for missing context', () => {
    const inlineCode = normalizeLegacyQuestion({
      id: 'inline',
      question: 'C++语句 cout << 5 % 2; 执行后输出是（ ）。',
      options: ['0', '1', '2', '5'],
      correctIndex: 1,
    });
    expect(validateQuestion(inlineCode).blockers).not.toContain('missing_code_context');
  });

  it('requires verified explanation and strong answer evidence', () => {
    const question = normalizeLegacyQuestion({
      id: 'valid',
      source: 'gesp',
      question: '2+2等于（ ）。',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
      explanation: '2+2=4。',
    });
    const base = { deterministicAnswer: null, modelAnswers: [], modelComplete: false };

    expect(decideVerdict(question, { ...base, officialMatch: true, explanationVerified: true }).status)
      .toBe('auto_verified');
    expect(decideVerdict(question, { ...base, officialMatch: true, explanationVerified: false }).status)
      .toBe('auto_probable');
    expect(decideVerdict(question, { ...base, officialMatch: false, modelAnswers: [1, 2], modelComplete: true, explanationVerified: true }).status)
      .toBe('disputed');
  });
});

describe('canonical bank generation', () => {
  it('keeps reviewed corrections while enriching multipart structure', () => {
    const reviewed = normalizeLegacyQuestion({
      id: 'same',
      source: 'csp_exam',
      year: 2023,
      questionType: 'choice',
      question: 'reviewed',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 2,
      explanation: 'teacher reviewed explanation',
    });
    const multipart = normalizeLegacyQuestion({
      id: 'same',
      year: 2023,
      group: 'J',
      type: 'reading',
      question: 'parent',
      subQuestions: [{ label: 'q1', options: ['A', 'B', 'C', 'D'], correctIndex: 1 }],
    });

    const result = mergeCanonicalInputs([
      { priority: 100, origin: 'reviewed_cloud', questions: [reviewed] },
      { priority: 20, origin: 'legacy_exam', questions: [multipart] },
    ]);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].children).toHaveLength(1);
    expect(result.questions[0].answer.correctIndex).toBe(2);
    expect(result.questions[0].explanation).toBe('teacher reviewed explanation');
    expect(result.conflicts).toHaveLength(1);
  });

  it('orders an exam manifest by section and question number', () => {
    const questions = ['csp-j-2023-r01', 'csp-j-2023-c10', 'csp-j-2023-c02', 'csp-j-2023-f01']
      .map(id => normalizeLegacyQuestion({ id, year: 2023, group: 'J', question: 'q' }));

    expect(buildExamManifests(questions)[0].questionIds).toEqual([
      'csp-j-2023-c02',
      'csp-j-2023-c10',
      'csp-j-2023-r01',
      'csp-j-2023-f01',
    ]);
  });

  it('rejects an export without revision metadata', () => {
    expect(() => validateReviewedExport({ data: { q: { id: 'q' } }, version: {} }))
      .toThrow(/revision/);
  });
});
