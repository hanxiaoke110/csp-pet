import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideVerdict } from './lib/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function verifyCanonicalBank({
  canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json'),
  evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json'),
  outputPath = path.join(root, 'public/course-data/question-bank-v2/verification.json'),
} = {}) {
  const canonical = readJson(canonicalPath);
  const evidence = fs.existsSync(evidencePath) ? readJson(evidencePath) : {};
  const results = canonical.questions.map(question => {
    const cached = evidence[question.id];
    const currentEvidence = cached?.contentHash === question.contentHash
      ? cached
      : {
          contentHash: question.contentHash,
          officialMatch: false,
          deterministicAnswer: null,
          modelAnswers: [],
          modelComplete: false,
          explanationVerified: false,
        };
    return {
      questionId: question.id,
      contentHash: question.contentHash,
      ...decideVerdict(question, currentEvidence),
    };
  });
  const statusCounts = Object.fromEntries(
    ['auto_verified', 'auto_probable', 'disputed', 'broken']
      .map(status => [status, results.filter(result => result.status === status).length]),
  );
  const output = {
    schemaVersion: 2,
    contentRevision: canonical.contentRevision,
    verificationRevision: canonical.contentRevision,
    generatedAt: new Date().toISOString(),
    questionCount: results.length,
    statusCounts,
    results,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyCanonicalBank();
    console.log(`Verified ${result.questionCount} questions: ${JSON.stringify(result.statusCounts)}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
