// General jury top-up for quarantined questions (auto_probable / disputed).
//
// Modes:
//   --mode=topup    Reuse existing jury votes (when the evidence contentHash
//                   matches the current canonical) and add fresh DeepSeek votes
//                   until 5. For auto_probable questions whose stem/options are
//                   unchanged since the votes were cast.
//   --mode=revote   Discard ALL existing votes and cast 5 fresh ones. For
//                   disputed/model_conflict questions whose old votes disagree.
//
// A 5/5 unanimous vote WITH the canonical answer sets _5juryConsensus
// (-> auto_verified at next verify-canonical). A unanimous vote AGAINST
// canonical deliberately keeps _5juryConsensus=false so validate.mjs flags
// model_canonical_conflict — that is how mis-keyed answers surface.
//
// Usage:
//   DEEPSEEK_API_KEY=... node scripts/question-bank/jury-topup.mjs --mode=topup
//   DEEPSEEK_API_KEY=... node scripts/question-bank/jury-topup.mjs --mode=revote
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callDeepSeekJury } from './lib/ai-jury.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = (process.argv.find(a => a.startsWith('--mode=')) || '--mode=topup').slice(7);
if (!['topup', 'revote'].includes(mode)) { console.error('mode must be topup|revote'); process.exit(1); }

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) { console.error('DEEPSEEK_API_KEY required'); process.exit(1); }

const canonical = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/canonical.json'), 'utf8'));
const verification = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/verification.json'), 'utf8'));
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const qmap = new Map(canonical.questions.map(q => [q.id, q]));

const targetStatus = mode === 'topup' ? 'auto_probable' : 'disputed';
const targets = verification.results
  .filter(r => r.status === targetStatus)
  .map(r => qmap.get(r.questionId))
  .filter(q => q && ['choice', 'boolean'].includes(q.type) && q.options.length >= 2
    && Number.isInteger(q.answer.correctIndex));

console.log(`Mode: ${mode} | Targets: ${targets.length} ${targetStatus} choice/boolean questions`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let consensus = 0;
let antiConsensus = 0;
let short = 0;
let failed = 0;
let processed = 0;

async function juryOne(q) {
  const prev = evidence[q.id] || {};
  const fresh = prev.contentHash === q.contentHash;
  const votes = mode === 'topup' && fresh
    ? (prev.modelAnswers || []).filter(Number.isInteger)
    : [];

  while (votes.length < 5) {
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const r = await callDeepSeekJury(q, `补充解题器${votes.length + 1}`, apiKey);
        votes.push(r.answerIndex);
        ok = true;
      } catch {
        await sleep(2000);
      }
    }
    if (!ok) { failed++; break; }
    await sleep(100);
  }

  const expected = q.answer.correctIndex;
  const unanimousWith = votes.length >= 5 && votes.every(a => a === expected);
  const unanimousAgainst = votes.length >= 5 && votes.every(a => a === votes[0]) && votes[0] !== expected;
  evidence[q.id] = {
    ...prev,
    contentHash: q.contentHash,
    collectedAt: new Date().toISOString(),
    modelAnswers: votes,
    modelComplete: votes.length >= 5,
    modelAmbiguous: false,
    _5juryConsensus: unanimousWith,
  };
  if (unanimousWith) consensus++;
  else if (unanimousAgainst) antiConsensus++;
  else short++;

  processed++;
  if (processed % 10 === 0 || processed === targets.length) {
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(`[${processed}/${targets.length}] 5/5with=${consensus} 5/5against=${antiConsensus} split=${short} failed=${failed}`);
  }
}

// Skip questions that already have a complete 5-vote record from a previous
// (possibly interrupted) run — restarting is then nearly free for them.
const todo = targets.filter(q => {
  const prev = evidence[q.id];
  const votes = prev && prev.contentHash === q.contentHash ? (prev.modelAnswers || []) : [];
  return votes.length < 5;
});
console.log(`Already complete: ${targets.length - todo.length}; to process: ${todo.length}`);

const CONCURRENCY = 8;
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  await Promise.all(todo.slice(i, i + CONCURRENCY).map(juryOne));
}
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

console.log(`\nDone: ${consensus} consensus-with, ${antiConsensus} consensus-against (→ disputed for review), ${short} split, ${failed} failed`);
console.log('Run verify-canonical to update verdicts.');
