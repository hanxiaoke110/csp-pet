import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeLegacyQuestion } from './lib/normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, 'scripts/question-bank/data/original-topic-practice.json');
const canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json');
const examManifestsPath = path.join(root, 'public/course-data/question-bank-v2/exam-manifests.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

const sourceRaw = fs.readFileSync(sourcePath);
const sourceSha256 = createHash('sha256').update(sourceRaw).digest('hex');
const source = JSON.parse(sourceRaw);
const canonical = readJson(canonicalPath);
const examManifests = readJson(examManifestsPath);
const originalQuestions = source.questions.map(raw => ({
  ...normalizeLegacyQuestion(raw),
  importOrigin: 'original_topic_practice',
  importPriority: 80,
}));

if (originalQuestions.length !== source.questionCount || originalQuestions.length !== 82) {
  throw new Error(`Original source count mismatch: ${originalQuestions.length}/${source.questionCount}`);
}

const previousOriginalCount = canonical.questions.filter(question => question.source === 'practice_original').length;
const unchanged = canonical.originalTopicSourceSha256 === sourceSha256
  && previousOriginalCount === originalQuestions.length;

if (unchanged) {
  console.log(`Original topic-practice source already applied (${originalQuestions.length} questions).`);
  process.exit(0);
}

const nextRevision = canonical.contentRevision + 1;
const questions = canonical.questions
  .filter(question => question.source !== 'practice_original')
  .concat(originalQuestions)
  .sort((left, right) => left.id.localeCompare(right.id));
const generatedAt = new Date().toISOString();

writeJsonAtomic(canonicalPath, {
  ...canonical,
  contentRevision: nextRevision,
  generatedAt,
  questionCount: questions.length,
  originalTopicSourceSha256: sourceSha256,
  questions,
});
writeJsonAtomic(examManifestsPath, {
  ...examManifests,
  contentRevision: nextRevision,
  generatedAt,
});

console.log(`Applied ${originalQuestions.length} original questions; canonical ${canonical.questionCount} -> ${questions.length}.`);
