# Unified Verified Question Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one automatically verified canonical question bank, publish four channel-specific snapshots, and ship a desktop release that reads those snapshots offline-first with safe hot updates.

**Architecture:** Existing JSON banks remain import inputs during migration, but only `question-bank-v2/canonical.json` is authoritative after generation. A Node-based verification pipeline creates evidence and verdicts, then emits immutable channel snapshots consumed through one browser-side repository. The installer bundles the latest snapshots; cloud and Gitee are background update sources only.

**Tech Stack:** TypeScript 5.8, React 19, Vite 7, Vitest 4, Node.js ESM scripts, Cloudflare Worker/D1, Gitee static JSON, Tauri 2 local storage.

---

## File Map

- Create `scripts/question-bank/lib/normalize.mjs`: normalize legacy bank records into the canonical schema.
- Create `scripts/question-bank/lib/validate.mjs`: structural checks, evidence rules, and automatic verdicts.
- Create `scripts/question-bank/lib/source-match.mjs`: verify official PDF pages by content and answer match.
- Create `scripts/question-bank/lib/deterministic.mjs`: compile and run complete, safe C++ output questions.
- Create `scripts/question-bank/build-source-catalog.mjs`: index official GESP and CSP paper/answer documents by exam metadata.
- Create `scripts/question-bank/lib/channels.mjs`: deterministic channel eligibility and paper manifests.
- Create `scripts/question-bank/export-reviewed-bank.mjs`: export merged teacher-reviewed data before release generation.
- Create `scripts/question-bank/build-canonical.mjs`: merge legacy inputs without losing multipart questions.
- Create `scripts/question-bank/verify-canonical.mjs`: run structural, deterministic, and AI evidence stages.
- Create `scripts/question-bank/publish-snapshots.mjs`: emit hashed student snapshots atomically.
- Create `scripts/question-bank/question-bank-pipeline.test.mjs`: pipeline unit and integration tests.
- Create `src/question-bank/types.ts`: shared client-side v2 types.
- Create `src/question-bank/repository.ts`: bundled/cache/remote loading and atomic version selection.
- Create `src/question-bank/repository.test.ts`: offline, corrupt-cache, and upgrade tests.
- Create `public/course-data/question-bank-v2/*`: generated manifest, canonical bank, evidence, and channel snapshots.
- Modify `src/components/quiz/QuizPractice.tsx`: use daily and super snapshots.
- Modify `src/components/exam/ExamTraining.tsx`: use exam snapshot and manifests.
- Modify `src-dungeon/utils/questionLoader.ts`: use dungeon snapshot without legacy merging.
- Modify `src/App.tsx`: initialize v2 bundled cache and run background update.
- Modify `cf-workers/api.js`: expose cached public v2 manifest and snapshot routes.
- Modify `teacher-app/index.html`: show v2 verification summary and channel counts.
- Modify `package.json`: add pipeline and release-gate commands.

### Task 1: Canonical Schema And Legacy Normalization

**Files:**
- Create: `scripts/question-bank/lib/normalize.mjs`
- Create: `src/question-bank/types.ts`
- Test: `scripts/question-bank/question-bank-pipeline.test.mjs`

- [ ] **Step 1: Write failing normalization tests**

```js
import { describe, expect, it } from 'vitest';
import { normalizeLegacyQuestion } from './lib/normalize.mjs';

describe('canonical question normalization', () => {
  it('normalizes a GESP choice question', () => {
    const result = normalizeLegacyQuestion({
      id: 'gesp-2024-03-2-14', source: 'gesp', year: 2024, level: 2,
      questionType: 'choice', question: '循环执行次数是（ ）。',
      code: 'for(int i=2;i<=8;i+=2) cout<<i;',
      options: ['A. 3', 'B. 4', 'C. 5', 'D. 6'], correctIndex: 1,
      explanation: 'i依次为2、4、6、8。', knowledgePoint: '控制结构', difficulty: 1,
    });
    expect(result.exam.level).toBe(2);
    expect(result.type).toBe('choice');
    expect(result.answer.correctIndex).toBe(1);
  });

  it('preserves CSP multipart children', () => {
    const result = normalizeLegacyQuestion({
      id: 'csp-j-2023-reading-1', year: 2023, group: 'J', type: 'reading',
      question: '阅读程序并回答问题。', code: 'int main(){return 0;}',
      subQuestions: [{ label: '判断输出', options: ['A', 'B', 'C', 'D'], correctIndex: 2 }],
      knowledgePoint: '程序阅读', difficulty: 3,
    });
    expect(result.type).toBe('reading');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].correctIndex).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run: `npx vitest run scripts/question-bank/question-bank-pipeline.test.mjs`

Expected: FAIL because `lib/normalize.mjs` does not exist.

- [ ] **Step 3: Implement the canonical normalizer**

```js
import { createHash } from 'node:crypto';

export function stableContentHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizeLegacyQuestion(raw) {
  const source = raw.source || (raw.group === 'GESP' ? 'gesp' : 'csp_exam');
  const typeRaw = raw.questionType || raw.type || 'choice';
  const type = typeRaw === 'completion' ? 'fillBlank' : typeRaw;
  const core = {
    id: String(raw.id),
    source,
    exam: {
      year: Number(raw.year || 0),
      date: raw.examDate || null,
      group: raw.group === 'GESP' ? null : (raw.group || raw.examGroup || null),
      level: Number(raw.level || 0) || null,
      originalNumber: raw.originalNumber || null,
    },
    type,
    question: String(raw.question || '').trim(),
    code: typeof raw.code === 'string' ? raw.code : null,
    assets: [raw.image, raw.codeImage].filter(Boolean),
    options: Array.isArray(raw.options) ? raw.options.map(String) : [],
    answer: { correctIndex: Number.isInteger(raw.correctIndex) ? raw.correctIndex : null },
    children: Array.isArray(raw.subQuestions)
      ? raw.subQuestions.map((item, index) => ({ id: `${raw.id}:sub:${index + 1}`, ...item }))
      : Array.isArray(raw.blanks)
        ? raw.blanks.map((item, index) => ({ id: `${raw.id}:blank:${index + 1}`, ...item }))
        : [],
    explanation: String(raw.explanation || '').trim(),
    knowledgePoint: String(raw.knowledgePoint || '未分类'),
    difficulty: Number(raw.difficulty || raw.level || 1),
    provenance: {
      level: raw.sourceUrl ? 'official_unlinked' : 'secondary',
      url: raw.sourceUrl || null,
      page: Number(raw.sourcePage || 0) || null,
      answerUrl: raw.answerSourceUrl || null,
      answerPage: Number(raw.answerSourcePage || 0) || null,
    },
  };
  return { ...core, contentHash: stableContentHash(core) };
}
```

- [ ] **Step 4: Add matching browser types**

```ts
export type VerificationStatus = 'auto_verified' | 'auto_probable' | 'disputed' | 'broken';

export interface CanonicalQuestion {
  id: string;
  source: string;
  exam: { year: number; date: string | null; group: string | null; level: number | null; originalNumber: string | number | null };
  type: 'choice' | 'boolean' | 'reading' | 'fillBlank';
  question: string;
  code: string | null;
  assets: string[];
  options: string[];
  answer: { correctIndex: number | null };
  children: Array<{ id: string; label?: string; position?: number; options: string[]; correctIndex: number; explanation?: string }>;
  explanation: string;
  knowledgePoint: string;
  difficulty: number;
  provenance: { level: string; url: string | null; page: number | null; answerUrl: string | null; answerPage: number | null };
  contentHash: string;
  verificationStatus: VerificationStatus;
}
```

- [ ] **Step 5: Run the focused test and commit**

Run: `npx vitest run scripts/question-bank/question-bank-pipeline.test.mjs`

Expected: 2 tests PASS.

```bash
git add scripts/question-bank/lib/normalize.mjs scripts/question-bank/question-bank-pipeline.test.mjs src/question-bank/types.ts
git commit -m "feat: define canonical question bank schema"
```

### Task 2: Build One Canonical Bank And Exam Manifests

**Files:**
- Create: `scripts/question-bank/export-reviewed-bank.mjs`
- Create: `scripts/question-bank/build-canonical.mjs`
- Modify: `scripts/question-bank/question-bank-pipeline.test.mjs`
- Modify: `.gitignore`
- Create: `public/course-data/question-bank-v2/canonical.json`
- Create: `public/course-data/question-bank-v2/exam-manifests.json`

- [ ] **Step 1: Add failing source-priority and ordering tests**

```js
import { buildExamManifests, mergeCanonicalInputs } from './build-canonical.mjs';

it('keeps reviewed corrections while enriching them with multipart structure', () => {
  const reviewed = normalizeLegacyQuestion({
    id: 'same', source: 'csp_exam', year: 2023, questionType: 'choice',
    question: 'reviewed', options: ['A', 'B', 'C', 'D'], correctIndex: 2,
    explanation: 'teacher reviewed explanation',
  });
  const multipart = normalizeLegacyQuestion({
    id: 'same', year: 2023, group: 'J', type: 'reading', question: 'parent',
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

it('orders an exam manifest by official question number', () => {
  const questions = ['10', '2', '1'].map(originalNumber => ({
    ...normalizeLegacyQuestion({ id: `q-${originalNumber}`, year: 2023, group: 'J', question: 'q' }),
    exam: { year: 2023, group: 'J', level: null, date: null, originalNumber },
  }));
  expect(buildExamManifests(questions)[0].questionIds).toEqual(['q-1', 'q-2', 'q-10']);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npx vitest run scripts/question-bank/question-bank-pipeline.test.mjs`

Expected: FAIL because `build-canonical.mjs` does not exist.

- [ ] **Step 3: Export the current teacher-reviewed bank**

`export-reviewed-bank.mjs` fetches `https://api.cspstudy.top/api/question-bank/data`, validates the revision and question collection, and writes `.tmp/reviewed-question-bank.json` with `{ exportedAt, revision, questions }`. It accepts `QUESTION_BANK_API_BASE` for local contract tests and `--input=<fixture>` for offline tests.

```js
const response = await fetch(`${apiBase}/api/question-bank/data`);
if (!response.ok) throw new Error(`reviewed bank export failed: HTTP ${response.status}`);
const payload = await response.json();
if (!Number.isInteger(payload.revision) || !payload.questions || typeof payload.questions !== 'object') {
  throw new Error('reviewed bank export has an invalid contract');
}
```

Add `.tmp/reviewed-question-bank.json` to `.gitignore`. Release mode rejects an export older than 24 hours. A production build must fail when the reviewed export is missing, stale, or invalid; it must never silently substitute unreviewed local JSON. No Cloudflare token or API key is written to this export.

- [ ] **Step 4: Implement source-priority merge and manifest generation**

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLegacyQuestion } from './lib/normalize.mjs';

export function mergeCanonicalInputs(inputGroups) {
  const byId = new Map();
  const conflicts = [];
  for (const { questions, priority, origin } of [...inputGroups].sort((a, b) => b.priority - a.priority)) {
    for (const question of questions) {
      const existing = byId.get(question.id);
      if (!existing) {
        byId.set(question.id, { ...question, importOrigin: origin, importPriority: priority });
        continue;
      }
      if (existing.contentHash !== question.contentHash) {
        conflicts.push({ id: question.id, preferredOrigin: existing.importOrigin, secondaryOrigin: origin });
      }
      byId.set(question.id, {
        ...question,
        ...existing,
        children: existing.children.length ? existing.children : question.children,
        assets: [...new Set([...existing.assets, ...question.assets])],
      });
    }
  }
  return { questions: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)), conflicts };
}

export function buildExamManifests(questions) {
  const papers = new Map();
  for (const q of questions.filter(item => ['J', 'S'].includes(item.exam.group))) {
    const id = `${q.exam.year}-${q.exam.group}`;
    if (!papers.has(id)) papers.set(id, { id, year: q.exam.year, group: q.exam.group, questionIds: [] });
    papers.get(id).questionIds.push(q.id);
  }
  const byId = new Map(questions.map(question => [question.id, question]));
  for (const paper of papers.values()) paper.questionIds.sort((a, b) => {
    const left = Number(byId.get(a)?.exam.originalNumber);
    const right = Number(byId.get(b)?.exam.originalNumber);
    return Number.isFinite(left) && Number.isFinite(right) ? left - right : a.localeCompare(b);
  });
  return [...papers.values()].sort((a, b) => a.id.localeCompare(b.id));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const reviewedExport = readJson(path.join(root, '.tmp/reviewed-question-bank.json'));
  const examRaw = readJson(path.join(root, 'public/course-data/csp-exam-bank.json'));
  const dungeonRaw = readJson(path.join(root, 'public/course-data/dungeon-exam-bank.json'));
  const groups = [
    { priority: 100, origin: 'reviewed_cloud', questions: Object.values(reviewedExport.questions).map(normalizeLegacyQuestion) },
    { priority: 20, origin: 'legacy_exam', questions: examRaw.questions.map(normalizeLegacyQuestion) },
    { priority: 10, origin: 'legacy_dungeon', questions: dungeonRaw.questions.map(normalizeLegacyQuestion) },
  ];
  const result = mergeCanonicalInputs(groups);
  const out = path.join(root, 'public/course-data/question-bank-v2');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'canonical.json'), JSON.stringify({ questions: result.questions, conflicts: result.conflicts }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'exam-manifests.json'), JSON.stringify(buildExamManifests(result.questions), null, 2) + '\n');
}
```

- [ ] **Step 5: Run export and generation, then verify stable output**

Run: `node scripts/question-bank/export-reviewed-bank.mjs && node scripts/question-bank/build-canonical.mjs && shasum -a 256 public/course-data/question-bank-v2/canonical.json`

Expected: the reviewed export revision is printed, canonical question count is greater than 1000, reviewed answer/explanation fields win duplicate conflicts, exam manifests retain official order, and a SHA-256 is printed.

- [ ] **Step 6: Commit canonical generation**

```bash
git add scripts/question-bank/export-reviewed-bank.mjs scripts/question-bank/build-canonical.mjs scripts/question-bank/question-bank-pipeline.test.mjs .gitignore public/course-data/question-bank-v2/canonical.json public/course-data/question-bank-v2/exam-manifests.json
git commit -m "feat: generate canonical question bank"
```

### Task 3: Structural Verification And Automatic Verdicts

**Files:**
- Create: `scripts/question-bank/lib/validate.mjs`
- Create: `scripts/question-bank/verify-canonical.mjs`
- Modify: `scripts/question-bank/question-bank-pipeline.test.mjs`
- Create: `public/course-data/question-bank-v2/verification.json`

- [ ] **Step 1: Add failing verdict tests**

```js
import { validateQuestion, decideVerdict } from './lib/validate.mjs';

it('blocks missing code context and answer leaks', () => {
  const missingCode = normalizeLegacyQuestion({
    id: 'missing', question: '下面代码执行后输出是（ ）。',
    options: ['A', 'B', 'C', 'D'], correctIndex: 0,
  });
  const leakedImage = { ...missingCode, id: 'leak', code: 'int x=1;', assets: ['/course-data/gesp-code-images/leak.png'] };
  expect(validateQuestion(missingCode).blockers).toContain('missing_code_context');
  expect(validateQuestion(leakedImage).blockers).toContain('untrusted_answer_sheet_image');
});

it('publishes only a valid question with a strong evidence combination', () => {
  const question = normalizeLegacyQuestion({
    id: 'valid', source: 'gesp', question: '2+2等于（ ）。',
    options: ['A. 3', 'B. 4', 'C. 5', 'D. 6'], correctIndex: 1,
  });
  expect(decideVerdict(question, { officialMatch: true, deterministicAnswer: null, modelAnswers: [], modelComplete: false, explanationVerified: true }).status).toBe('auto_verified');
  expect(decideVerdict(question, { officialMatch: false, deterministicAnswer: null, modelAnswers: [1, 2], modelComplete: true, explanationVerified: true }).status).toBe('disputed');
  expect(decideVerdict(question, { officialMatch: false, deterministicAnswer: 1, modelAnswers: [1, 1], modelComplete: false, explanationVerified: true }).status).toBe('auto_probable');
  expect(decideVerdict(question, { officialMatch: true, deterministicAnswer: null, modelAnswers: [], modelComplete: false, explanationVerified: false }).status).toBe('auto_probable');
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run scripts/question-bank/question-bank-pipeline.test.mjs`

Expected: FAIL because validation exports do not exist.

- [ ] **Step 3: Implement blockers and evidence rules**

```js
const CODE_REFERENCE = /代码|程序|横线|执行后|输出结果/;

export function validateQuestion(q) {
  const blockers = [];
  if (!q.id) blockers.push('missing_id');
  if (!q.question) blockers.push('missing_question');
  if (q.type === 'choice' && q.options.length < 4) blockers.push('insufficient_options');
  if (q.type === 'choice' && (!Number.isInteger(q.answer.correctIndex) || q.answer.correctIndex < 0 || q.answer.correctIndex >= q.options.length)) blockers.push('answer_out_of_range');
  if (CODE_REFERENCE.test(q.question) && !q.code && q.assets.length === 0) blockers.push('missing_code_context');
  if (q.assets.some(src => /\/gesp-code-images\//.test(src))) blockers.push('untrusted_answer_sheet_image');
  if (['reading', 'fillBlank'].includes(q.type) && q.children.length === 0) blockers.push('missing_children');
  return { blockers };
}

export function decideVerdict(q, evidence) {
  const structural = validateQuestion(q);
  if (structural.blockers.length) return { status: 'broken', blockers: structural.blockers, evidence };
  const answers = evidence.modelAnswers.filter(Number.isInteger);
  if (evidence.deterministicAnswer !== null && evidence.deterministicAnswer !== q.answer.correctIndex) return { status: 'disputed', blockers: ['deterministic_conflict'], evidence };
  if (answers.length >= 2 && new Set(answers).size > 1) return { status: 'disputed', blockers: ['model_conflict'], evidence };
  if (!evidence.explanationVerified) return { status: 'auto_probable', blockers: ['explanation_unverified'], evidence };
  if (evidence.officialMatch) return { status: 'auto_verified', blockers: [], evidence };
  if (evidence.modelComplete && evidence.deterministicAnswer === q.answer.correctIndex && answers.length >= 2 && answers.every(answer => answer === q.answer.correctIndex)) return { status: 'auto_verified', blockers: [], evidence };
  return { status: 'auto_probable', blockers: [], evidence };
}
```

- [ ] **Step 4: Implement batch verification with cached evidence**

```js
import fs from 'node:fs';
import { decideVerdict } from './lib/validate.mjs';

const canonical = JSON.parse(fs.readFileSync('public/course-data/question-bank-v2/canonical.json'));
const evidencePath = '.tmp/question-bank-v2-evidence.json';
const evidence = fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath)) : {};
const results = canonical.questions.map(question => {
  const cached = evidence[question.id];
  const currentEvidence = cached?.contentHash === question.contentHash
    ? cached
    : { officialMatch: false, deterministicAnswer: null, modelAnswers: [], modelComplete: false, explanationVerified: false };
  return { questionId: question.id, contentHash: question.contentHash, ...decideVerdict(question, currentEvidence) };
});
fs.writeFileSync('public/course-data/question-bank-v2/verification.json', JSON.stringify({ results }, null, 2) + '\n');
```

- [ ] **Step 5: Run tests, generate verdicts, and commit**

Run: `npx vitest run scripts/question-bank/question-bank-pipeline.test.mjs && node scripts/question-bank/verify-canonical.mjs`

Expected: tests PASS; every canonical ID has one verdict and only the four defined statuses appear.

```bash
git add scripts/question-bank/lib/validate.mjs scripts/question-bank/verify-canonical.mjs scripts/question-bank/question-bank-pipeline.test.mjs public/course-data/question-bank-v2/verification.json
git commit -m "feat: add automatic question verdicts"
```

### Task 4: Deterministic And AI Evidence Collection

**Files:**
- Create: `scripts/question-bank/collect-evidence.mjs`
- Create: `scripts/question-bank/lib/ai-jury.mjs`
- Create: `scripts/question-bank/lib/source-match.mjs`
- Create: `scripts/question-bank/lib/deterministic.mjs`
- Create: `scripts/question-bank/build-source-catalog.mjs`
- Create: `public/course-data/question-bank-v2/source-catalog.json`
- Modify: `scripts/question-bank/question-bank-pipeline.test.mjs`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add failing official-source, deterministic, and jury tests**

```js
import { mergeJuryResponses } from './lib/ai-jury.mjs';
import { matchOfficialSource } from './lib/source-match.mjs';
import { detectDeterministicCandidate, solveDeterministically } from './lib/deterministic.mjs';

it('accepts only parseable independent jury responses', () => {
  expect(mergeJuryResponses([
    { answerIndex: 1, complete: true, ambiguous: false },
    { answerIndex: 1, complete: true, ambiguous: false },
    { answerIndex: 1, complete: true, ambiguous: false },
  ])).toEqual({ modelAnswers: [1, 1, 1], modelComplete: true });
  expect(mergeJuryResponses([
    { answerIndex: 1, complete: true, ambiguous: false },
    { answerIndex: 2, complete: true, ambiguous: false },
  ]).modelAnswers).toEqual([1, 2]);
});

it('does not call a declared URL an official match without content evidence', async () => {
  const question = normalizeLegacyQuestion({
    id: 'official', source: 'gesp', sourceUrl: 'https://gesp.ccf.org.cn/paper.pdf', sourcePage: 2,
    question: '2+2等于（ ）。', options: ['3', '4', '5', '6'], correctIndex: 1,
  });
  expect((await matchOfficialSource(question, { extractPage: async () => ({ text: 'unrelated', sha256: 'a'.repeat(64) }) })).officialMatch).toBe(false);
  expect((await matchOfficialSource(question, { extractPage: async () => ({ text: '2+2等于（ ）。 A.3 B.4 C.5 D.6 答案 B', sha256: 'b'.repeat(64) }) })).officialMatch).toBe(true);
});

it('executes only a complete no-input C++ output question', async () => {
  const question = normalizeLegacyQuestion({
    id: 'cpp', question: '输出是（ ）。', code: '#include <iostream>\nint main(){std::cout << 4;}',
    options: ['3', '4', '5', '6'], correctIndex: 1,
  });
  expect(detectDeterministicCandidate(question).supported).toBe(true);
  expect((await solveDeterministically(question)).answerIndex).toBe(1);
  expect(detectDeterministicCandidate({ ...question, code: 'std::cin >> n;' }).supported).toBe(false);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run scripts/question-bank/question-bank-pipeline.test.mjs`

Expected: FAIL because the three evidence libraries do not exist.

- [ ] **Step 3: Build the official source catalog and exact matcher**

Install `pdfjs-dist`. `build-source-catalog.mjs` reads the official GESP and NOI/CCF paper index pages, follows only allowlisted document links, and writes entries keyed by exam date/year, GESP level or CSP group, document kind (`paper` or `answer`), URL, discovered page count, fetched time, and SHA-256. Check in the catalog, not downloaded PDFs. A question without a per-record URL resolves candidates from this catalog using its exam metadata; failure to resolve stays unverified rather than falling back to a search-engine copy.

Implement `source-match.mjs`. The matcher accepts only `https` URLs on the explicit official host allowlist (`gesp.ccf.org.cn`, `www.noi.cn`, and documented CCF subdomains), downloads the resolved PDF, verifies its current hash against the catalog, extracts candidate pages with `pdfjs-dist`, and normalizes whitespace, punctuation, full-width characters, and `A/B/C/D` prefixes. When no page is declared, search all pages in the resolved paper and require one unique best match above threshold.

`officialMatch` is true only when all of these hold:

- the source host is allowlisted and the page exists;
- normalized stem/options similarity is at least `0.92`;
- exactly one answer marker can be extracted from the official page or official answer page;
- the extracted official answer equals the canonical answer.

Return and cache `{ officialMatch, sourceUrl, sourcePage, sourceSha256, textSimilarity, extractedAnswerIndex, reason }`. A URL/page alone is never evidence.

```js
export async function matchOfficialSource(question, { extractPage = extractPdfPage, catalog = loadSourceCatalog() } = {}) {
  const resolved = resolveOfficialSource(question, catalog);
  if (!resolved || !isOfficialHttpsUrl(resolved.paperUrl)) {
    return { officialMatch: false, reason: 'missing_or_untrusted_source' };
  }
  const page = await extractBestPage(resolved.paperUrl, question, question.provenance.page, extractPage);
  const answerPage = resolved.answerUrl
    ? await extractBestPage(resolved.answerUrl, question, question.provenance.answerPage, extractPage)
    : page;
  const textSimilarity = compareQuestionToPage(question, page.text);
  const extractedAnswerIndex = extractUniqueAnswer(answerPage.text, question.exam.originalNumber);
  return {
    officialMatch: textSimilarity >= 0.92 && extractedAnswerIndex === question.answer.correctIndex,
    sourceUrl: resolved.paperUrl,
    sourcePage: page.pageNumber,
    sourceSha256: page.sha256,
    textSimilarity,
    extractedAnswerIndex,
    reason: textSimilarity < 0.92 ? 'content_mismatch' : extractedAnswerIndex === null ? 'answer_not_found' : 'matched',
  };
}
```

- [ ] **Step 4: Implement the bounded deterministic C++ solver**

`detectDeterministicCandidate` supports only choice questions whose code contains a complete `int main(...)` and rejects `cin`, `scanf`, `argv`, file APIs, process execution, sockets, threads, and non-deterministic time/random APIs. It never wraps incomplete snippets. `solveDeterministically` locates `clang++` or `g++`, compiles in `fs.mkdtemp`, runs via `spawnSync` with a 2-second timeout and a 1 MB output cap, then maps normalized stdout to exactly one normalized option. Compiler absence and unsupported code return `{ answerIndex: null, supported: false, reason }`; compile/runtime failures return evidence but never verify the question. Temp files are removed in `finally`.

```js
export async function solveDeterministically(question) {
  const candidate = detectDeterministicCandidate(question);
  if (!candidate.supported) return { answerIndex: null, ...candidate };
  const compiler = findCompiler();
  if (!compiler) return { answerIndex: null, supported: false, reason: 'compiler_unavailable' };
  const run = compileAndRun(question.code, compiler, { compileTimeoutMs: 5000, runTimeoutMs: 2000 });
  if (!run.ok) return { answerIndex: null, supported: true, reason: run.reason };
  return { answerIndex: matchUniqueOption(run.stdout, question.options), supported: true, stdoutHash: sha256(run.stdout) };
}
```

- [ ] **Step 5: Implement strict jury parsing and bounded retries**

```js
export function mergeJuryResponses(responses) {
  const valid = responses.filter(item => Number.isInteger(item.answerIndex) && typeof item.complete === 'boolean' && typeof item.ambiguous === 'boolean');
  return {
    modelAnswers: valid.map(item => item.answerIndex),
    modelComplete: valid.length >= 2 && valid.every(item => item.complete && !item.ambiguous),
  };
}

export async function callDeepSeekJury(question, role, apiKey) {
  const response = await fetchWithRetry('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro', temperature: role === 'critic' ? 0 : 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `你是${role}。不得查看或猜测题库答案，只根据题面返回JSON：{"answerIndex":0,"complete":true,"ambiguous":false,"reason":"..."}` },
        { role: 'user', content: JSON.stringify({ question: question.question, code: question.code, options: question.options, children: question.children }) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

`fetchWithRetry` retries HTTP 429/5xx and network failures at most three times with capped exponential backoff. Validate parsed keys and answer bounds before accepting a response. Keep solver A, solver B, and the completeness critic in separate API calls. The critic's `complete:false` or `ambiguous:true` makes `modelComplete:false`, so model evidence cannot auto-verify that question.

- [ ] **Step 6: Implement resumable evidence collection**

The collector skips records with an unchanged `contentHash`, obtains official evidence first, obtains deterministic evidence when supported, and calls the AI jury only when strong official evidence is absent. It requires `DEEPSEEK_API_KEY` only when an AI call is needed. Write `.tmp/question-bank-v2-evidence.json` atomically after every question so interruption loses no completed work.

```js
const sourceEvidence = await matchOfficialSource(question);
const deterministic = await solveDeterministically(question);
const jury = sourceEvidence.officialMatch
  ? { modelAnswers: [], modelComplete: false }
  : mergeJuryResponses(await Promise.all([
      callDeepSeekJury(question, '独立解题器A', process.env.DEEPSEEK_API_KEY),
      callDeepSeekJury(question, '独立解题器B', process.env.DEEPSEEK_API_KEY),
      callDeepSeekJury(question, '题面完整性批判器', process.env.DEEPSEEK_API_KEY),
    ]));
const record = {
  contentHash: question.contentHash,
  ...sourceEvidence,
  deterministicAnswer: deterministic.answerIndex,
  deterministic,
  ...jury,
  ...await verifyOrRepairExplanation(question, { sourceEvidence, deterministic, jury }),
};
```

- [ ] **Step 7: Verify or regenerate explanations after the answer is locked**

Implement `verifyOrRepairExplanation` in `ai-jury.mjs`. It runs only after official evidence, or deterministic plus model consensus, locks the canonical answer. Two isolated critics check whether the explanation derives that answer, agrees with `correctIndex`, uses only variables/conditions present in the question, and contains reasoning beyond “official answer is X”. If the existing explanation fails, make one generator call without exposing the old explanation, then run both critics again. Return `{ explanationVerified, publishedExplanation, explanationIssues, explanationAttempts }`. Never change `answer.correctIndex`; two failed explanation rounds leave the question `auto_probable` and unpublished.

```js
const explanationEvidence = await verifyOrRepairExplanation(question, lockedAnswerEvidence, apiKey);
if (explanationEvidence.explanationVerified) {
  record.publishedExplanation = explanationEvidence.publishedExplanation;
}
```

The publisher uses `publishedExplanation` for the student snapshot and includes its SHA-256 in the derived snapshot hash. It never publishes an unverified original explanation.

- [ ] **Step 8: Protect evidence cache and run focused smoke tests**

Add `.tmp/question-bank-v2-evidence.json` to `.gitignore`.

Run: `npx vitest run scripts/question-bank/question-bank-pipeline.test.mjs && DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" node scripts/question-bank/collect-evidence.mjs --limit=5`

Expected: official fixtures require a real content/answer match, the complete C++ fixture resolves to option B, an invalid explanation is regenerated and independently accepted, five content hashes are cached, and no API key appears in repository files or command output.

- [ ] **Step 9: Commit evidence collection**

```bash
git add scripts/question-bank/collect-evidence.mjs scripts/question-bank/build-source-catalog.mjs scripts/question-bank/lib/ai-jury.mjs scripts/question-bank/lib/source-match.mjs scripts/question-bank/lib/deterministic.mjs scripts/question-bank/question-bank-pipeline.test.mjs public/course-data/question-bank-v2/source-catalog.json .gitignore package.json package-lock.json
git commit -m "feat: collect automatic question evidence"
```

### Task 5: Generate Immutable Channel Snapshots

**Files:**
- Create: `scripts/question-bank/lib/channels.mjs`
- Create: `scripts/question-bank/publish-snapshots.mjs`
- Modify: `scripts/question-bank/question-bank-pipeline.test.mjs`
- Create: `public/course-data/question-bank-v2/manifest.json`
- Create: `public/course-data/question-bank-v2/daily-gesp.<sha12>.json`
- Create: `public/course-data/question-bank-v2/super-cspj.<sha12>.json`
- Create: `public/course-data/question-bank-v2/exam-questions.<sha12>.json`
- Create: `public/course-data/question-bank-v2/exam-manifests.<sha12>.json`
- Create: `public/course-data/question-bank-v2/dungeon-mixed.<sha12>.json`
- Create: `public/course-data/question-bank-v2/verification-summary.<sha12>.json`

- [ ] **Step 1: Add failing channel rule tests**

```js
import { buildChannels } from './lib/channels.mjs';

it('never publishes non-verified questions and keeps channels distinct', () => {
  const questions = [
    { id: 'g', source: 'gesp', type: 'choice', exam: { level: 2, group: null }, verificationStatus: 'auto_verified', code: null },
    { id: 'r', source: 'csp_exam', type: 'reading', exam: { level: null, group: 'J' }, verificationStatus: 'auto_verified', children: [{}] },
    { id: 'bad', source: 'gesp', type: 'choice', exam: { level: 2, group: null }, verificationStatus: 'disputed' },
  ];
  const channels = buildChannels(questions);
  expect(channels.daily.map(q => q.id)).toEqual(['g']);
  expect(channels.super.map(q => q.id)).toEqual(['r']);
  expect(Object.values(channels).flat().some(q => q.id === 'bad')).toBe(false);
});
```

- [ ] **Step 2: Implement explicit channel predicates**

```js
export function buildChannels(questions) {
  const verified = questions.filter(q => q.verificationStatus === 'auto_verified');
  return {
    daily: verified.filter(q => q.source === 'gesp' && q.type === 'choice'),
    super: verified.filter(q => q.source === 'csp_exam' && q.exam.group === 'J' && ['reading', 'fillBlank'].includes(q.type) && q.children.length > 0),
    exam: verified.filter(q => q.source === 'csp_exam' && ['J', 'S'].includes(q.exam.group)),
    dungeon: verified.filter(q =>
      (q.source === 'gesp' && q.type === 'choice' && q.exam.level >= 1 && q.exam.level <= 4) ||
      (q.source === 'csp_exam' && q.exam.group === 'J')
    ),
  };
}
```

- [ ] **Step 3: Implement hashed atomic publishing**

The publisher joins canonical questions with verdicts by `questionId/contentHash`, rejects stale evidence, filters every exam manifest to IDs present in the verified exam snapshot, and drops empty papers. It serializes each logical snapshot, computes SHA-256, writes immutable `<logical-name>.<sha12>.json` files through a temporary file plus atomic rename, retains the previous revision's hashed files, and writes `manifest.json` last. The raw manifest created in Task 2 is build input only; the published manifest can never reference a quarantined question.

```js
const manifest = {
  schemaVersion: 2,
  contentRevision: canonicalRevision,
  verificationRevision,
  channelRulesRevision: 1,
  generatedAt: new Date().toISOString(),
  files: Object.fromEntries(Object.entries(fileHashes).map(([logicalName, value]) => [logicalName, {
    path: value.path,
    sha256: value.sha256,
    bytes: value.bytes,
  }])),
};
```

- [ ] **Step 4: Run publisher and enforce release assertions**

Run: `node scripts/question-bank/publish-snapshots.mjs`

Expected: every snapshot contains only `auto_verified`, every exam manifest ID exists in the exam snapshot in official order, all manifest hashes match, and daily/super/exam/dungeon counts are printed.

- [ ] **Step 5: Commit snapshots and publisher**

```bash
git add scripts/question-bank/lib/channels.mjs scripts/question-bank/publish-snapshots.mjs scripts/question-bank/question-bank-pipeline.test.mjs public/course-data/question-bank-v2
git commit -m "feat: publish verified question channels"
```

### Task 6: Offline-First V2 Question Repository

**Files:**
- Create: `src/question-bank/repository.ts`
- Create: `src/question-bank/repository.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing cache priority tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { chooseQuestionSnapshot } from './repository';

describe('question bank v2 repository', () => {
  it('prefers a newer valid cache over bundled data', () => {
    expect(chooseQuestionSnapshot(
      { revision: 3, valid: true, data: ['cache'] },
      null,
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['cache']);
  });
  it('falls back to bundled data when cache hash is invalid', () => {
    expect(chooseQuestionSnapshot(
      { revision: 3, valid: false, data: ['bad'] },
      null,
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['bundle']);
  });
  it('uses the previous valid remote revision when the current slot is corrupt', () => {
    expect(chooseQuestionSnapshot(
      { revision: 4, valid: false, data: ['bad-current'] },
      { revision: 3, valid: true, data: ['previous'] },
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['previous']);
  });
});
```

- [ ] **Step 2: Implement repository selection and hash validation**

```ts
interface SnapshotCandidate<T> { revision: number; valid: boolean; data: T }

export function chooseQuestionSnapshot<T>(current: SnapshotCandidate<T> | null, previous: SnapshotCandidate<T> | null, bundled: SnapshotCandidate<T>): SnapshotCandidate<T> {
  return [current, previous, bundled].filter(candidate => candidate?.valid).sort((a, b) => b.revision - a.revision)[0];
}

export const V2_KEYS = {
  current: 'question_bank_v2_current',
  previous: 'question_bank_v2_previous',
} as const;
```

The repository loads bundled `/course-data/question-bank-v2/manifest.json`, follows only the relative hashed paths declared there, and verifies cached snapshot hashes with `crypto.subtle.digest('SHA-256', ...)`. Expose `beginQuestionBankSession(requiredChannels)`, returning one immutable `{ revision, channels, examManifests }` object; a running quiz or battle keeps this object until completion, so a background update only affects the next session.

`refreshQuestionBankV2` fetches `https://api.cspstudy.top/api/question-bank/v2/manifest`, downloads only changed files, verifies every hash, then atomically rotates `current` to `previous` and promotes the new complete revision to `current`. Partial downloads are discarded. If current is corrupt, use previous; if both are unusable, use the bundled revision. Emit only non-personal operational events `{ source, revision, cacheValid, emptyQuestionCount, renderFailureCount }` through the existing telemetry path.

- [ ] **Step 3: Add corrupt-cache and remote-failure tests**

Stub `fetch` to reject and localStorage to contain invalid JSON. Add a partial-update fixture, a valid previous slot, and a manifest rollback from revision 4 to revision 3. Expected: the previous or bundled snapshot loads successfully, a server rollback can become current after hash validation, one session remains on its original revision, and no exception reaches the caller.

- [ ] **Step 4: Initialize background refresh in App**

```ts
import { refreshQuestionBankV2 } from './question-bank/repository';

// During existing startup effects; never await this call.
void refreshQuestionBankV2().catch(() => {});
```

- [ ] **Step 5: Run client tests and commit**

Run: `npx vitest run src/question-bank/repository.test.ts && npm run build`

Expected: repository tests PASS and production build succeeds.

```bash
git add src/question-bank/repository.ts src/question-bank/repository.test.ts src/App.tsx
git commit -m "feat: add offline-first question repository"
```

### Task 7: Migrate All Four Student Entry Points

**Files:**
- Modify: `src/components/quiz/QuizPractice.tsx`
- Modify: `src/components/exam/ExamTraining.tsx`
- Modify: `src-dungeon/utils/questionLoader.ts`
- Modify: `src-dungeon/utils/questionLoader.test.ts`
- Test: `src/question-bank/channel-integration.test.ts`

- [ ] **Step 1: Add failing integration tests for each channel**

```ts
import { expect, it } from 'vitest';
import { adaptDailyQuestion, adaptExamQuestion, adaptDungeonQuestion } from './adapters';

it('adapts one canonical answer identically across daily, exam, and dungeon', () => {
  const canonical = { id: 'shared', type: 'choice', question: 'q', code: null, assets: [], options: ['A','B','C','D'], answer: { correctIndex: 2 }, children: [], explanation: 'e', knowledgePoint: 'k', difficulty: 1, exam: { year: 2024, group: 'J', level: null } } as any;
  expect(adaptDailyQuestion(canonical).correctIndex).toBe(2);
  expect(adaptExamQuestion(canonical).correctIndex).toBe(2);
  expect(adaptDungeonQuestion(canonical).correctIndex).toBe(2);
});
```

- [ ] **Step 2: Create focused adapters**

Create `src/question-bank/adapters.ts` with one adapter per existing UI contract. Each adapter maps `answer.correctIndex` to `correctIndex`, maps the first trusted asset to `image`, preserves `children`, and never changes the answer. Add stable `data-testid` values to the existing rendering surfaces: `question-id`, `question-stem`, `question-code`, `question-option`, `exam-paper`, and `dungeon-question-modal`; these are test hooks only and add no visible instructional text.

- [ ] **Step 3: Switch daily and super modes**

Replace `loadVersionedRemoteJson` in `QuizPractice.tsx` with:

```ts
const channel = mode === 'super' ? 'super' : 'daily';
const session = await beginQuestionBankSession([channel]);
const questions = session.channels[channel];
```

Remove the old `source === 'csp_exam' || source === 'gesp'` mixed daily fallback. Review mode resolves error IDs against the union of published channels without loading unverified canonical data.

- [ ] **Step 4: Switch CSP-J/S training**

Replace `csp-exam-bank.json` loading with `beginQuestionBankSession(['exam'])` and read both `session.channels.exam` and `session.examManifests`, guaranteeing the same v2 revision. Keep existing `ExamChoice` and `ExamMultiPart` components; adapt canonical children to their current props.

- [ ] **Step 5: Switch dungeon loading**

Replace legacy `dungeon-exam-bank.json` and desktop-bank merging in `questionLoader.ts` with `beginQuestionBankSession(['dungeon'])`. Keep that session object for the entire battle. Keep `isBrokenCodeQuestion` as defense in depth, but treat any published broken question as a test failure.

- [ ] **Step 6: Run all integration and UI unit tests**

Run: `npx vitest run src/question-bank src-dungeon/utils/questionLoader.test.ts && npm test && npm run build`

Expected: all tests PASS, no student component imports a legacy bank filename, and production build succeeds.

- [ ] **Step 7: Commit the four-entry migration**

```bash
git add src/question-bank/adapters.ts src/question-bank/channel-integration.test.ts src/components/quiz/QuizPractice.tsx src/components/exam/ExamTraining.tsx src-dungeon/utils/questionLoader.ts src-dungeon/utils/questionLoader.test.ts
git commit -m "feat: migrate student practice to verified channels"
```

### Task 8: Public V2 API And Teacher Verification Summary

**Files:**
- Modify: `cf-workers/api.js`
- Modify: `teacher-app/index.html`
- Test: `scripts/question-bank/api-contract.test.mjs`

- [ ] **Step 1: Add failing API contract tests**

Test the public manifest response fields and assert that snapshot routes reject filenames not present in the manifest.

```js
expect(manifest.schemaVersion).toBe(2);
expect(manifest.files['daily-gesp.json'].sha256).toMatch(/^[a-f0-9]{64}$/);
expect(new Set(['daily-gesp.json','super-cspj.json','exam-questions.json','dungeon-mixed.json']).has(requestedFile)).toBe(true);
```

- [ ] **Step 2: Add cached public routes**

```js
const QUESTION_BANK_V2_BASE = 'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data/question-bank-v2';

if (path === '/api/question-bank/v2/manifest' && request.method === 'GET') {
  const response = await fetch(`${QUESTION_BANK_V2_BASE}/manifest.json`, { cf: { cacheTtl: 60, cacheEverything: true } });
  return new Response(response.body, { status: response.status, headers: { ...cors, 'Cache-Control': 'public, max-age=60' } });
}
const v2Match = path.match(/^\/api\/question-bank\/v2\/(daily-gesp|super-cspj|exam-questions|exam-manifests|dungeon-mixed|verification-summary)\.json$/);
if (v2Match && request.method === 'GET') {
  const logicalName = `${v2Match[1]}.json`;
  const manifestResponse = await fetch(`${QUESTION_BANK_V2_BASE}/manifest.json`, { cf: { cacheTtl: 60, cacheEverything: true } });
  const manifest = await manifestResponse.json();
  const file = manifest.files?.[logicalName];
  if (!file || !new RegExp(`^${v2Match[1]}\\.[a-f0-9]{12}\\.json$`).test(file.path)) return json({ error: 'snapshot not found' }, 404, cors);
  const response = await fetch(`${QUESTION_BANK_V2_BASE}/${file.path}`, { cf: { cacheTtl: 31536000, cacheEverything: true } });
  return new Response(response.body, { status: response.status, headers: { ...cors, 'Cache-Control': 'public, max-age=3600' } });
}
```

- [ ] **Step 3: Add teacher summary display**

In the existing question-bank tab startup path, fetch `/api/question-bank/v2/verification-summary.json` and render a full-width read-only `#v2VerificationSummary` band above the filters. Bind these exact fields: `canonicalCount`, `statusCounts.auto_verified`, `statusCounts.auto_probable`, `statusCounts.disputed`, `statusCounts.broken`, all four `channelCounts`, `contentRevision`, `verificationRevision`, `channelRulesRevision`, and `generatedAt`. Show `题库验证摘要暂不可用` on fetch failure while leaving existing edit/search functions usable. Add an API contract fixture and a DOM test that asserts all four status values and four channel values render. Do not add manual approval as a publishing requirement.

- [ ] **Step 4: Test Worker locally and deploy**

Run: `npx vitest run scripts/question-bank/api-contract.test.mjs && npx wrangler dev --config wrangler.toml`

Expected: manifest, verification summary, and one snapshot return HTTP 200 with expected cache headers; an unallowlisted filename returns 404.

Deploy with the existing Cloudflare token supplied through the environment, never a committed file:

```bash
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" npx wrangler deploy --config wrangler.toml
```

- [ ] **Step 5: Commit API and teacher summary**

```bash
git add cf-workers/api.js teacher-app/index.html scripts/question-bank/api-contract.test.mjs
git commit -m "feat: publish verified question bank api"
```

### Task 9: Release Gate, Visual E2E, And Desktop Cutover

**Files:**
- Create: `scripts/question-bank/release-gate.mjs`
- Create: `tests/question-bank-v2.e2e.spec.ts`
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `public/course-data/version.json`

- [ ] **Step 1: Install Playwright and add release commands**

Run: `npm install --save-dev @playwright/test && npx playwright install chromium`

Expected: `@playwright/test` is present in `devDependencies` and Chromium launches from a one-line smoke test.

```json
{
  "scripts": {
    "question-bank:export": "node scripts/question-bank/export-reviewed-bank.mjs",
    "question-bank:build": "node scripts/question-bank/build-canonical.mjs",
    "question-bank:evidence": "node scripts/question-bank/collect-evidence.mjs",
    "question-bank:verify": "node scripts/question-bank/verify-canonical.mjs",
    "question-bank:publish": "node scripts/question-bank/publish-snapshots.mjs",
    "question-bank:gate": "node scripts/question-bank/release-gate.mjs",
    "question-bank:pipeline": "npm run question-bank:export && npm run question-bank:build && npm run question-bank:evidence && npm run question-bank:verify && npm run question-bank:publish && npm run question-bank:gate"
  }
}
```

- [ ] **Step 2: Implement hard release assertions**

The gate exits non-zero when any **published** blocker count is non-zero, a manifest hash differs, a snapshot contains a non-verified ID, channel revisions differ, or any required channel is empty. `disputed` and `broken` records may remain in canonical quarantine and appear in the teacher summary; their presence does not block a release unless one leaks into a student snapshot.

```js
const failures = [
  summary.publishedBlockers !== 0 && `publishedBlockers=${summary.publishedBlockers}`,
  summary.leakedImages !== 0 && `leakedImages=${summary.leakedImages}`,
  summary.crossChannelMismatches !== 0 && `crossChannelMismatches=${summary.crossChannelMismatches}`,
  ...Object.entries(summary.channelCounts).filter(([, count]) => count === 0).map(([name]) => `${name}=0`),
].filter(Boolean);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
```

- [ ] **Step 3: Add seeded Playwright scenarios**

Create `playwright.config.ts` with `webServer.command: 'npm run dev -- --host 127.0.0.1'`, an unused local port, Chromium only, and desktop plus minimum-window projects. Add a test-only query parameter `?questionSeed=20260722` that seeds existing random selection without changing production behavior.

```ts
import { expect, test } from '@playwright/test';

for (const scenario of [
  { name: 'daily', tab: 'quiz', mode: 'daily' },
  { name: 'super', tab: 'quiz', mode: 'super' },
  { name: 'csp-j', tab: 'exam', mode: 'J' },
  { name: 'csp-s', tab: 'exam', mode: 'S' },
  { name: 'dungeon-normal', tab: 'dungeon', mode: 'normal' },
  { name: 'dungeon-boss', tab: 'dungeon', mode: 'boss' },
]) {
  test(`${scenario.name} renders a complete verified question`, async ({ page }) => {
    await page.goto(`/?tab=${scenario.tab}&mode=${scenario.mode}&questionSeed=20260722`);
    await expect(page.getByTestId('question-stem')).not.toHaveText('');
    await expect(page.getByTestId('question-option')).toHaveCount(4);
    await expect(page.locator('img')).not.toHaveJSProperty('naturalWidth', 0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth));
    await page.screenshot({ path: `test-results/${scenario.name}.png`, fullPage: true });
  });
}
```

Add separate tests that abort `/api/question-bank/v2/**` to prove bundled offline launch, place malformed JSON plus a false hash in every `question_bank_v2_*` cache key to prove fallback, and compare `question-id` plus a test-only answer attribute across all applicable channels. Each screenshot assertion checks a nonblank stem, four nonempty options, loaded images, and no horizontal overflow.

- [ ] **Step 4: Run the full release gate**

Run:

```bash
DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" npm run question-bank:pipeline
npm test
npm run build
npx playwright test tests/question-bank-v2.e2e.spec.ts
```

Expected: every command exits 0; four channel screenshots are nonblank and visually coherent.

- [ ] **Step 5: Bump the desktop release and build installers**

Increment the patch version consistently in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Build the signed release using the existing project release procedure.

Run: `npm run tauri build`

Expected: installer artifacts are created and include `public/course-data/question-bank-v2`.

- [ ] **Step 6: Verify upgrade behavior**

Install over an existing profile and verify pet data, class binding, coins, progress, errors, and achievements remain unchanged. Confirm only `question_bank_v2_*` keys are added and legacy question cache keys are not deleted during the first release cycle.

- [ ] **Step 7: Commit the release cutover**

```bash
git add scripts/question-bank/release-gate.mjs tests/question-bank-v2.e2e.spec.ts playwright.config.ts package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json public/course-data/version.json
git commit -m "release: cut over to verified question bank v2"
```

## Final Verification

- [ ] Run `rg -n "unified-quiz-bank|csp-exam-bank|dungeon-exam-bank" src src-dungeon` and confirm no normal student loader references legacy files.
- [ ] Fetch the deployed v2 manifest and verify every remote SHA-256 against local release artifacts.
- [ ] Launch with network disabled and complete one session in each of the four entry points.
- [ ] Launch with a corrupt v2 cache and confirm the bundled verified snapshot loads.
- [ ] Confirm teacher summary counts match `verification-summary.json`.
- [ ] Push the release commit to both Gitee and GitHub only after all gates pass.
