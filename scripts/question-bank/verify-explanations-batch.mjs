import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json');
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');
const BATCH_SIZE = 10;

function writeAtomic(value) {
  const temporary = `${evidencePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, evidencePath);
}

async function callCritic(batch, role, apiKey) {
  const response = await fetch(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `你是${role}。逐题检查解析能否推出给定正确答案、字母与索引是否一致、是否引用不存在条件、是否有实际推理。只返回JSON：{"results":[{"id":"题号","valid":true,"issues":[]}]}。不得遗漏题目。`,
        },
        { role: 'user', content: JSON.stringify(batch) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek explanation critic HTTP ${response.status}`);
  const payload = JSON.parse((await response.json()).choices?.[0]?.message?.content || '{}');
  if (!Array.isArray(payload.results)) throw new Error('DeepSeek explanation critic returned invalid JSON');
  return new Map(payload.results
    .filter(result => typeof result.id === 'string' && typeof result.valid === 'boolean')
    .map(result => [result.id, result]));
}

export async function verifyExplanationBatches({ apiKey = process.env.DEEPSEEK_API_KEY } = {}) {
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');
  const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const queue = canonical.questions.filter(question => {
    const record = evidence[question.id];
    return record?.contentHash === question.contentHash
      && record.officialMatch
      && !record.explanationVerified
      && question.explanation.trim().length >= 8;
  });

  let accepted = 0;
  for (let offset = 0; offset < queue.length; offset += BATCH_SIZE) {
    const questions = queue.slice(offset, offset + BATCH_SIZE);
    const batch = questions.map(question => ({
      id: question.id,
      question: question.question,
      code: question.code,
      options: question.options,
      correctIndex: question.answer.correctIndex,
      explanation: question.explanation,
    }));
    const [criticA, criticB] = await Promise.all([
      callCritic(batch, '解析正确性批判器A', apiKey),
      callCritic(batch, '解析正确性批判器B', apiKey),
    ]);
    for (const question of questions) {
      const left = criticA.get(question.id);
      const right = criticB.get(question.id);
      const valid = left?.valid === true && right?.valid === true;
      evidence[question.id] = {
        ...evidence[question.id],
        explanationVerified: valid,
        publishedExplanation: valid ? question.explanation : null,
        explanationChecks: [left, right].filter(Boolean),
      };
      if (valid) accepted += 1;
    }
    writeAtomic(evidence);
    console.log(`Explanation batches: ${Math.min(offset + BATCH_SIZE, queue.length)}/${queue.length}, accepted=${accepted}.`);
  }
  return { checked: queue.length, accepted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyExplanationBatches().then(result => {
    console.log(`Explanation verification complete: ${JSON.stringify(result)}.`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
