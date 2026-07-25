// One-off evidence migration after the 2026-07-24 clean rebuild.
//
// The rebuild changed contentHash for two groups of questions:
//   1. explanation-only changes (recovery explanations imported) — jury/OCR
//      evidence concerns the question+options+answer, which are unchanged,
//      so the evidence remains valid and is re-keyed to the new hash.
//   2. the 16 reverted answer "corrections" — the evidence was cast against a
//      different answer key and MUST NOT be reused; it is left stale so
//      verify-canonical resets those questions to blank evidence, and a fresh
//      jury run re-verifies them.
//
// Verified by .tmp/migration-plan.json, which was produced by diffing the old
// and new canonical banks field-by-field.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = JSON.parse(fs.readFileSync(path.join(root, '.tmp/migration-plan.json'), 'utf8'));
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/canonical.json'), 'utf8'));
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

const newHash = new Map(canonical.questions.map(q => [q.id, q.contentHash]));

let rekeyed = 0;
let skipped = 0;
for (const id of plan.expOnly) {
  const entry = evidence[id];
  if (!entry) { skipped++; continue; }
  entry.contentHash = newHash.get(id);
  rekeyed++;
}

// Never re-key the 16 reverted questions; drop their stale entries outright so
// the next verify-canonical run starts them from blank evidence.
for (const id of plan.coreChanged) {
  if (evidence[id]) delete evidence[id];
}

fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
console.log(`Re-keyed ${rekeyed} evidence entries (explanation-only change).`);
console.log(`Skipped ${skipped} (no evidence).`);
console.log(`Dropped ${plan.coreChanged.length} stale entries (answer-reverted questions).`);
