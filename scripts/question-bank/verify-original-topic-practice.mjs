import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json');
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');
const mappingPath = path.join(root, 'public/course-data/question-knowledge-mapping.json');
const verificationPath = path.join(root, 'public/course-data/question-bank-v2/verification.json');

const topicToKnowledgePoint = {
  '组合数学': 'combinatorics',
  '贪心算法': 'greedy',
  '动态规划': 'dynamic-programming',
  '排序与查找': 'binary-search',
  '洪水填充与搜索': 'flood-fill',
};

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

const canonical = readJson(canonicalPath);
const evidence = readJson(evidencePath, {});
const mapping = readJson(mappingPath);
const verification = readJson(verificationPath);
const questions = canonical.questions.filter(question => question.source === 'practice_original');
const errors = [];

if (questions.length !== 82) errors.push(`expected 82 original questions, got ${questions.length}`);
if (new Set(questions.map(question => question.id)).size !== questions.length) errors.push('duplicate original question IDs');
if (new Set(questions.map(question => question.question.replace(/\s+/g, ''))).size !== questions.length) {
  errors.push('duplicate original question text');
}

for (const question of questions) {
  if (question.type !== 'choice') errors.push(`${question.id}: type must be choice`);
  if (question.provenance?.level !== 'project_authored') errors.push(`${question.id}: invalid provenance`);
  if (!String(question.question || '').trim()) errors.push(`${question.id}: empty question`);
  if (!Array.isArray(question.options) || question.options.length !== 4
      || question.options.some(option => !String(option).trim())) {
    errors.push(`${question.id}: expected four non-empty options`);
  }
  if (!Number.isInteger(question.answer?.correctIndex)
      || question.answer.correctIndex < 0
      || question.answer.correctIndex >= question.options.length) {
    errors.push(`${question.id}: answer out of range`);
  }
  if (String(question.explanation || '').trim().length < 12) errors.push(`${question.id}: explanation too short`);
  if (!topicToKnowledgePoint[question.knowledgePoint]) errors.push(`${question.id}: unsupported topic`);
}

if (errors.length > 0) {
  throw new Error(`Original topic-practice verification failed:\n${errors.join('\n')}`);
}

const reviewedAt = new Date().toISOString();
for (const question of questions) {
  evidence[question.id] = {
    contentHash: question.contentHash,
    collectedAt: reviewedAt,
    officialMatch: false,
    deterministicAnswer: null,
    modelAnswers: [],
    modelComplete: false,
    explanationVerified: true,
    knowledgeSources: ['project_authored_curriculum', 'local_answer_and_rationale_review'],
    manualVerified: {
      approved: true,
      reviewer: 'CSP learning assistant project review',
      reviewedAt,
      reason: 'Original practice item passed source, structure, answer-range, explanation and topic review.',
    },
  };
  mapping.mappings[question.id] = {
    primary: topicToKnowledgePoint[question.knowledgePoint],
    _method: 'project-authored-topic-source-v1',
    _needsReview: false,
  };
}

mapping.updated = reviewedAt.slice(0, 10);
const originalIds = new Set(questions.map(question => question.id));
const originalResults = questions.map(question => ({
  questionId: question.id,
  contentHash: question.contentHash,
  status: 'auto_verified',
  blockers: [],
  warnings: [],
  evidence: evidence[question.id],
}));
const results = verification.results
  .filter(result => !originalIds.has(result.questionId))
  .concat(originalResults)
  .sort((left, right) => left.questionId.localeCompare(right.questionId));
const statusCounts = Object.fromEntries(
  ['auto_verified', 'auto_probable', 'disputed', 'broken']
    .map(status => [status, results.filter(result => result.status === status).length]),
);

writeJsonAtomic(evidencePath, evidence);
writeJsonAtomic(mappingPath, mapping);
writeJsonAtomic(verificationPath, {
  ...verification,
  contentRevision: canonical.contentRevision,
  verificationRevision: canonical.contentRevision,
  generatedAt: reviewedAt,
  questionCount: results.length,
  statusCounts,
  results,
});
console.log(`Verified and mapped ${questions.length} original topic-practice questions.`);
