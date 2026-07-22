import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  answerVectorsEqual,
  canonicalAnswerVector,
  collectImportConsensus,
  loadQuestionSnapshot,
} from './lib/csp-evidence.mjs';
import { validateQuestion } from './lib/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const MAX_TOKENS = Math.max(1024, Number(process.env.DEEPSEEK_MAX_TOKENS || 16384));

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function batch(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function stripJsonFence(value) {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

async function fetchWithRetry(url, init, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = new Error(`DeepSeek HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(8_000, 1_000 * (2 ** attempt))));
  }
  throw lastError;
}

function questionPayload(question, includeExplanation) {
  const base = {
    id: question.id,
    type: question.type,
    question: question.question,
    code: question.code,
    options: question.options,
    children: question.children.map(child => ({
      label: child.label,
      position: child.position,
      options: child.options,
      ...(includeExplanation ? { explanation: child.explanation } : {}),
    })),
  };
  return includeExplanation ? { ...base, explanation: question.explanation } : base;
}

function resultIsValid(result, question) {
  const optionCounts = question.children.length > 0
    ? question.children.map(child => child.options.length)
    : [question.options.length];
  const answerIsValid = (answer, index) => Number.isInteger(answer)
    && answer >= 0
    && answer < optionCounts[index];
  return result
    && result.id === question.id
    && Array.isArray(result.answers)
    && result.answers.length === optionCounts.length
    && typeof result.complete === 'boolean'
    && typeof result.ambiguous === 'boolean'
    && result.answers.every((answer, index) => answerIsValid(answer, index)
      || ((result.complete === false || result.ambiguous === true) && answer === null));
}

function normalizeUnanswerableResult(result, question) {
  if (!result || result.id !== question.id || typeof result.complete !== 'boolean'
      || typeof result.ambiguous !== 'boolean' || (result.complete && !result.ambiguous)) return result;
  const expectedLength = question.children.length > 0 ? question.children.length : 1;
  return {
    ...result,
    answers: Array(expectedLength).fill(null),
    issues: [
      ...(Array.isArray(result.issues) ? result.issues : []),
      result.ambiguous ? '模型判定题目存在多解或歧义' : '模型判定题面不完整',
    ],
  };
}

export async function callBatch(role, questions, apiKey, includeExplanation, retryDepth = 0) {
  const isCritic = role.includes('批判器');
  const response = await fetchWithRetry(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: isCritic ? 0 : 0.15,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            `你是CSP-J/S真题${role}。必须逐题独立推导，不采信也不要猜测题库答案。`,
            'answers按题目或各子题顺序给出0起始选项下标。题面、代码或选项不足时complete=false；存在多解时ambiguous=true。',
            includeExplanation
              ? '同时严格检查题目解析及每个子题解析是否与推导一致、无关键逻辑错误，设置explanationsValid。'
              : '不要评价题库解析。',
            '只返回JSON对象：{"results":[{"id":"原id","answers":[0],"complete":true,"ambiguous":false,"explanationsValid":true,"issues":[]}] }。',
            '不得遗漏输入中的任何id，issues只写简短且具体的问题。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify(questions.map(question => questionPayload(question, includeExplanation))),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(data.choices?.[0]?.message?.content));
  } catch (error) {
    if (retryDepth < 2) {
      console.warn(`${role}: retrying malformed JSON for ${questions.map(question => question.id).join(', ')}`);
      return callBatch(role, questions, apiKey, includeExplanation, retryDepth + 1);
    }
    throw new Error(`${role} returned malformed JSON: ${error.message}`);
  }
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const questionsById = new Map(questions.map(question => [question.id, question]));
  const byId = new Map(results.map(result => {
    const question = questionsById.get(result.id);
    return [result.id, question ? normalizeUnanswerableResult(result, question) : result];
  }));
  const invalid = questions.filter(question => !resultIsValid(byId.get(question.id), question));
  if (invalid.length > 0 && retryDepth < 2) {
    console.warn(`${role}: retrying ${invalid.map(question => question.id).join(', ')}`);
    const retried = await callBatch(role, invalid, apiKey, includeExplanation, retryDepth + 1);
    for (const [id, result] of retried) byId.set(id, result);
  }
  const stillInvalid = questions.filter(question => !resultIsValid(byId.get(question.id), question));
  if (stillInvalid.length > 0) {
    for (const question of stillInvalid) {
      const result = byId.get(question.id);
      console.warn(`${role} invalid shape for ${question.id}: ${JSON.stringify({
        answers: result?.answers,
        complete: result?.complete,
        ambiguous: result?.ambiguous,
      })}`);
    }
    throw new Error(`${role} returned invalid or missing results for ${stillInvalid.map(question => question.id).join(', ')}`);
  }
  return byId;
}

export function mergeCspBatchEvidence(question, responses, importConsensus, requestFailures = []) {
  const expected = canonicalAnswerVector(question);
  const ordered = ['solverA', 'solverB', 'criticA', 'criticB'].map(name => responses[name]);
  const vectors = ordered.map(result => result.answers);
  const modelComplete = ordered.every(result => result.complete && !result.ambiguous);
  const modelAmbiguous = ordered.some(result => result.ambiguous);
  const explanationVerified = modelComplete
    && responses.criticA.explanationsValid === true
    && responses.criticB.explanationsValid === true
    && vectors.every(vector => answerVectorsEqual(vector, expected));
  return {
    importConsensus,
    multipartModelAnswers: vectors,
    ...(question.children.length === 0 ? { modelAnswers: vectors.map(vector => vector[0]) } : {}),
    modelComplete,
    modelAmbiguous,
    explanationVerified,
    publishedExplanation: explanationVerified ? question.explanation : null,
    cspBatchEvidence: {
      version: 1,
      model: MODEL,
      answerVector: expected,
      modelVectors: vectors,
      requestFailures,
      issues: ordered.flatMap(result => Array.isArray(result.issues) ? result.issues.map(String) : []),
    },
  };
}

export async function verifyCspBatches({
  canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json'),
  evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json'),
  apiKey = process.env.DEEPSEEK_API_KEY,
} = {}) {
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');
  if (MODEL !== 'deepseek-v4-pro') throw new Error(`CSP verification requires deepseek-v4-pro, received ${MODEL}`);

  const canonical = readJson(canonicalPath, { questions: [] });
  const evidence = readJson(evidencePath, {});
  const snapshots = [
    loadQuestionSnapshot(path.join(root, '.tmp/reviewed-question-bank.json'), 'reviewed_cloud'),
    loadQuestionSnapshot(path.join(root, 'public/course-data/csp-exam-bank.json'), 'legacy_exam'),
    loadQuestionSnapshot(path.join(root, 'public/course-data/dungeon-exam-bank.json'), 'legacy_dungeon'),
  ];
  const type = argument('type', 'all');
  const limit = Number(argument('limit', Number.POSITIVE_INFINITY));
  const retryFailed = argument('retry-failed', 'false') === 'true';
  const candidates = canonical.questions.filter(question => question.source === 'csp_exam'
    && (type === 'all' || question.type === type)
    && validateQuestion(question).blockers.length === 0
    && !(evidence[question.id]?.contentHash === question.contentHash
      && evidence[question.id]?.cspBatchEvidence?.version === 1
      && !(retryFailed && evidence[question.id]?.cspBatchEvidence?.requestFailures?.length > 0)))
    .slice(0, limit);
  const groups = type === 'all'
    ? [
        ...batch(candidates.filter(question => question.type === 'choice'), 20),
        ...batch(candidates.filter(question => question.type !== 'choice'), 1),
      ]
    : batch(candidates, type === 'choice' ? 20 : 1);
  const concurrency = Math.max(1, Number(argument('concurrency', '3')));
  let processed = 0;
  let nextGroup = 0;

  async function runNextGroup() {
    const groupIndex = nextGroup;
    nextGroup += 1;
    if (groupIndex >= groups.length) return;
    const questions = groups[groupIndex];
    console.log(`CSP batch ${groupIndex + 1}/${groups.length}: ${questions.map(question => question.id).join(', ')}`);
    const roles = [
      ['solverA', '独立解题器A', false],
      ['solverB', '独立解题器B', false],
      ['criticA', '答案与解析批判器A', true],
      ['criticB', '答案与解析批判器B', true],
    ];
    const settled = await Promise.allSettled(
      roles.map(([, role, includeExplanation]) => callBatch(role, questions, apiKey, includeExplanation)),
    );
    const roleMaps = {};
    const requestFailures = [];
    settled.forEach((result, index) => {
      const [key, role] = roles[index];
      if (result.status === 'fulfilled') {
        roleMaps[key] = result.value;
        return;
      }
      const message = String(result.reason?.message || result.reason || 'unknown error');
      requestFailures.push(`${role}: ${message}`);
      console.warn(`${role} failed for this batch: ${message}`);
      roleMaps[key] = new Map(questions.map(question => [question.id, {
        id: question.id,
        answers: Array(question.children.length > 0 ? question.children.length : 1).fill(null),
        complete: false,
        ambiguous: false,
        explanationsValid: false,
        issues: [`${role}请求失败`],
      }]));
    });
    for (const question of questions) {
      const merged = mergeCspBatchEvidence(question, {
        solverA: roleMaps.solverA.get(question.id),
        solverB: roleMaps.solverB.get(question.id),
        criticA: roleMaps.criticA.get(question.id),
        criticB: roleMaps.criticB.get(question.id),
      }, collectImportConsensus(question, snapshots), requestFailures);
      evidence[question.id] = {
        ...evidence[question.id],
        contentHash: question.contentHash,
        collectedAt: new Date().toISOString(),
        ...merged,
      };
      processed += 1;
    }
    writeJsonAtomic(evidencePath, evidence);
    await runNextGroup();
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, groups.length) },
    () => runNextGroup(),
  ));
  return { processed, remaining: candidates.length - processed, evidence };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyCspBatches().then(result => {
    console.log(`CSP batch verification complete: processed=${result.processed}, remaining=${result.remaining}.`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
