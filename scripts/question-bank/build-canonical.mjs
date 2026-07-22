import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeLegacyQuestion, stableContentHash } from './lib/normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_EXPORT_AGE_MS = 24 * 60 * 60 * 1000;

function hasValue(value) {
  return value !== null && value !== undefined && value !== '' && value !== 0;
}

function mergeExam(preferred, secondary) {
  return Object.fromEntries(
    Object.keys(preferred).map(key => [key, hasValue(preferred[key]) ? preferred[key] : secondary[key]]),
  );
}

function mergeQuestion(preferred, secondary) {
  const useSecondaryChildren = preferred.children.length === 0 && secondary.children.length > 0;
  const merged = {
    ...secondary,
    ...preferred,
    exam: mergeExam(preferred.exam, secondary.exam),
    type: useSecondaryChildren ? secondary.type : preferred.type,
    code: preferred.code || secondary.code,
    assets: [...new Set([...preferred.assets, ...secondary.assets])],
    children: useSecondaryChildren ? secondary.children : preferred.children,
  };
  const {
    contentHash: _oldHash,
    importOrigin,
    importPriority,
    ...hashable
  } = merged;
  return {
    ...hashable,
    importOrigin,
    importPriority,
    contentHash: stableContentHash(hashable),
  };
}

export function mergeCanonicalInputs(inputGroups) {
  const byId = new Map();
  const conflicts = [];
  const sortedGroups = [...inputGroups].sort((left, right) => right.priority - left.priority);

  for (const { questions, priority, origin } of sortedGroups) {
    for (const question of questions) {
      const existing = byId.get(question.id);
      if (!existing) {
        byId.set(question.id, { ...question, importOrigin: origin, importPriority: priority });
        continue;
      }

      if (existing.contentHash !== question.contentHash) {
        conflicts.push({
          id: question.id,
          preferredOrigin: existing.importOrigin,
          secondaryOrigin: origin,
          preferredHash: existing.contentHash,
          secondaryHash: question.contentHash,
        });
      }
      byId.set(question.id, mergeQuestion(existing, question));
    }
  }

  return {
    questions: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
    conflicts: conflicts.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function examOrder(question) {
  const section = question.type === 'choice' ? 0 : question.type === 'reading' ? 1 : 2;
  return [section, Number(question.exam.originalNumber) || Number.MAX_SAFE_INTEGER, question.id];
}

export function buildExamManifests(questions) {
  const papers = new Map();
  for (const question of questions.filter(item => ['J', 'S'].includes(item.exam.group))) {
    const id = `${question.exam.year}-${question.exam.group}`;
    if (!papers.has(id)) {
      papers.set(id, { id, year: question.exam.year, group: question.exam.group, questionIds: [] });
    }
    papers.get(id).questionIds.push(question.id);
  }

  const byId = new Map(questions.map(question => [question.id, question]));
  for (const paper of papers.values()) {
    paper.questionIds.sort((leftId, rightId) => {
      const left = examOrder(byId.get(leftId));
      const right = examOrder(byId.get(rightId));
      return left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2]);
    });
  }
  return [...papers.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertFreshReviewedExport(reviewedExport, now = Date.now()) {
  const exportedAt = Date.parse(reviewedExport.exportedAt);
  if (!Number.isFinite(exportedAt)) throw new Error('reviewed export has an invalid exportedAt');
  if (process.env.QUESTION_BANK_ALLOW_STALE_EXPORT !== '1' && now - exportedAt > MAX_EXPORT_AGE_MS) {
    throw new Error('reviewed export is older than 24 hours');
  }
  if (!Number.isInteger(reviewedExport.revision) || !reviewedExport.questions) {
    throw new Error('reviewed export is invalid');
  }
}

export function buildCanonicalBank({
  reviewedPath = path.join(root, '.tmp/reviewed-question-bank.json'),
  outputDirectory = path.join(root, 'public/course-data/question-bank-v2'),
} = {}) {
  const reviewedExport = readJson(reviewedPath);
  assertFreshReviewedExport(reviewedExport);
  const examRaw = readJson(path.join(root, 'public/course-data/csp-exam-bank.json'));
  const dungeonRaw = readJson(path.join(root, 'public/course-data/dungeon-exam-bank.json'));
  const recoveryPath = path.join(root, 'scripts/question-bank/data/csp-choice-recovery.json');
  const recoveryRaw = readJson(recoveryPath);
  const recoveryRevision = Number.parseInt(
    createHash('sha256').update(fs.readFileSync(recoveryPath)).digest('hex').slice(0, 6),
    16,
  );
  const contentRevision = reviewedExport.revision * 100_000_000 + recoveryRevision;

  const groups = [
    { priority: 120, origin: 'official_source_recovery', questions: recoveryRaw.questions },
    { priority: 100, origin: 'reviewed_cloud', questions: Object.values(reviewedExport.questions).map(normalizeLegacyQuestion) },
    { priority: 20, origin: 'legacy_exam', questions: examRaw.questions.map(normalizeLegacyQuestion) },
    { priority: 10, origin: 'legacy_dungeon', questions: dungeonRaw.questions.map(normalizeLegacyQuestion) },
  ];
  const merged = mergeCanonicalInputs(groups);
  const generatedAt = new Date().toISOString();
  const canonical = {
    schemaVersion: 2,
    baseVersion: reviewedExport.baseVersion,
    contentRevision,
    generatedAt,
    questionCount: merged.questions.length,
    conflictCount: merged.conflicts.length,
    conflicts: merged.conflicts,
    questions: merged.questions,
  };
  const manifests = {
    schemaVersion: 2,
    contentRevision,
    generatedAt,
    papers: buildExamManifests(merged.questions),
  };

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'canonical.json'), `${JSON.stringify(canonical, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'exam-manifests.json'), `${JSON.stringify(manifests, null, 2)}\n`);
  return { canonical, manifests };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { canonical, manifests } = buildCanonicalBank();
    console.log(`Built ${canonical.questionCount} canonical questions with ${canonical.conflictCount} recorded conflicts.`);
    console.log(`Built ${manifests.papers.length} CSP-J/S paper manifests.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
