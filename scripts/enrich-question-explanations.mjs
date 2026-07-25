import { readFileSync, writeFileSync } from 'node:fs';

const apiKey = process.env.DEEPSEEK_KEY || '';
const adminToken = process.env.CSP_ADMIN_TOKEN || '';
const limit = Math.max(0, Number(process.env.LIMIT) || 0);
const shouldApply = process.env.APPLY === '1';
const model = 'deepseek-v4-pro';
const reportPath = process.env.REPORT_PATH || '.tmp/deepseek-v4-pro-explanations.json';
const onlyIds = new Set(String(process.env.ONLY_IDS || '').split(',').map(id => id.trim()).filter(Boolean));
const bankPaths = [
  'public/course-data/unified-quiz-bank.json',
  '../csp-pet-gitee/public/course-data/unified-quiz-bank.json',
];

if (!apiKey) throw new Error('Set DEEPSEEK_KEY for generation');

const bank = JSON.parse(readFileSync(bankPaths[0], 'utf8'));
let report = { model, generatedAt: new Date().toISOString(), results: {} };
try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch {}

const isWeak = question => {
  const explanation = String(question.explanation || '').trim();
  return /^官方答案[：:]?\s*[A-H]?[。.]?$/.test(explanation) || (explanation && explanation.length < 16);
};

let targets = Object.values(bank).filter(question =>
  isWeak(question) &&
  Array.isArray(question.options) &&
  Number.isInteger(question.correctIndex) &&
  !(question.hasImage && !question.code) &&
  (!onlyIds.size || onlyIds.has(question.id))
);
if (limit) targets = targets.slice(0, limit);
targets = targets.filter(question => !report.results[question.id]);

function parseResponse(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Model did not return JSON');
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed.results)) throw new Error('Missing results array');
  return parsed.results;
}

async function callDeepSeek(questions, attempt = 1) {
  const payload = questions.map(question => ({
    id: question.id,
    question: question.question,
    code: question.code || '',
    options: question.options.map(option => String(option).replace(/^\s*[A-H][.、:]\s?/, '')),
  }));
  const prompt = `你是严谨的 CSP/GESP 竞赛教师。请独立解答下面每道选择题，不要假设题库答案正确。

对每题返回：
1. recommendedIndex：从 0 开始的正确选项索引；
2. explanation：50-180 个中文字符，说明关键推理、计算过程或知识点，并简要指出易错处；
3. confidence：high、medium 或 low；
4. answerConcern：若题目、代码、选项有缺失或歧义则说明，否则为空字符串。

不要省略题目，不要修改 id。只输出 JSON：
{"results":[{"id":"题号","recommendedIndex":0,"explanation":"解析","confidence":"high","answerConcern":""}]}

题目：
${JSON.stringify(payload)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let response;
  try {
    response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 7000,
        response_format: { type: 'json_object' },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
      await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      return callDeepSeek(questions, attempt + 1);
    }
    throw new Error(`DeepSeek ${response.status}: ${body.error?.message || 'request failed'}`);
  }
  return parseResponse(body.choices?.[0]?.message?.content);
}

const batchSize = Math.max(1, Number(process.env.BATCH_SIZE) || 4);
const concurrency = Math.max(1, Number(process.env.CONCURRENCY) || 16);
for (let index = 0; index < targets.length; index += batchSize * concurrency) {
  const batches = Array.from({ length: concurrency }, (_, offset) =>
    targets.slice(index + offset * batchSize, index + (offset + 1) * batchSize)
  ).filter(batch => batch.length);
  const waveResults = await Promise.allSettled(batches.map(batch => callDeepSeek(batch)));
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const settled = waveResults[batchIndex];
    if (settled.status === 'rejected') {
      console.error(`batch failed: ${batch.map(question => question.id).join(', ')} (${settled.reason?.message || 'unknown error'})`);
      continue;
    }
    for (const result of settled.value) {
      if (!batch.some(question => question.id === result.id)) continue;
      report.results[result.id] = {
        recommendedIndex: Number(result.recommendedIndex),
        explanation: String(result.explanation || '').trim(),
        confidence: String(result.confidence || 'low'),
        answerConcern: String(result.answerConcern || '').trim(),
      };
    }
  }
  report.generatedAt = new Date().toISOString();
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`generated ${Math.min(index + batches.reduce((sum, batch) => sum + batch.length, 0), targets.length)}/${targets.length}`);
}

const selected = Object.entries(report.results).filter(([id]) => bank[id]);
const approved = selected.filter(([id, result]) =>
  result.recommendedIndex === bank[id].correctIndex &&
  result.confidence !== 'low' &&
  !result.answerConcern &&
  result.explanation.length >= 24 &&
  result.explanation.length <= 600
);
const concerns = selected.filter(([id, result]) => result.recommendedIndex !== bank[id].correctIndex || result.answerConcern);

if (shouldApply) {
  if (!adminToken) throw new Error('Set CSP_ADMIN_TOKEN when APPLY=1');
  for (const bankPath of bankPaths) {
    const current = JSON.parse(readFileSync(bankPath, 'utf8'));
    for (const [id, result] of approved) {
      if (current[id]?.id) current[id].explanation = result.explanation;
    }
    writeFileSync(bankPath, `${JSON.stringify(current, null, 2)}\n`);
  }

  async function saveCloudReview([id, result], isConcern) {
    const response = await fetch(`https://api.cspstudy.top/api/question-bank/questions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({
        patch: isConcern ? {} : { explanation: result.explanation },
        reviewStatus: isConcern ? 'problem' : 'pending',
        reviewNote: isConcern
          ? `${model} 建议答案 ${String.fromCharCode(65 + result.recommendedIndex)}，与题库答案不一致或题面有歧义。${result.answerConcern}`
          : `${model} 独立作答与题库答案一致，待教师抽检。`,
      }),
    });
    if (!response.ok) throw new Error(`Cloud save failed for ${id}: ${response.status}`);
  }

  const writes = [
    ...approved.map(item => [item, false]),
    ...concerns.map(item => [item, true]),
  ];
  for (let index = 0; index < writes.length; index += 8) {
    await Promise.all(writes.slice(index, index + 8).map(([item, isConcern]) => saveCloudReview(item, isConcern)));
    console.log(`saved ${Math.min(index + 8, writes.length)}/${writes.length}`);
  }
}

console.log(JSON.stringify({ generated: selected.length, approved: approved.length, concerns: concerns.length, remaining: targets.length }, null, 2));
