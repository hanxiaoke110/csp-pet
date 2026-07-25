#!/usr/bin/env node
/**
 * Full-chain question bank reliability test.
 *
 * Validates every question visible to students across all channels,
 * checking data integrity, verification consistency, manifest hashes,
 * channel rules, content quality, and release-gate criteria.
 *
 * Usage:
 *   node scripts/question-bank/test-full-chain.mjs
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const v2 = (name) => path.join(root, 'public/course-data/question-bank-v2', name);

// ── helpers ──────────────────────────────────────────────────────────
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}
function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { raw, data: JSON.parse(raw) };
}

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RST = '\x1b[0m';

let pass = 0;
let fail = 0;
let warn = 0;
const failures = [];
const warnings = [];

function test(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ${GREEN}✓${RST} ${label}`);
  } else {
    fail++;
    failures.push({ label, detail });
    console.log(`  ${RED}✗${RST} ${label}${detail ? `  ${RED}→ ${detail}${RST}` : ''}`);
  }
}

function warnTest(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ${GREEN}✓${RST} ${label}`);
  } else {
    warn++;
    warnings.push({ label, detail });
    console.log(`  ${YELLOW}⚠${RST} ${label}${detail ? `  → ${detail}` : ''}`);
  }
}

function header(text) {
  console.log(`\n${BOLD}${CYAN}══════ ${text} ${RST}`);
}

// ── load data ─────────────────────────────────────────────────────────
console.log(`${BOLD}Loading question bank data...${RST}`);

const canonical = readJson(v2('canonical.json'));
const verification = readJson(v2('verification.json'));
const manifest = readJson(v2('manifest.json')).data;

// Load active channel snapshots (the ones referenced by current manifest)
const loadChannel = (logicalName) => {
  const entry = manifest.files[logicalName];
  if (!entry) return null;
  const filePath = v2(entry.path);
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
};

const channelFiles = {
  daily: loadChannel('daily-gesp.json'),
  super: loadChannel('super-cspj.json'),
  exam: loadChannel('exam-questions.json'),
  dungeon: loadChannel('dungeon-mixed.json'),
};
const examManifestFile = loadChannel('exam-manifests.json');
const summaryFile = loadChannel('verification-summary.json');

const allChannelQuestions = new Map();
for (const [name, file] of Object.entries(channelFiles)) {
  if (!file) continue;
  for (const q of file.data.questions || []) {
    if (!allChannelQuestions.has(q.id)) allChannelQuestions.set(q.id, []);
    allChannelQuestions.get(q.id).push(name);
  }
}

const canonicalMap = new Map(canonical.data.questions.map(q => [q.id, q]));
const verdictMap = new Map(verification.data.results.map(v => [v.questionId, v]));

// ──────────────────────────────────────────────────────────────────────
//  1. CANONICAL BANK INTEGRITY
// ──────────────────────────────────────────────────────────────────────
header('1. Canonical Bank Integrity');

test('schemaVersion is 2',
  canonical.data.schemaVersion === 2,
  `got ${canonical.data.schemaVersion}`);

test('contentRevision is present and numeric',
  typeof canonical.data.contentRevision === 'number' && canonical.data.contentRevision > 0,
  `got ${canonical.data.contentRevision}`);

test('questionCount matches actual question array length',
  canonical.data.questionCount === canonical.data.questions.length,
  `declared=${canonical.data.questionCount} actual=${canonical.data.questions.length}`);

const ids = new Set();
const dupIds = [];
for (const q of canonical.data.questions) {
  if (ids.has(q.id)) dupIds.push(q.id);
  ids.add(q.id);
}
test('no duplicate question IDs in canonical',
  dupIds.length === 0,
  dupIds.length > 0 ? `duplicates: ${dupIds.slice(0, 10).join(', ')}` : '');

// Required fields per question
const missingFields = [];
const badHashes = [];
const badAnswerIndices = [];
const emptyOptions = [];
const emptyQuestions = [];

for (const q of canonical.data.questions) {
  if (!q.id) missingFields.push({ id: '(unknown)', field: 'id' });
  if (!q.type) missingFields.push({ id: q.id || '(unknown)', field: 'type' });
  if (!q.question || q.question.trim() === '') emptyQuestions.push(q.id);

  // contentHash must be valid SHA-256
  if (!q.contentHash || !/^[a-f0-9]{64}$/.test(q.contentHash)) {
    badHashes.push(q.id);
  }

  // choice/boolean must have options and valid correctIndex
  if (q.type === 'choice' || q.type === 'boolean') {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      missingFields.push({ id: q.id, field: 'options' });
    } else {
      const emptyOpt = q.options.some(o => !String(o).trim());
      if (emptyOpt) emptyOptions.push(q.id);
    }
    if (q.answer?.correctIndex === undefined || q.answer.correctIndex === null) {
      missingFields.push({ id: q.id, field: 'answer.correctIndex' });
    } else if (q.options && (q.answer.correctIndex < 0 || q.answer.correctIndex >= q.options.length)) {
      badAnswerIndices.push(`${q.id} (index=${q.answer.correctIndex}, options=${q.options.length})`);
    }
  }

  // reading/fillBlank should have children
  if ((q.type === 'reading' || q.type === 'fillBlank') && q.children) {
    for (const child of q.children) {
      if (child.correctIndex !== undefined && child.options && (child.correctIndex < 0 || child.correctIndex >= child.options.length)) {
        badAnswerIndices.push(`${child.id || q.id} child (index=${child.correctIndex})`);
      }
    }
  }
}

test('all questions have required fields (id, type)',
  missingFields.length === 0,
  missingFields.length > 0 ? `${missingFields.length} missing: ${missingFields.slice(0, 5).map(m => `${m.id}:${m.field}`).join(', ')}` : '');

test('all questions have valid SHA-256 contentHash',
  badHashes.length === 0,
  `${badHashes.length} bad hashes: ${badHashes.slice(0, 5).join(', ')}`);

warnTest('no empty question text',
  emptyQuestions.length === 0,
  `${emptyQuestions.length} questions with empty text`);

warnTest('no empty options in choice/boolean questions',
  emptyOptions.length === 0,
  `${emptyOptions.length} questions: ${emptyOptions.slice(0, 5).join(', ')}`);

test('all answer indices are valid (within option bounds)',
  badAnswerIndices.length === 0,
  `${badAnswerIndices.length} invalid: ${badAnswerIndices.slice(0, 5).join(', ')}`);

// ──────────────────────────────────────────────────────────────────────
//  2. VERIFICATION INTEGRITY
// ──────────────────────────────────────────────────────────────────────
header('2. Verification Integrity');

test('verification contentRevision matches canonical',
  verification.data.contentRevision === canonical.data.contentRevision,
  `verification=${verification.data.contentRevision} canonical=${canonical.data.contentRevision}`);

test('verification questionCount matches canonical',
  verification.data.questionCount === canonical.data.questionCount,
  `verification=${verification.data.questionCount} canonical=${canonical.data.questionCount}`);

test('verification results count matches questionCount',
  verification.data.results.length === verification.data.questionCount,
  `results=${verification.data.results.length} declared=${verification.data.questionCount}`);

// Every canonical question has a verdict
const missingVerdicts = [];
const hashMismatches = [];
const verdictStatusTally = {};

for (const q of canonical.data.questions) {
  const v = verdictMap.get(q.id);
  if (!v) {
    missingVerdicts.push(q.id);
    continue;
  }
  if (v.contentHash !== q.contentHash) {
    hashMismatches.push({ id: q.id, canonical: q.contentHash.slice(0, 12), verdict: v.contentHash?.slice(0, 12) });
  }
  verdictStatusTally[v.status] = (verdictStatusTally[v.status] || 0) + 1;
}

test('every canonical question has a verification verdict',
  missingVerdicts.length === 0,
  `${missingVerdicts.length} missing: ${missingVerdicts.slice(0, 10).join(', ')}`);

test('every verdict contentHash matches canonical',
  hashMismatches.length === 0,
  `${hashMismatches.length} mismatches: ${hashMismatches.slice(0, 5).map(m => `${m.id}`).join(', ')}`);

// Status counts consistency
const declaredStatusCounts = verification.data.statusCounts || {};
for (const [status, count] of Object.entries(declaredStatusCounts)) {
  test(`statusCounts.${status} (${count}) matches actual verdicts (${verdictStatusTally[status] || 0})`,
    count === (verdictStatusTally[status] || 0),
    `declared=${count} actual=${verdictStatusTally[status] || 0}`);
}

// Summary table
console.log(`  ${CYAN}Verdict status distribution:${RST}`);
for (const [status, count] of Object.entries(verdictStatusTally).sort()) {
  console.log(`    ${status}: ${count}`);
}

// ──────────────────────────────────────────────────────────────────────
//  3. CHANNEL PUBLISHING CORRECTNESS
// ──────────────────────────────────────────────────────────────────────
header('3. Channel Publishing Correctness');

// Check daily channel
if (channelFiles.daily) {
  const dailyQs = channelFiles.daily.data.questions || [];
  console.log(`  ${CYAN}Daily (GESP): ${dailyQs.length} questions${RST}`);

  test('daily: all questions are auto_verified',
    dailyQs.every(q => q.verificationStatus === 'auto_verified'),
    `${dailyQs.filter(q => q.verificationStatus !== 'auto_verified').length} non-auto_verified`);

  test('daily: all questions are GESP source',
    dailyQs.every(q => q.source === 'gesp'),
    `${dailyQs.filter(q => q.source !== 'gesp').length} non-GESP: ${dailyQs.filter(q => q.source !== 'gesp').map(q => q.id).slice(0, 5).join(', ')}`);

  test('daily: all questions are choice type',
    dailyQs.every(q => q.type === 'choice'),
    `${dailyQs.filter(q => q.type !== 'choice').length} non-choice`);

  const dailyCount = dailyQs.length;
  warnTest('daily: count >= 50 (expected for GESP coverage)',
    dailyCount >= 50,
    `only ${dailyCount}`);
}

// Check super channel
if (channelFiles.super) {
  const superQs = channelFiles.super.data.questions || [];
  console.log(`  ${CYAN}Super (CSP-J 程序挑战): ${superQs.length} questions${RST}`);

  test('super: all questions are auto_verified',
    superQs.every(q => q.verificationStatus === 'auto_verified'),
    `${superQs.filter(q => q.verificationStatus !== 'auto_verified').length} non-auto_verified`);

  test('super: all questions are J-group CSP/super-challenge source',
    superQs.every(q => ['csp_exam', 'super_challenge'].includes(q.source) && q.exam?.group === 'J'),
    `${superQs.filter(q => !(['csp_exam', 'super_challenge'].includes(q.source) && q.exam?.group === 'J')).length} non-J`);

  test('super: all questions have children (multipart)',
    superQs.every(q => q.children?.length > 0),
    `${superQs.filter(q => !(q.children?.length > 0)).length} without children`);

  test('super: all questions are reading or fillBlank',
    superQs.every(q => ['reading', 'fillBlank'].includes(q.type)),
    `${superQs.filter(q => !['reading', 'fillBlank'].includes(q.type)).length} wrong type`);

  test('super: all questions are in VERIFIED_PROGRAM_IDS',
    superQs.every(q => ['csp-j-2019-reading-01', 'csp-j-2019-r03', 'csp-j-2020-r02', 'csp-j-2020-r03', 'csp-j-2021-r03', 'super-2021-completion-1', 'super-2021-reading-1', 'super-2021-reading-2', 'super-2022-reading-1', 'super-2022-reading-2', 'super-2022-reading-3', 'super-2023-reading-1', 'super-2023-reading-2', 'super-2023-reading-3', 'super-2024-completion-1', 'super-2024-completion-2', 'super-2024-reading-1', 'super-2024-reading-2', 'super-2024-reading-3'].includes(q.id)),
    `${superQs.filter(q => !['csp-j-2019-reading-01', 'csp-j-2019-r03', 'csp-j-2020-r02', 'csp-j-2020-r03', 'csp-j-2021-r03', 'super-2021-completion-1', 'super-2021-reading-1', 'super-2021-reading-2', 'super-2022-reading-1', 'super-2022-reading-2', 'super-2022-reading-3', 'super-2023-reading-1', 'super-2023-reading-2', 'super-2023-reading-3', 'super-2024-completion-1', 'super-2024-completion-2', 'super-2024-reading-1', 'super-2024-reading-2', 'super-2024-reading-3'].includes(q.id)).map(q => q.id).join(', ')}`);
}

// Check exam channel
if (channelFiles.exam) {
  const examQs = channelFiles.exam.data.questions || [];
  console.log(`  ${CYAN}Exam (真题): ${examQs.length} questions${RST}`);

  test('exam: all questions are auto_verified',
    examQs.every(q => q.verificationStatus === 'auto_verified'),
    `${examQs.filter(q => q.verificationStatus !== 'auto_verified').length} non-auto_verified`);

  test('exam: all questions are CSP exam or official super source',
    examQs.every(q => q.source === 'csp_exam' || q.source === 'super_challenge'),
    `${examQs.filter(q => q.source !== 'csp_exam' && q.source !== 'super_challenge').length} unexpected`);

  // Only CSP choice/reading/fillBlank questions should be here
  const nonPublishableInExam = examQs.filter(q => {
    if (q.source === 'super_challenge') return false; // official super programs accepted
    if (q.type === 'choice') {
      const provOk = q.provenance?.level === 'local_source_copy' || q.provenance?.level === 'secondary';
      return !provOk;
    }
    // Non-choice (reading/fillBlank): auto_verified + children + secondary/local_source_copy provenance
    if (['reading', 'fillBlank'].includes(q.type)) {
      const provOk = q.provenance?.level === 'local_source_copy' || q.provenance?.level === 'secondary';
      const hasChildren = (q.children?.length || 0) > 0;
      return !(provOk && hasChildren);
    }
    return true; // unknown type — reject
  });

  test('exam: all questions pass provenance filter (choice=secondary/local_source_copy, reading/fillBlank=secondary+children)',
    nonPublishableInExam.length === 0,
    `${nonPublishableInExam.length} unexpected: ${nonPublishableInExam.map(q => `${q.id}(${q.provenance?.level})`).slice(0, 5).join(', ')}`);

  // Per-year breakdown
  const byPaper = {};
  for (const q of examQs) {
    if (q.type !== 'choice') continue;
    const key = `${q.exam?.year}-${q.exam?.group}`;
    if (!byPaper[key]) byPaper[key] = [];
    byPaper[key].push(q);
  }

  console.log(`  ${CYAN}Exam channel CSP choice per paper:${RST}`);
  const expectedPapers = ['2019-J','2019-S','2020-J','2020-S','2021-J','2021-S','2022-J','2022-S','2023-J','2023-S','2024-J','2024-S'];
  let papersBelow5 = 0;
  for (const paper of expectedPapers) {
    const count = (byPaper[paper] || []).length;
    const marker = count >= 14 ? GREEN : (count >= 5 ? YELLOW : RED);
    console.log(`    ${paper}: ${marker}${count}${RST}`);
    if (count > 0 && count < 5) papersBelow5++;
  }
  test('exam: every published paper has >= 5 CSP choices (papers below 5 must be dropped from manifest)',
    papersBelow5 === 0,
    `${papersBelow5} papers between 1-4: ${expectedPapers.filter(p => { const c = (byPaper[p]||[]).length; return c > 0 && c < 5; }).join(', ')}`);
}

// Check dungeon channel
if (channelFiles.dungeon) {
  const dungeonQs = channelFiles.dungeon.data.questions || [];
  console.log(`  ${CYAN}Dungeon (试炼场): ${dungeonQs.length} questions${RST}`);

  test('dungeon: all questions are auto_verified',
    dungeonQs.every(q => q.verificationStatus === 'auto_verified'),
    `${dungeonQs.filter(q => q.verificationStatus !== 'auto_verified').length} non-auto_verified`);

  // Dungeon = GESP L1-4 choices + J-group CSP publishable
  const nonDungeon = dungeonQs.filter(q => {
    if (q.source === 'gesp') {
      return q.type !== 'choice' || q.exam?.level < 1 || q.exam?.level > 4;
    }
    if (q.source === 'csp_exam') {
      return q.exam?.group !== 'J';
    }
    return true;
  });
  test('dungeon: only GESP L1-4 choices + J-group CSP publishable',
    nonDungeon.length === 0,
    `${nonDungeon.length} unexpected: ${nonDungeon.map(q => `${q.id}(${q.source},${q.exam?.group})`).slice(0, 5).join(', ')}`);

  test('dungeon: count >= 100',
    dungeonQs.length >= 100,
    `only ${dungeonQs.length}`);
}

// ──────────────────────────────────────────────────────────────────────
//  4. MANIFEST INTEGRITY
// ──────────────────────────────────────────────────────────────────────
header('4. Manifest Integrity');

test('manifest schemaVersion is 2',
  manifest.schemaVersion === 2,
  `got ${manifest.schemaVersion}`);

test('manifest contentRevision matches canonical',
  manifest.contentRevision === canonical.data.contentRevision,
  `manifest=${manifest.contentRevision} canonical=${canonical.data.contentRevision}`);

test('manifest verificationRevision matches verification',
  manifest.verificationRevision === verification.data.verificationRevision,
  `manifest=${manifest.verificationRevision} verification=${verification.data.verificationRevision}`);

// Validate SHA-256 of every snapshot file
const requiredFiles = [
  'daily-gesp.json',
  'super-cspj.json',
  'exam-questions.json',
  'exam-manifests.json',
  'dungeon-mixed.json',
  'verification-summary.json',
];
for (const logicalName of requiredFiles) {
  const entry = manifest.files[logicalName];
  if (!entry) {
    test(`manifest references ${logicalName}`,
      false,
      'missing from manifest.files');
    continue;
  }
  const filePath = v2(entry.path);
  const exists = fs.existsSync(filePath);
  test(`${logicalName}: file exists (${entry.path})`,
    exists,
    `not found at ${entry.path}`);

  if (exists) {
    const content = fs.readFileSync(filePath, 'utf8');
    const actualHash = sha256(content);
    test(`${logicalName}: SHA-256 matches manifest`,
      actualHash === entry.sha256,
      `expected ${entry.sha256.slice(0, 16)}... got ${actualHash.slice(0, 16)}...`);

    test(`${logicalName}: count matches manifest`,
      entry.count === (JSON.parse(content).questionCount || JSON.parse(content).papers?.length || 1),
      `manifest=${entry.count} actual=${JSON.parse(content).questionCount || JSON.parse(content).papers?.length || 1}`);
  }
}

// ──────────────────────────────────────────────────────────────────────
//  5. EXAM MANIFEST INTEGRITY
// ──────────────────────────────────────────────────────────────────────
header('5. Exam Manifest Integrity');

const examSnapshot = examManifestFile?.data;
if (examSnapshot) {
  const examQuestionIds = new Set((channelFiles.exam?.data.questions || []).map(q => q.id));

  test('exam manifests have papers array',
    Array.isArray(examSnapshot.papers),
    `got ${typeof examSnapshot.papers}`);

  const paperCount = examSnapshot.papers?.length || 0;
  test('exam manifests: all 12 papers present',
    paperCount >= 12,
    `only ${paperCount} papers`);

  const thinPapers = (examSnapshot.papers || []).filter(p => p.questionIds.length < 5);
  test('every manifest paper has >= 5 questions',
    thinPapers.length === 0,
    thinPapers.length > 0 ? `thin papers: ${thinPapers.map(p => `${p.id}(${p.questionIds.length})`).join(', ')}` : '');

  let totalRefs = 0;
  let brokenRefs = 0;
  const brokenRefDetails = [];

  for (const paper of (examSnapshot.papers || [])) {
    totalRefs += paper.questionIds.length;
    for (const qid of paper.questionIds) {
      if (!examQuestionIds.has(qid)) {
        brokenRefs++;
        brokenRefDetails.push(`${paper.id}:${qid}`);
      }
    }
  }

  test('all exam manifest question IDs exist in exam channel',
    brokenRefs === 0,
    brokenRefDetails.length > 0 ? `${brokenRefs}/${totalRefs} broken: ${brokenRefDetails.slice(0, 10).join(', ')}` : '');

  // Question IDs should be sorted by section within each paper
  for (const paper of (examSnapshot.papers || [])) {
    const sectionOrder = { c: 0, r: 1, f: 2 };
    const sorted = [...paper.questionIds].sort((a, b) => {
      const aSec = a.match(/-([crf])/)?.[1] || 'z';
      const bSec = b.match(/-([crf])/)?.[1] || 'z';
      if (aSec !== bSec) return (sectionOrder[aSec] ?? 9) - (sectionOrder[bSec] ?? 9);
      const aNum = parseInt(a.match(/(\d+)$/)?.[1] || '0');
      const bNum = parseInt(b.match(/(\d+)$/)?.[1] || '0');
      return aNum - bNum;
    });
    if (JSON.stringify(sorted) !== JSON.stringify(paper.questionIds)) {
      warn++;
      warnings.push({ label: `exam manifest ${paper.id}: question IDs should be sorted by section`, detail: '' });
      console.log(`  ${YELLOW}⚠${RST} exam manifest ${paper.id}: question IDs may not be sorted`);
    } else {
      console.log(`  ${GREEN}✓${RST} exam manifest ${paper.id}: ${paper.questionIds.length} questions, sorted correctly`);
      pass++;
    }
  }

  console.log(`  ${CYAN}Paper question counts (from exam manifest):${RST}`);
  for (const paper of (examSnapshot.papers || [])) {
    const choiceCount = paper.questionIds.filter(id => id.includes('-c')).length;
    const programCount = paper.questionIds.length - choiceCount;
    console.log(`    ${paper.id}: ${paper.questionIds.length} total (${choiceCount} choice + ${programCount} program)`);
  }
}

// ──────────────────────────────────────────────────────────────────────
//  6. CONTENT QUALITY
// ──────────────────────────────────────────────────────────────────────
header('6. Content Quality (all published channels)');

const allPublished = [];
for (const [name, file] of Object.entries(channelFiles)) {
  if (!file) continue;
  for (const q of file.data.questions || []) {
    allPublished.push({ channel: name, question: q });
  }
}

// Check for leaked GESP code images
const leakedImages = allPublished.filter(({ question: q }) =>
  q.assets?.some(a => a.includes('/gesp-code-images/'))
);
test('no leaked GESP code images in any channel',
  leakedImages.length === 0,
  `${leakedImages.length} leaked: ${leakedImages.map(e => `${e.question.id}(${e.channel})`).slice(0, 5).join(', ')}`);

// Check for empty options in published questions
const publishedEmptyOpts = allPublished.filter(({ question: q }) =>
  ['choice', 'boolean'].includes(q.type) && q.options?.some(o => !String(o).replace(/^[A-DＡ-Ｄ](?:[.、．:)]|\s)+/i, '').trim())
);
test('no empty options in published choice/boolean questions',
  publishedEmptyOpts.length === 0,
  `${publishedEmptyOpts.length} questions: ${publishedEmptyOpts.map(e => e.question.id).slice(0, 5).join(', ')}`);

// Missing explanations — a published question without an explanation is a
// student-facing defect (publish-snapshots counts these as publishedBlockers).
const missingExplanations = allPublished.filter(({ question: q }) =>
  !q.explanation || q.explanation.trim() === ''
);
const missingExpCount = missingExplanations.length;
test(`published questions missing explanations: must be 0`,
  missingExpCount === 0,
  `${missingExpCount} without explanations: ${missingExplanations.map(e => e.question.id).slice(0, 10).join(', ')}`);

// Breakdown by channel
console.log(`  ${CYAN}Missing explanation breakdown by channel:${RST}`);
for (const [name, file] of Object.entries(channelFiles)) {
  if (!file) continue;
  const without = (file.data.questions || []).filter(q => !q.explanation || q.explanation.trim() === '');
  console.log(`    ${name}: ${without.length}/${file.data.questions.length}`);
}

// CSP exam choice questions should all have explanations (post our fix)
const examWithoutExp = (channelFiles.exam?.data.questions || [])
  .filter(q => q.type === 'choice' && (!q.explanation || q.explanation.trim() === ''));
test('exam channel: all CSP choices have explanations',
  examWithoutExp.length === 0,
  `${examWithoutExp.length} CSP choices without explanations: ${examWithoutExp.map(q => q.id).slice(0, 10).join(', ')}`);

// Check for broken questions in published channels
const publishedBroken = allPublished.filter(({ question: q }) =>
  q.verificationStatus === 'broken'
);
test('no broken questions in published channels',
  publishedBroken.length === 0,
  `${publishedBroken.length} broken: ${publishedBroken.map(e => e.question.id).join(', ')}`);

// Check for disputed questions in published channels
const publishedDisputed = allPublished.filter(({ question: q }) =>
  q.verificationStatus === 'disputed'
);
test('no disputed questions in published channels',
  publishedDisputed.length === 0,
  `${publishedDisputed.length} disputed: ${publishedDisputed.map(e => e.question.id).join(', ')}`);

// ──────────────────────────────────────────────────────────────────────
//  7. RELEASE GATE
// ──────────────────────────────────────────────────────────────────────
header('7. Release Gate Criteria');

const summary = summaryFile?.data;
if (summary) {
  test('verification summary: publishedBlockers = 0',
    summary.publishedBlockers === 0,
    `got ${summary.publishedBlockers}`);

  test('verification summary: channelCounts.daily >= 50',
    (summary.channelCounts?.daily || 0) >= 50,
    `daily=${summary.channelCounts?.daily}`);

  test('verification summary: channelCounts.super >= 5',
    (summary.channelCounts?.super || 0) >= 5,
    `super=${summary.channelCounts?.super}`);

  test('verification summary: channelCounts.dungeon >= 100',
    (summary.channelCounts?.dungeon || 0) >= 100,
    `dungeon=${summary.channelCounts?.dungeon}`);

  test('verification summary: channelCounts.exam >= 100',
    (summary.channelCounts?.exam || 0) >= 100,
    `exam=${summary.channelCounts?.exam}`);

  console.log(`  ${CYAN}Channel counts:${RST} daily=${summary.channelCounts?.daily} super=${summary.channelCounts?.super} exam=${summary.channelCounts?.exam} dungeon=${summary.channelCounts?.dungeon}`);
  console.log(`  ${CYAN}Status counts:${RST} auto_verified=${summary.statusCounts?.auto_verified} auto_probable=${summary.statusCounts?.auto_probable} disputed=${summary.statusCounts?.disputed} broken=${summary.statusCounts?.broken}`);
}

// ──────────────────────────────────────────────────────────────────────
//  8. CROSS-CHANNEL CONSISTENCY
// ──────────────────────────────────────────────────────────────────────
header('8. Cross-Channel Consistency');

// Questions that appear in multiple channels should be consistent
const questionsInMultiple = [...allChannelQuestions.entries()]
  .filter(([_, channels]) => channels.length > 1);

console.log(`  ${CYAN}Questions appearing in multiple channels: ${questionsInMultiple.length}${RST}`);

// Verify the same question has consistent data across channels
let crossChannelInconsistencies = 0;
for (const [qid, channels] of questionsInMultiple) {
  const instances = [];
  for (const ch of channels) {
    const file = channelFiles[ch];
    if (!file) continue;
    const q = (file.data.questions || []).find(q => q.id === qid);
    if (q) instances.push({ channel: ch, question: q });
  }
  // Compare first against all others
  if (instances.length > 1) {
    const base = JSON.stringify({
      question: instances[0].question.question,
      answer: instances[0].question.answer,
      options: instances[0].question.options,
      explanation: instances[0].question.explanation,
      type: instances[0].question.type,
    });
    for (let i = 1; i < instances.length; i++) {
      const cmp = JSON.stringify({
        question: instances[i].question.question,
        answer: instances[i].question.answer,
        options: instances[i].question.options,
        explanation: instances[i].question.explanation,
        type: instances[i].question.type,
      });
      if (base !== cmp) {
        crossChannelInconsistencies++;
        console.log(`  ${RED}✗${RST} ${qid}: ${instances[0].channel} vs ${instances[i].channel} differ`);
      }
    }
  }
}

test('no cross-channel data inconsistency for shared questions',
  crossChannelInconsistencies === 0,
  `${crossChannelInconsistencies} inconsistencies`);

// Verify no question appears in exam but NOT in dungeon for J-group
const examJchoiceIds = new Set(
  (channelFiles.exam?.data.questions || [])
    .filter(q => q.exam?.group === 'J' && q.type === 'choice')
    .map(q => q.id)
);
const dungeonIds = new Set((channelFiles.dungeon?.data.questions || []).map(q => q.id));
const jNotInDungeon = [...examJchoiceIds].filter(id => !dungeonIds.has(id));
test('J-group CSP choices in exam also appear in dungeon',
  jNotInDungeon.length === 0,
  `${jNotInDungeon.length} missing from dungeon: ${jNotInDungeon.join(', ')}`);

// ──────────────────────────────────────────────────────────────────────
//  9. SOURCE DATA & RECOVERY INTEGRITY
// ──────────────────────────────────────────────────────────────────────
header('9. Source & Recovery Data Integrity');

const recoveryPath = path.join(root, 'scripts/question-bank/data/csp-choice-recovery.json');
if (fs.existsSync(recoveryPath)) {
  const recovery = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'));
  const recoveryQuestions = recovery.questions || [];
  console.log(`  ${CYAN}Recovery data: ${recoveryQuestions.length} questions${RST}`);

  const recoveryMap = new Map(recoveryQuestions.map(q => [q.id, q]));

  // All recovery questions should have explanations (post our fix)
  const recoveryNoExp = recoveryQuestions.filter(q => !q.explanation || q.explanation.trim() === '');
  test('all recovery questions have explanations',
    recoveryNoExp.length === 0,
    `${recoveryNoExp.length} still without explanations: ${recoveryNoExp.map(q => q.id).slice(0, 10).join(', ')}`);

  // Recovery IDs should be a subset of canonical
  const recoveryIdsInCanonical = recoveryQuestions.filter(q => canonicalMap.has(q.id));
  const recoveryIdsNotInCanonical = recoveryQuestions.filter(q => !canonicalMap.has(q.id));
  test('all recovery question IDs exist in canonical',
    recoveryIdsNotInCanonical.length === 0,
    `${recoveryIdsNotInCanonical.length} not in canonical: ${recoveryIdsNotInCanonical.map(q => q.id).slice(0, 5).join(', ')}`);

  console.log(`    ${recoveryIdsInCanonical.length}/${recoveryQuestions.length} recovery questions match canonical`);

  // Check source catalog if present
  const catalogPath = v2('source-catalog.json');
  if (fs.existsSync(catalogPath)) {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const catalogCount = catalog.sources?.length || catalog.entries?.length || Object.keys(catalog).length;
    console.log(`  ${CYAN}Source catalog: ${catalogCount} entries${RST}`);
  }
} else {
  warnTest('recovery data file exists',
    false,
    'csp-choice-recovery.json not found');
}

// ──────────────────────────────────────────────────────────────────────
//  10. DATA COVERAGE SUMMARY
// ──────────────────────────────────────────────────────────────────────
header('10. Data Coverage Summary');

const totalPublished = allPublished.length;
const uniquePublished = new Set(allPublished.map(e => e.question.id)).size;

console.log(`  Total published question instances: ${totalPublished}`);
console.log(`  Unique published questions: ${uniquePublished}`);
console.log(`  Canonical questions: ${canonical.data.questionCount}`);
console.log(`  Not published (quarantined): ${canonical.data.questionCount - uniquePublished}`);

// Published by source
const bySource = {};
for (const { question: q } of allPublished) {
  const key = q.source || 'unknown';
  bySource[key] = (bySource[key] || 0) + 1;
}
console.log(`  By source: ${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join(', ')}`);

// Published by type
const byType = {};
for (const { question: q } of allPublished) {
  const key = q.type || 'unknown';
  byType[key] = (byType[key] || 0) + 1;
}
console.log(`  By type: ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(', ')}`);

// Quarantined questions breakdown
const publishedIds = new Set(allPublished.map(e => e.question.id));
const quarantined = canonical.data.questions.filter(q => !publishedIds.has(q.id));
const quarantinedByStatus = {};
for (const q of quarantined) {
  const v = verdictMap.get(q.id);
  const status = v?.status || 'no_verdict';
  quarantinedByStatus[status] = (quarantinedByStatus[status] || 0) + 1;
}
console.log(`  ${CYAN}Quarantined (not in any channel): ${quarantined.length}${RST}`);
for (const [status, count] of Object.entries(quarantinedByStatus).sort()) {
  console.log(`    ${status}: ${count}`);
}

// List specific disputed/broken quarantined CSP choices of interest
const quarantinedCspChoices = quarantined.filter(q => q.source === 'csp_exam' && q.type === 'choice');
if (quarantinedCspChoices.length > 0) {
  console.log(`  ${YELLOW}Quarantined CSP choices:${RST}`);
  for (const q of quarantinedCspChoices) {
    const v = verdictMap.get(q.id);
    console.log(`    ${q.id} (${q.exam?.year}-${q.exam?.group}) status=${v?.status} provenance=${q.provenance?.level}`);
  }
}

// ──────────────────────────────────────────────────────────────────────
//  RESULTS
// ──────────────────────────────────────────────────────────────────────
header('RESULTS');

const total = pass + fail + warn;
console.log(`\n  ${BOLD}Total: ${total} checks${RST}`);
console.log(`  ${GREEN}Passed: ${pass}${RST}`);
console.log(`  ${RED}Failed: ${fail}${RST}`);
console.log(`  ${YELLOW}Warnings: ${warn}${RST}`);

if (failures.length > 0) {
  console.log(`\n${RED}${BOLD}FAILURES:${RST}`);
  for (const f of failures) {
    console.log(`  ${RED}✗${RST} ${f.label}`);
    if (f.detail) console.log(`    ${RED}→ ${f.detail}${RST}`);
  }
}

if (warnings.length > 0) {
  console.log(`\n${YELLOW}${BOLD}WARNINGS:${RST}`);
  for (const w of warnings) {
    console.log(`  ${YELLOW}⚠${RST} ${w.label}`);
    if (w.detail) console.log(`    → ${w.detail}`);
  }
}

console.log(`\n${fail === 0 ? GREEN : RED}${BOLD}${fail === 0 ? '✓ ALL CRITICAL CHECKS PASSED' : '✗ SOME CHECKS FAILED'}${RST}`);

process.exitCode = fail > 0 ? 1 : 0;
