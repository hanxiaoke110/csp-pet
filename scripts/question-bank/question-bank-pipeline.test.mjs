import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { normalizeLegacyQuestion, stableContentHash } from './lib/normalize.mjs';
import { buildExamManifests, mergeCanonicalInputs } from './build-canonical.mjs';
import { validateReviewedExport } from './export-reviewed-bank.mjs';
import { decideVerdict, validateQuestion } from './lib/validate.mjs';
import { mergeJuryResponses } from './lib/ai-jury.mjs';
import { detectDeterministicCandidate, solveDeterministically } from './lib/deterministic.mjs';
import { matchOfficialSource } from './lib/source-match.mjs';
import { buildChannels } from './lib/channels.mjs';
import { evaluateReleaseGate } from './release-gate.mjs';
import { parsePdfInfo } from './index-csp-sources.mjs';
import { normalizeMatchText, scoreQuestionPage } from './map-csp-source-pages.mjs';
import {
  canonicalAnswerVector,
  collectImportConsensus,
  isQuestionContentCompatible,
} from './lib/csp-evidence.mjs';

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

describe('CSP source indexing', () => {
  it('parses page and byte counts from pdfinfo', () => {
    expect(parsePdfInfo('Title: exam\nPages:           13\nFile size:       287800 bytes\n'))
      .toEqual({ pages: 13, bytes: 287800 });
  });

  it('matches OCR text despite spacing and punctuation differences', () => {
    expect(normalizeMatchText('二进制数 1011（  ）')).toBe('二进制数1011');
    const question = {
      question: '一个32位整型变量占用（ ）个字节。',
      code: null,
      options: ['32', '128', '4', '8'],
      children: [],
    };
    const matching = scoreQuestionPage(question, '3、一个 32 位整型变量占用（）个字节。 A.32 B.128 C.4 D.8');
    const unrelated = scoreQuestionPage(question, '这是一道关于二叉树遍历的题目。');
    expect(matching.score).toBeGreaterThan(0.8);
    expect(matching.score).toBeGreaterThan(unrelated.score);
  });
});

describe('release cutover gate', () => {
  it('blocks a bank with an empty super channel', () => {
    const summary = JSON.stringify({ publishedBlockers: 0, channelCounts: { daily: 120, super: 0, dungeon: 120 } });
    const exam = JSON.stringify({ papers: [] });
    const hash = value => createHash('sha256').update(value).digest('hex');
    const manifest = {
      files: {
        'verification-summary.json': { sha256: hash(summary) },
        'exam-manifests.json': { sha256: hash(exam) },
      },
    };
    const result = evaluateReleaseGate({
      manifest,
      files: { 'verification-summary.json': summary, 'exam-manifests.json': exam },
    });
    expect(result.ready).toBe(false);
    expect(result.failures).toContain('super=0<12');
  });
});

describe('verified channel publishing', () => {
  it('keeps quarantined questions out and applies channel rules', () => {
    const questions = [
      { id: 'g', source: 'gesp', type: 'choice', exam: { level: 2, group: null }, verificationStatus: 'auto_verified', children: [] },
      { id: 'r', source: 'csp_exam', type: 'reading', exam: { level: null, group: 'J' }, verificationStatus: 'auto_verified', children: [{}] },
      { id: 's', source: 'csp_exam', type: 'choice', exam: { level: null, group: 'S' }, verificationStatus: 'auto_verified', children: [] },
      { id: 'bad', source: 'gesp', type: 'choice', exam: { level: 2, group: null }, verificationStatus: 'disputed', children: [] },
    ];
    const channels = buildChannels(questions);

    expect(channels.daily.map(question => question.id)).toEqual(['g']);
    expect(channels.super.map(question => question.id)).toEqual(['r']);
    expect(channels.exam.map(question => question.id)).toEqual(['r', 's']);
    expect(channels.dungeon.map(question => question.id)).toEqual(['g', 'r']);
    expect(Object.values(channels).flat().some(question => question.id === 'bad')).toBe(false);
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

  it('blocks a question that refers to an absent graph', () => {
    const missingGraph = normalizeLegacyQuestion({
      id: 'graph',
      question: '以a为起点，对右边的无向图进行深度优先遍历，结果是（ ）。',
      options: ['1', '2', '3', '4'],
      correctIndex: 0,
    });
    expect(validateQuestion(missingGraph).blockers).toContain('missing_visual_context');
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

describe('CSP batch evidence', () => {
  const multipart = normalizeLegacyQuestion({
    id: 'csp-j-2024-r01',
    source: 'csp_exam',
    year: 2024,
    group: 'J',
    type: 'reading',
    question: '阅读程序并回答问题。',
    code: 'int main() { return 0; }',
    subQuestions: [
      { label: '判断一', options: ['正确', '错误'], correctIndex: 0, explanation: '正确。' },
      { label: '选择二', options: ['1', '2', '3', '4'], correctIndex: 2, explanation: '答案为3。' },
    ],
    explanation: '逐项分析。',
  });

  it('uses one answer vector for choice and multipart questions', () => {
    expect(canonicalAnswerVector(multipart)).toEqual([0, 2]);
  });

  it('accepts compatible padded snapshot options and counts matching imports', () => {
    const padded = normalizeLegacyQuestion({
      id: multipart.id,
      source: 'csp_exam',
      year: 2024,
      group: 'J',
      type: 'reading',
      question: multipart.question,
      code: multipart.code,
      subQuestions: [
        { label: '判断一', options: ['正确', '错误', '无法判断', '其他'], correctIndex: 0 },
        { label: '选择二', options: ['1', '2', '3', '4'], correctIndex: 2 },
      ],
    });
    expect(isQuestionContentCompatible(padded, multipart)).toBe(true);
    const snapshots = ['a', 'b'].map(origin => ({ origin, questions: new Map([[multipart.id, padded]]) }));
    expect(collectImportConsensus(multipart, snapshots)).toMatchObject({ count: 2, contentCompatible: true });
  });

  it('verifies multipart only when all four model vectors and both critics agree', () => {
    const evidence = {
      importConsensus: { count: 2, contentCompatible: true, answerVector: [0, 2] },
      multipartModelAnswers: [[0, 2], [0, 2], [0, 2], [0, 2]],
      modelComplete: true,
      explanationVerified: true,
    };
    expect(decideVerdict(multipart, evidence).status).toBe('auto_verified');
    expect(decideVerdict(multipart, { ...evidence, importConsensus: { count: 0 } }).status)
      .toBe('auto_verified');
    expect(decideVerdict(multipart, { ...evidence, multipartModelAnswers: [[1, 2], [1, 2], [1, 2], [1, 2]] }).status)
      .toBe('disputed');
    expect(decideVerdict(multipart, { ...evidence, modelComplete: false, modelAmbiguous: true }).status)
      .toBe('disputed');
    expect(decideVerdict(multipart, {
      ...evidence,
      multipartModelAnswers: [[null, null], [null, null], [null, null], [null, null]],
      modelComplete: false,
      explanationVerified: false,
    }).status).toBe('auto_probable');
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
