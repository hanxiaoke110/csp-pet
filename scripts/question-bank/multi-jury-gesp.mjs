// Multi-jury: Add 2 extra solvers to existing 3-role jury for 5-person consensus.
// Questions with 5/5 unanimous agreement get upgraded to auto_verified.
// Usage: DEEPSEEK_API_KEY=... node scripts/question-bank/multi-jury-gesp.mjs

import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { callDeepSeekJury, mergeJuryResponses } from './lib/ai-jury.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const canonical = JSON.parse(readFileSync(path.join(root, 'public/course-data/question-bank-v2/canonical.json'), 'utf8'));
const verification = JSON.parse(readFileSync(path.join(root, 'public/course-data/question-bank-v2/verification.json'), 'utf8'));
const evidence = JSON.parse(readFileSync(path.join(root, '.tmp/question-bank-v2-evidence.json'), 'utf8'));

const qmap = {};
for (const q of canonical.questions) qmap[q.id] = q;

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) { console.error('DEEPSEEK_API_KEY required'); process.exit(1); }

// Find GESP questions needing extra jury
const targets = [];
for (const r of verification.results) {
    if (r.status === 'auto_verified' || r.status === 'broken') continue;
    const qid = r.questionId;
    if (!qid.startsWith('gesp-')) continue;
    const q = qmap[qid];
    if (!q || q.type !== 'choice' || q.options.length === 0) continue;

    const entry = evidence[qid] || {};
    // Only reuse prior jury votes when the evidence matches the current
    // canonical contentHash — votes cast against a superseded answer/options
    // revision must not be carried into a new 5-jury consensus.
    const existing = entry.contentHash === q.contentHash ? (entry.modelAnswers || []) : [];
    targets.push({ qid, existing, question: q });
}

console.log(`Targets: ${targets.length} GESP questions`);
console.log(`Adding 2 extra solvers per question...\n`);

let upgraded = 0;
let stillShort = 0;
let errors = 0;

const BATCH = 5;
for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);

    // Run 2 extra solvers for each question in batch (in parallel)
    const results = await Promise.allSettled(
        batch.flatMap(({ qid, question }) => [
            callDeepSeekJury(question, '额外解题器C', apiKey).then(a => ({ qid, role: 'C', ...a })),
            callDeepSeekJury(question, '额外解题器D', apiKey).then(a => ({ qid, role: 'D', ...a })),
        ])
    );

    // Process results per question
    for (const { qid, question } of batch) {
        const newAnswers = results
            .filter(r => r.status === 'fulfilled' && r.value.qid === qid)
            .map(r => r.value.answerIndex);

        if (newAnswers.length < 2) {
            errors += 2 - newAnswers.length;
            continue;
        }

        const entry = evidence[qid] || {};
        // Re-check freshness inside the loop too: reuse votes only from the
        // current canonical revision (see targets build above).
        const existing = entry.contentHash === question.contentHash ? (entry.modelAnswers || []) : [];
        const allAnswers = [...existing, ...newAnswers];

        // Check 5-person consensus
        const canonicalAns = question.answer.correctIndex;
        const allAgree = allAnswers.length >= 5 && allAnswers.every(a => a === canonicalAns);

        if (allAgree) {
            // Update evidence with 5-person jury
            entry.modelAnswers = allAnswers;
            entry.modelComplete = true;
            entry._5juryConsensus = true;
            // Use the canonical contentHash verbatim — recomputing here hashes a
            // different object shape than build-canonical does and would silently
            // invalidate the entry at the next verify-canonical run.
            entry.contentHash = question.contentHash;
            evidence[qid] = entry;
            upgraded++;
        } else {
            stillShort++;
        }
    }

    // Save every batch
    writeFileSync(path.join(root, '.tmp/question-bank-v2-evidence.json'), JSON.stringify(evidence, null, 2));

    const done = i + batch.length;
    if (done % 50 === 0 || done >= targets.length) {
        console.log(`  [${done}/${targets.length}] upgraded=${upgraded} short=${stillShort} errors=${errors}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
}

console.log(`\nDone: ${upgraded} upgraded, ${stillShort} still short, ${errors} errors`);
console.log(`Evidence saved. Run verify-canonical to update verdicts.`);
