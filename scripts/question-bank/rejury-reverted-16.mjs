// Re-jury the 16 questions whose answers were wrongly "corrected" on 2026-07-24
// (OCR answer misattribution) and then reverted to the original answers by the
// clean rebuild. Each question gets 5 fresh independent solver votes from
// DeepSeek; a 5/5 consensus with the canonical answer yields _5juryConsensus.
// Usage: DEEPSEEK_API_KEY=... node scripts/question-bank/rejury-reverted-16.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callDeepSeekJury } from './lib/ai-jury.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IDS = [
  'csp-s-2021-c02',
  'gesp-2023-09-1-08', 'gesp-2023-12-1-01', 'gesp-2023-12-4-03',
  'gesp-2024-03-1-11', 'gesp-2024-03-3-03', 'gesp-2024-06-1-01',
  'gesp-2024-06-1-09', 'gesp-2024-06-3-01', 'gesp-2024-12-3-03',
  'gesp-2025-03-3-15', 'gesp-2025-06-1-04', 'gesp-2025-09-3-09',
  'gesp-2025-12-4-15', 'gesp-2026-03-3-04', 'gesp-2026-03-4-05',
];

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) { console.error('DEEPSEEK_API_KEY required'); process.exit(1); }

const canonical = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/canonical.json'), 'utf8'));
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const qmap = new Map(canonical.questions.map(q => [q.id, q]));

const ROLES = ['解题器A', '解题器B', '解题器C', '解题器D', '解题器E'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const id of IDS) {
  const q = qmap.get(id);
  if (!q) { console.log(`${id}: NOT IN CANONICAL`); continue; }

  const votes = [];
  for (const role of ROLES) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await callDeepSeekJury(q, role, apiKey);
        votes.push(r);
        break;
      } catch (err) {
        if (attempt === 2) console.log(`  ${id} ${role}: FAILED ${err.message.slice(0, 80)}`);
        else await sleep(2000 * (attempt + 1));
      }
    }
    await sleep(300);
  }

  const answers = votes.filter(v => Number.isInteger(v.answerIndex)).map(v => v.answerIndex);
  const expected = q.answer.correctIndex;
  const consensus = answers.length >= 5 && answers.every(a => a === expected);
  evidence[id] = {
    contentHash: q.contentHash,
    collectedAt: new Date().toISOString(),
    modelAnswers: answers,
    modelComplete: votes.length >= 5 && votes.every(v => v.complete),
    modelReasons: votes.map(v => String(v.reason || '').slice(0, 200)),
    modelAmbiguous: votes.some(v => v.ambiguous),
    _5juryConsensus: consensus,
    officialMatch: false,
    deterministicAnswer: null,
    explanationVerified: false,
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`${id}: votes=${JSON.stringify(answers)} expected=${expected} consensus=${consensus}`);
}
console.log('Done. Run verify-canonical to update verdicts.');
