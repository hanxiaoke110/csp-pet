import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callDeepSeekJury, mergeJuryResponses, verifyOrRepairExplanation } from './lib/ai-jury.mjs';
import { solveDeterministically } from './lib/deterministic.mjs';
import { matchOfficialSource } from './lib/source-match.mjs';
import { validateQuestion } from './lib/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function parseLimit() {
  const value = process.argv.find(argument => argument.startsWith('--limit='));
  return value ? Number(value.slice('--limit='.length)) : Number.POSITIVE_INFINITY;
}

export async function collectEvidence({
  canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json'),
  evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json'),
  limit = parseLimit(),
  apiKey = process.env.DEEPSEEK_API_KEY,
} = {}) {
  const canonical = readJson(canonicalPath, { questions: [] });
  const evidence = readJson(evidencePath, {});
  const pdfCache = new Map();
  let processed = 0;

  for (const question of canonical.questions) {
    if (processed >= limit) break;
    if (evidence[question.id]?.contentHash === question.contentHash) continue;
    if (validateQuestion(question).blockers.length > 0) continue;

    const sourceEvidence = await matchOfficialSource(question, { cache: pdfCache });
    const deterministic = await solveDeterministically(question);
    let jury = { modelAnswers: [], modelComplete: false, modelReasons: [] };
    if (!sourceEvidence.officialMatch && apiKey && question.options.length > 0) {
      const responses = await Promise.all([
        callDeepSeekJury(question, '独立解题器A', apiKey),
        callDeepSeekJury(question, '独立解题器B', apiKey),
        callDeepSeekJury(question, '题面完整性批判器', apiKey),
      ]);
      jury = mergeJuryResponses(responses, question.options.length);
    }
    const answerLocked = sourceEvidence.officialMatch
      || (deterministic.answerIndex === question.answer.correctIndex
        && jury.modelComplete
        && jury.modelAnswers.every(answer => answer === question.answer.correctIndex));
    const explanation = sourceEvidence.explanationVerified
      ? {
          explanationVerified: true,
          publishedExplanation: sourceEvidence.publishedExplanation,
        }
      : await verifyOrRepairExplanation(question, answerLocked, apiKey);

    evidence[question.id] = {
      contentHash: question.contentHash,
      collectedAt: new Date().toISOString(),
      ...sourceEvidence,
      deterministicAnswer: deterministic.answerIndex,
      deterministic,
      ...jury,
      ...explanation,
    };
    writeJsonAtomic(evidencePath, evidence);
    processed += 1;
    if (processed % 25 === 0) console.log(`Collected evidence for ${processed} questions.`);
  }
  return { processed, cached: Object.keys(evidence).length, evidence };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  collectEvidence().then(result => {
    console.log(`Evidence collection complete: processed=${result.processed}, cached=${result.cached}.`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
