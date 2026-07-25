#!/usr/bin/env node
/**
 * Verifies and repairs explanations for questions whose answers are already
 * locked by strong evidence (officialMatch or deterministic+model consensus).
 *
 * Per Codex's standard:
 *   1. Check existing explanation with dual critics
 *   2. If it fails, generate a new explanation (without seeing the old one)
 *   3. Verify the new explanation with dual critics again
 *   4. Max 2 rounds — two failures leaves explanationVerified=false
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-xxx node scripts/question-bank/verify-explanations-only.mjs
 *   DEEPSEEK_API_KEY=sk-xxx node scripts/question-bank/verify-explanations-only.mjs --limit=10
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyOrRepairExplanation } from './lib/ai-jury.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CANONICAL_PATH = path.join(root, 'public/course-data/question-bank-v2/canonical.json');
const EVIDENCE_PATH = path.join(root, '.tmp/question-bank-v2-evidence.json');
const VERIFICATION_PATH = path.join(root, 'public/course-data/question-bank-v2/verification.json');

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error('Set DEEPSEEK_API_KEY environment variable.');
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function parseLimit() {
  const value = process.argv.find(arg => arg.startsWith('--limit='));
  return value ? Number(value.slice('--limit='.length)) : Number.POSITIVE_INFINITY;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const canonical = readJson(CANONICAL_PATH);
  const evidence = fs.existsSync(EVIDENCE_PATH) ? readJson(EVIDENCE_PATH) : {};

  // Find questions that need explanation verification:
  // 1. Answer is locked (officialMatch=true, or deterministic+model consensus)
  // 2. Evidence exists but explanationVerified is false, OR evidence is stale
  const queue = [];
  for (const q of canonical.questions) {
    const ev = evidence[q.id];
    if (!ev) continue; // No evidence yet — needs full collect-evidence first

    // Already verified with matching contentHash — skip
    if (ev.explanationVerified && ev.contentHash === q.contentHash) continue;

    // Never reuse stale evidence: if the contentHash differs, the question
    // content changed since the evidence was collected. Overwriting the hash
    // here would "wash" outdated jury votes/verdicts into the new revision.
    // Skip and let collect-evidence regenerate fresh evidence instead.
    if (ev.contentHash !== q.contentHash) continue;

    // Check if answer is locked
    const answerLocked = ev.officialMatch
      || (ev.deterministicAnswer === q.answer.correctIndex
        && ev.modelComplete
        && (ev.modelAnswers || []).every(a => a === q.answer.correctIndex));

    if (answerLocked) {
      queue.push(q);
    }
  }

  const limit = parseLimit();
  console.log(`Questions with locked answers needing explanation verification: ${queue.length}`);
  if (limit < queue.length) console.log(`(limited to ${limit})`);

  let verified = 0;
  let generated = 0;
  let failed = 0;

  for (let i = 0; i < Math.min(queue.length, limit); i++) {
    const q = queue[i];
    const ev = evidence[q.id];

    // contentHash freshness was already enforced when building the queue;
    // do not overwrite it here (see comment above).

    try {
      const result = await verifyOrRepairExplanation(q, true, API_KEY);

      ev.explanationVerified = result.explanationVerified;
      ev.publishedExplanation = result.publishedExplanation;
      ev.explanationAttempts = result.explanationAttempts || 0;
      ev.explanationChecks = result.explanationChecks || [];
      ev.collectedAt = new Date().toISOString();

      if (result.explanationVerified) {
        verified++;
        if (result.explanationAttempts > 1) {
          generated++; // Needed regeneration (round 2)
        }
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`  Error on ${q.id}: ${err.message.slice(0, 100)}`);
    }

    // Save progress every 10 questions
    if ((i + 1) % 10 === 0 || i === Math.min(queue.length, limit) - 1) {
      writeJsonAtomic(EVIDENCE_PATH, evidence);
      const pct = Math.round((i + 1) / Math.min(queue.length, limit) * 100);
      console.log(`  [${i + 1}/${Math.min(queue.length, limit)}] ${pct}% | ✓${verified} generated:${generated} ✗${failed}`);
    }

    // Small delay between calls
    if (i < Math.min(queue.length, limit) - 1) {
      await sleep(100);
    }
  }

  console.log(`\n=== Explanation Verification Complete ===`);
  console.log(`Verified (existing passed): ${verified - generated}`);
  console.log(`Verified (regenerated):     ${generated}`);
  console.log(`Failed (after 2 rounds):    ${failed}`);
  console.log(`Total processed:            ${verified + failed}`);

  // Now re-run verify-canonical to update verdicts
  console.log(`\nRe-running verification to update verdicts...`);
  const { verifyCanonicalBank } = await import('./verify-canonical.mjs');
  const result = verifyCanonicalBank({
    canonicalPath: CANONICAL_PATH,
    evidencePath: EVIDENCE_PATH,
    outputPath: VERIFICATION_PATH,
  });

  console.log(`Verification updated: ${JSON.stringify(result.statusCounts)}`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} questions failed explanation verification after 2 rounds.`);
    console.log(`These will remain auto_probable and unpublished.`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
