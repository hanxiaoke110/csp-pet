#!/usr/bin/env node
/**
 * Fix canonical answers that were proven wrong by official sources,
 * add manualVerified for questions where jury is wrong but canonical is right,
 * and flag irresolvable questions.
 *
 * Confirmed via web search + official answer keys:
 * - csp-j-2019-c08: Official=C(15), Canonical had A(6) → FIX to C
 * - csp-j-2023-c08: Official=A, Canonical had C → FIX to A
 * - csp-j-2023-c02: Official=D, Canonical=D ✓ → manualVerified
 * - gesp-2025-09-2-21: cout << 'A' + a%10 outputs int, not char → B (false) ✓ → manualVerified
 * - gesp-2025-06-3-10: int array[5] is correct C++ → D ✓ → manualVerified
 * - gesp-2025-03-4-01: Forward declaration works → A ✓ → manualVerified
 * - gesp-2026-03-2-24: %3d adds width → A (true) ✓ → manualVerified
 * - gesp-2024-09-2-04: Both B(i<=9) and C(++i) are correct → ambiguous
 * - gesp-2024-03-1-06: Canonical code/options are FABRICATED (doesn't match PDF) → mark broken
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, '.tmp/reviewed-question-bank.json');
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');

const sourceExport = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const source = sourceExport.questions;
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

// ─── Fix wrong canonical answers (use legacy format keys from reviewed source) ───
const ANSWER_FIXES = {
  'csp-j-2019-008': {  // normalizes to csp-j-2019-c08
    correctIndex: 2, // C (official answer is 15)
    explanation: '二叉树顺序存储，根下标1，沿最右侧分支：根1→右孩子3→右孩子7→右孩子15。最大下标至少为15。答案C。',
  },
  'csp-j-2023-008': {  // normalizes to csp-j-2023-c08
    correctIndex: 0, // A (official answer verified via web search)
    explanation: '后缀转中缀：6 2 3 + - → (6-(2+3))；3 8 2 / + → (3+8/2)；* → ((6-(2+3))*(3+8/2))；2 ^ → ((6-(2+3))*(3+8/2))^2；3 + → ((6-(2+3))*(3+8/2))^2+3。答案A。',
  },
  'gesp-2024-03-1-06': {
    // This question has FABRICATED code and options in canonical.
    // The real GESP 2024-03-1 Q6 is about N%3==0 / N%7==0 with different code & options.
    // Cannot fix with just answer change — needs full replacement from official PDF OCR.
    // For now, mark it as needing source replacement (broken).
  },
};

// ─── Add manualVerified for jury-wrong questions ───
const MANUAL_VERIFIED = {
  'csp-j-2023-c02': {
    reason: 'Official CSP-J 2023 answer key confirms D (22222211₈). Jury 3/3 voted A — wrong. OCR subscript issue (₈ merged into numbers) may have confused models.',
  },
  'gesp-2025-09-2-21': {
    reason: "cout << 'A' + a%10 promotes char to int (C++ integral promotion). 'A'+3=68 outputs as int '68', not char 'D'. Output is '686766', not 'DCB'. Canonical B (false) is correct.",
  },
  'gesp-2025-06-3-10': {
    reason: "C++ array definition: int array[5]; Option C (int[] array = {...}) is Java syntax, not valid C++. Canonical D is correct.",
  },
  'gesp-2025-03-4-01': {
    reason: 'Code has forward declaration int multiply(int, int); before main, so multiply can be defined after. Statement A ("must be defined before main") is the wrong statement. Canonical A is correct.',
  },
  'gesp-2026-03-2-24': {
    reason: '"%3d" format specifier adds right-alignment with width 3, producing the aligned output shown. Canonical A (true) is correct.',
  },
};

// Apply answer fixes in source
let fixedAnswers = 0;
let fixedManualVerified = 0;

for (const [id, fix] of Object.entries(ANSWER_FIXES)) {
  const entry = source[id];
  if (!entry) {
    console.log(`WARN: ${id} not found in source`);
    continue;
  }
  const oldIdx = entry.answer?.correctIndex ?? entry.correctIndex;
  entry.answer = { correctIndex: fix.correctIndex };
  if (fix.explanation) entry.explanation = fix.explanation;
  console.log(`FIX answer: ${id} ${String.fromCharCode(65+oldIdx)}→${String.fromCharCode(65+fix.correctIndex)}`);
  fixedAnswers++;
}

// Add manualVerified evidence entries
for (const [id, info] of Object.entries(MANUAL_VERIFIED)) {
  const ev = evidence[id];
  if (!ev) {
    console.log(`WARN: ${id} not found in evidence`);
    continue;
  }
  ev.manualVerified = {
    approved: true,
    reviewedAt: new Date().toISOString(),
    reason: info.reason,
  };
  console.log(`MANUAL_VERIFIED: ${id} — ${info.reason.substring(0, 80)}...`);
  fixedManualVerified++;
}

// ─── Mark gesp-2024-09-2-04 as ambiguous ───
if (evidence['gesp-2024-09-2-04']) {
  evidence['gesp-2024-09-2-04'].modelAmbiguous = true;
  evidence['gesp-2024-09-2-04'].modelReasons = evidence['gesp-2024-09-2-04'].modelReasons || [];
  evidence['gesp-2024-09-2-04'].modelReasons.push(
    'AMBIGUOUS: Both B (i<=9) and C (++i) are semantically equivalent to the original loop. Two correct answers.'
  );
  console.log(`AMBIGUOUS: gesp-2024-09-2-04 — both B and C are correct`);
}

// ─── Mark gesp-2024-03-1-06 as broken (fabricated content) ───
if (source['gesp-2024-03-1-06']) {
  source['gesp-2024-03-1-06']._needsReplacement = true;
  source['gesp-2024-03-1-06']._replacementNote =
    'Canonical code/options are FABRICATED. Actual GESP 2024-03-1 Q6 is about N%3==0 / N%7==0 with different code and options entirely. Needs replacement from official PDF OCR at reports/gesp-sources/ocr/2024-03-1.txt.';
  console.log(`FLAGGED: gesp-2024-03-1-06 — fabricated content, needs PDF replacement`);
}

// ─── Save ───
fs.writeFileSync(sourcePath, JSON.stringify(sourceExport, null, 2) + '\n');
console.log(`\nSource saved: ${sourcePath}`);

fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
console.log(`Evidence saved: ${evidencePath}`);

console.log(`\nDone. Fixed ${fixedAnswers} answers, ${fixedManualVerified} manualVerified.`);
