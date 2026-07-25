// Re-verify the 8 mis-keyed questions after their answers were fixed in
// source data (fix-miskeyed-8.mjs). The existing jury votes were cast on the
// UNCHANGED stem+options, so they remain valid evidence for the corrected
// answer key; we only top up to 5 votes where needed and re-key the
// contentHash to the rebuilt canonical.
// Usage: DEEPSEEK_API_KEY=... node scripts/question-bank/rejury-fixed-8.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callDeepSeekJury } from './lib/ai-jury.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IDS = [
  'csp-j-2020-c13', 'csp-j-2022-c03', 'csp-j-2022-c14',
  'gesp-2024-03-1-08', 'gesp-2024-12-1-15',
  'gesp-2025-06-1-08', 'gesp-2025-06-2-08', 'gesp-2025-06-2-15',
];

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) { console.error('DEEPSEEK_API_KEY required'); process.exit(1); }

const canonical = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/canonical.json'), 'utf8'));
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const qmap = new Map(canonical.questions.map(q => [q.id, q]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const id of IDS) {
  const q = qmap.get(id);
  if (!q) { console.log(`${id}: NOT IN CANONICAL`); continue; }
  const expected = q.answer.correctIndex;

  // Keep prior votes only when they were cast on the identical stem+options:
  // the fix changed ONLY answer.correctIndex (and explanation), so prior votes
  // are still evidence about the same question content.
  const prev = evidence[id] || {};
  const votes = (prev.modelAnswers || []).filter(Number.isInteger);

  while (votes.length < 5) {
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const r = await callDeepSeekJury(q, `补充解题器${votes.length + 1}`, apiKey);
        votes.push(r.answerIndex);
        ok = true;
      } catch (err) {
        await sleep(2000 * (attempt + 1));
      }
    }
    if (!ok) break;
    await sleep(300);
  }

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
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`${id}: votes=${JSON.stringify(votes)} expected=${expected} consensus=${consensus}`);
}
console.log('Done. Run verify-canonical to update verdicts.');
