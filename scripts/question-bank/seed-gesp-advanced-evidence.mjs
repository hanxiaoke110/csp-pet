import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, 'scripts/question-bank/data/gesp-advanced-choice.json');
const canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json');
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');

function readJson(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

export function seedAdvancedGespEvidence() {
  const source = readJson(sourcePath);
  const canonical = readJson(canonicalPath);
  if (!source?.review?.approved || !Array.isArray(source.questions)) {
    throw new Error('Advanced GESP source is missing an approved review record.');
  }
  const sourceIds = new Set(source.questions.map(question => question.id));
  const canonicalById = new Map(canonical.questions.map(question => [question.id, question]));
  const evidence = readJson(evidencePath, {});
  let seeded = 0;

  for (const questionId of sourceIds) {
    const question = canonicalById.get(questionId);
    if (!question) throw new Error(`Advanced GESP question missing from canonical bank: ${questionId}`);
    evidence[questionId] = {
      contentHash: question.contentHash,
      collectedAt: new Date().toISOString(),
      officialMatch: false,
      deterministicAnswer: null,
      modelAnswers: [],
      modelComplete: false,
      explanationVerified: true,
      publishedExplanation: question.explanation,
      manualVerified: {
        approved: true,
        reviewer: source.review.reviewer,
        reviewedAt: source.review.reviewedAt,
        reason: source.review.basis,
        sourceDigest: source.sourceDigest,
      },
    };
    seeded += 1;
  }

  writeJsonAtomic(evidencePath, evidence);
  return { seeded };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = seedAdvancedGespEvidence();
    console.log(`Seeded review evidence for ${result.seeded} advanced GESP questions.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
