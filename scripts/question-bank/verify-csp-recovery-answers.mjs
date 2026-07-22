import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stableContentHash } from './lib/normalize.mjs';
import { callBatch } from './verify-csp-batches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(root, 'reports/csp-sources');
const reportPath = path.join(sourceRoot, 'choice-recovery-report.json');
const candidatePath = path.join(sourceRoot, 'canonical-choice-recovery-candidate.json');
const outputPath = path.join(sourceRoot, 'choice-recovery-ai-answers.json');

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function groups(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function withAnswer(question, correctIndex) {
  const core = { ...question, answer: { correctIndex } };
  const { contentHash: _oldHash, importOrigin, importPriority, ...hashable } = core;
  return { ...hashable, importOrigin, importPriority, contentHash: stableContentHash(hashable) };
}

export async function verifyCspRecoveryAnswers({ apiKey = process.env.DEEPSEEK_API_KEY } = {}) {
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const byId = new Map(candidate.questions.map(question => [question.id, question]));
  const targetIds = report.records.filter(record => record.status === 'needs_ai_answer').map(record => record.id);
  const existing = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
    : { schemaVersion: 1, results: [] };
  const results = new Map(existing.results.map(result => [result.questionId, result]));

  for (const batch of groups(targetIds.filter(id => !results.has(id)).map(id => byId.get(id)), 1)) {
    console.log(`Solving recovery answers: ${batch.map(question => question.id).join(', ')}`);
    const roleNames = ['独立解题器A', '独立解题器B', '反例检查器A', '反例检查器B'];
    const roleMaps = await Promise.all(roleNames.map(role => callBatch(role, batch, apiKey, false)));
    for (const question of batch) {
      const responses = roleMaps.map(map => map.get(question.id));
      const answers = responses.map(response => response.answers[0]);
      const complete = responses.every(response => response.complete && !response.ambiguous);
      const unanimous = complete && answers.every(answer => answer === answers[0]);
      results.set(question.id, {
        questionId: question.id,
        answers,
        complete,
        unanimous,
        correctIndex: unanimous ? answers[0] : null,
        issues: responses.flatMap(response => response.issues || []),
      });
    }
    writeJsonAtomic(outputPath, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      results: [...results.values()].sort((left, right) => left.questionId.localeCompare(right.questionId)),
    });
  }

  let applied = 0;
  candidate.questions = candidate.questions.map(question => {
    const result = results.get(question.id);
    if (!result?.unanimous) return question;
    applied += 1;
    return withAnswer(question, result.correctIndex);
  });
  candidate.generatedAt = new Date().toISOString();
  writeJsonAtomic(candidatePath, candidate);
  for (const record of report.records) {
    const result = results.get(record.id);
    if (!result) continue;
    record.aiAnswers = result.answers;
    record.resolvedAnswer = result.correctIndex;
    record.status = result.unanimous ? 'ready_ai_unanimous' : 'quarantined_ai_dispute';
  }
  report.counts = report.records.reduce((counts, record) => {
    counts[record.status] = (counts[record.status] || 0) + 1;
    return counts;
  }, {});
  report.aiAnswerApplied = applied;
  writeJsonAtomic(reportPath, report);
  return { applied, counts: report.counts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyCspRecoveryAnswers()
    .then(result => console.log(`Applied ${result.applied} unanimous recovery answers: ${JSON.stringify(result.counts)}`))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
