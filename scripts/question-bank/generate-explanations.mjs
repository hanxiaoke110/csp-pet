#!/usr/bin/env node
/**
 * Generates concise Chinese explanations for CSP choice questions using DeepSeek v4-pro.
 *
 * Strategy: batch 5 questions per request, max 4096 output tokens, retry
 * failed batches once.  Explanations are short (1-2 sentences) stating the
 * key concept and why the answer is correct.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-xxx node scripts/question-bank/generate-explanations.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const recoveryPath = path.join(root, 'scripts/question-bank/data/csp-choice-recovery.json');
const outputPath = path.join(root, 'scripts/question-bank/data/csp-choice-recovery.json');

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error('Set DEEPSEEK_API_KEY environment variable.');
  process.exit(1);
}

const BATCH_SIZE = 5;
const MAX_OUTPUT_TOKENS = 4096;
const API_URL = 'https://api.deepseek.com/v1/chat/completions';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callDeepSeek(messages) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

function buildBatchPrompt(questions) {
  const items = questions.map((q, i) => {
    const options = (q.options || []).map((o, oi) => `${String.fromCharCode(65 + oi)}. ${o.replace(/^[A-D][.、]\s*/, '')}`).join('\n');
    const correctLetter = q.answer?.correctIndex !== undefined
      ? String.fromCharCode(65 + q.answer.correctIndex)
      : '?';
    const codeSection = q.code ? `\n代码：\n${q.code}` : '';
    return `[题${i + 1}] ID: ${q.id}
题目：${q.question}${codeSection}
选项：
${options}
正确答案：${correctLetter}`;
  }).join('\n\n');

  return `你是 CSP-J/S 信息学竞赛辅导老师。为下面每道选择题生成一句简洁的解析（30-80字），说明正确选项的原因和涉及的知识点。

${items}

请按以下 JSON 格式返回（只返回 JSON，不要其他文字）：
{
  "explanations": {
    "题目ID": "解析文字",
    ...
  }
}`;
}

function parseExplanations(raw, questionIds) {
  // Strip markdown fences if present
  let json = raw.trim();
  json = json.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

  // Try to find a JSON object in the response
  const match = json.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error('  No JSON object found in response. Raw (first 300 chars):', raw.slice(0, 300));
    return null;
  }

  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed.explanations || typeof parsed.explanations !== 'object') {
      console.error('  Missing "explanations" key in response.');
      return null;
    }
    const result = {};
    for (const qid of questionIds) {
      if (parsed.explanations[qid] && typeof parsed.explanations[qid] === 'string') {
        result[qid] = parsed.explanations[qid].trim();
      } else {
        console.error(`  Missing explanation for ${qid}`);
      }
    }
    return result;
  } catch (e) {
    console.error('  JSON parse error:', e.message);
    return null;
  }
}

async function main() {
  const recovery = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'));
  const questions = recovery.questions || [];

  // Only process questions with empty explanations
  const needsExp = questions.filter(q => !q.explanation || q.explanation.trim() === '');
  console.log(`Total recovery questions: ${questions.length}`);
  console.log(`Need explanations: ${needsExp.length}`);
  console.log(`Already have explanations: ${questions.length - needsExp.length}`);

  if (needsExp.length === 0) {
    console.log('All questions already have explanations. Done.');
    return;
  }

  let generated = 0;
  let failed = 0;

  for (let i = 0; i < needsExp.length; i += BATCH_SIZE) {
    const batch = needsExp.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(q => q.id);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(needsExp.length / BATCH_SIZE);

    console.log(`\nBatch ${batchNum}/${totalBatches}: ${batchIds.join(', ')}`);

    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`  Retry ${attempt}...`);
          await sleep(2000);
        }
        const prompt = buildBatchPrompt(batch);
        const raw = await callDeepSeek([
          { role: 'user', content: prompt },
        ]);
        const explanations = parseExplanations(raw, batchIds);

        if (explanations) {
          let batchOk = 0;
          for (const qid of batchIds) {
            if (explanations[qid]) {
              const q = questions.find(x => x.id === qid);
              if (q) {
                q.explanation = explanations[qid];
                batchOk++;
              }
            }
          }
          generated += batchOk;
          failed += (batch.length - batchOk);
          console.log(`  OK: ${batchOk}/${batch.length} generated`);
          success = true;
        } else {
          console.error('  Failed to parse response.');
        }
      } catch (e) {
        console.error(`  API error: ${e.message}`);
      }
    }

    if (!success) {
      failed += batch.length;
      console.error(`  Batch failed after 3 attempts.`);
    }

    // Rate limiting: ~200ms between batches
    if (i + BATCH_SIZE < needsExp.length) {
      await sleep(200);
    }

    // Save progress every 5 batches
    if ((batchNum % 5 === 0) || (i + BATCH_SIZE >= needsExp.length)) {
      const backup = path.join(root, `.tmp/recovery-explanations-backup-${Date.now()}.json`);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, JSON.stringify(recovery, null, 2));
      console.log(`  Progress saved to ${backup}`);
    }
  }

  // Write final result
  fs.writeFileSync(outputPath, JSON.stringify(recovery, null, 2));
  console.log(`\n=== Done ===`);
  console.log(`Generated: ${generated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total with explanations: ${questions.filter(q => q.explanation && q.explanation.trim() !== '').length}/${questions.length}`);

  if (failed > 0) {
    console.error(`\n⚠️  ${failed} questions still without explanations.`);
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
