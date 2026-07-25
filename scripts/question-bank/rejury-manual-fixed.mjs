// Post-topup verification for questions repaired during manual review
// (2026-07-24). Run AFTER jury-topup.mjs finishes (it writes the evidence
// file; do not run concurrently).
//
// Two groups:
//   A. manualVerified (content verified by hand against official papers):
//      flowchart trace, official semantics, official answer key.
//   B. fresh 5-jury (content restored/replaced; existing votes invalid or
//      absent; for gesp-2025-09-1-04 the existing 5 votes match the new key
//      and are reused since stem+options were unchanged).
// Usage: DEEPSEEK_API_KEY=... node scripts/question-bank/rejury-manual-fixed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callDeepSeekJury } from './lib/ai-jury.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) { console.error('DEEPSEEK_API_KEY required'); process.exit(1); }

const MANUAL = {
  'gesp-2024-06-3-06': '对照官方试卷页面图（reports/gesp-sources/crops/2024-06-3-p3.png）手工模拟流程图：sum=1+2+3+4=10，canonical B 正确。jury 看不到图导致误判 A。',
  'gesp-2024-09-3-10': '对照官方 OCR（reports/gesp-sources/ocr/2024-09-3.txt 第10题）：result=123&1=1；result2 按 32 位补码保留低位得 -123，官方答案 D(1 -123)。jury 误判第一式。',
  'gesp-2024-12-3-09': '对照官方 OCR（2024-12-3.txt 第9题）：ch="hello"，ch[5] 为 \'\\0\'，与 NULL 相等，输出 right，canonical A 正确。jury 误判编译错误（\'\\e\' 仅警告且不执行到）。',
  'csp-j-2021-c14': '对照 CSP-J 2021 官方卷（pages/2021-J/p04）及官方答案 B：DFS 顺序只有 abdce/acdbe/acedb，最后点为 e 或 b 共 2 个。已附图 /course-data/question-images/csp-j-2021-c14-graph.png。jury 看不到图。',
};
const REJURY = [
  'gesp-2023-06-2-15',  // code repaired from official crop; was broken(placeholder_options)
  'gesp-2024-09-3-12',  // options contain code; was broken(missing_code_context)
  'gesp-2024-09-3-14',  // logic puzzle, letter options; was broken(placeholder_options)
  'gesp-2025-03-4-02',  // code restored from official OCR
  'gesp-2025-03-4-03',  // code restored from official OCR
  'gesp-2025-06-2-04',  // options replaced with official option set
  'gesp-2025-03-1-02',  // question replaced with official content
];
const REUSE_VOTES = { 'gesp-2025-09-1-04': true }; // stem+options unchanged, only key fixed

const canonical = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/canonical.json'), 'utf8'));
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const qmap = new Map(canonical.questions.map(q => [q.id, q]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const [id, note] of Object.entries(MANUAL)) {
  const q = qmap.get(id);
  const entry = evidence[id] || {};
  entry.contentHash = q.contentHash;
  entry.collectedAt = new Date().toISOString();
  entry.manualVerified = { approved: true, by: 'kimi-code-review', at: new Date().toISOString(), note };
  evidence[id] = entry;
  console.log(`manualVerified: ${id}`);
}

for (const id of REJURY) {
  const q = qmap.get(id);
  if (!q) { console.log(`${id}: NOT IN CANONICAL`); continue; }
  const prev = evidence[id] || {};
  const votes = REUSE_VOTES[id] && Array.isArray(prev.modelAnswers)
    ? prev.modelAnswers.filter(Number.isInteger)
    : [];
  while (votes.length < 5) {
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const r = await callDeepSeekJury(q, `补充解题器${votes.length + 1}`, apiKey);
        votes.push(r.answerIndex);
        ok = true;
      } catch { await sleep(2000); }
    }
    if (!ok) break;
    await sleep(200);
  }
  const expected = q.answer.correctIndex;
  const consensus = votes.length >= 5 && votes.every(a => a === expected);
  evidence[id] = {
    ...prev,
    contentHash: q.contentHash,
    collectedAt: new Date().toISOString(),
    modelAnswers: votes,
    modelComplete: votes.length >= 5,
    modelAmbiguous: false,
    _5juryConsensus: consensus,
  };
  console.log(`${id}: votes=${JSON.stringify(votes)} expected=${expected} consensus=${consensus}`);
}

fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
console.log('Done. Run verify-canonical to update verdicts.');
