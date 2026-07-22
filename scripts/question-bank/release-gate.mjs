import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'public/course-data/question-bank-v2');

export const DEFAULT_THRESHOLDS = {
  daily: 100,
  super: 5,
  examPapers: 12,
  examQuestionsPerPaper: 13,
  dungeon: 100,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function evaluateReleaseGate({ manifest, files, thresholds = DEFAULT_THRESHOLDS }) {
  const failures = [];
  const parsed = {};
  for (const [logicalName, entry] of Object.entries(manifest.files)) {
    const raw = files[logicalName];
    if (!raw) {
      failures.push(`missing=${logicalName}`);
      continue;
    }
    const actualHash = createHash('sha256').update(raw).digest('hex');
    if (actualHash !== entry.sha256) failures.push(`hashMismatch=${logicalName}`);
    try {
      parsed[logicalName] = JSON.parse(raw);
    } catch {
      failures.push(`invalidJson=${logicalName}`);
    }
  }

  const summary = parsed['verification-summary.json'];
  if (!summary) return { ready: false, failures: [...failures, 'missing=verification-summary.json'] };
  if (summary.publishedBlockers !== 0) failures.push(`publishedBlockers=${summary.publishedBlockers}`);
  if (summary.channelCounts.daily < thresholds.daily) failures.push(`daily=${summary.channelCounts.daily}<${thresholds.daily}`);
  if (summary.channelCounts.super < thresholds.super) failures.push(`super=${summary.channelCounts.super}<${thresholds.super}`);
  if (summary.channelCounts.dungeon < thresholds.dungeon) failures.push(`dungeon=${summary.channelCounts.dungeon}<${thresholds.dungeon}`);

  const examManifests = parsed['exam-manifests.json'];
  if (!examManifests || examManifests.papers.length < thresholds.examPapers) {
    failures.push(`examPapers=${examManifests?.papers.length || 0}<${thresholds.examPapers}`);
  } else {
    for (const paper of examManifests.papers) {
      if (paper.questionIds.length < thresholds.examQuestionsPerPaper) {
        failures.push(`examPaper=${paper.id}:${paper.questionIds.length}<${thresholds.examQuestionsPerPaper}`);
      }
    }
  }

  for (const [logicalName, snapshot] of Object.entries(parsed)) {
    if (!Array.isArray(snapshot?.questions)) continue;
    for (const question of snapshot.questions) {
      if (question.verificationStatus !== 'auto_verified') failures.push(`unverified=${logicalName}:${question.id}`);
      if (question.assets?.some(asset => asset.includes('/gesp-code-images/'))) failures.push(`leakedImage=${question.id}`);
      if (['choice', 'boolean'].includes(question.type)
          && question.options.some(option => !String(option).replace(/^[A-DＡ-Ｄ](?:[.、．:)]|\s)+/i, '').trim())) {
        failures.push(`emptyOption=${question.id}`);
      }
    }
  }
  return { ready: failures.length === 0, failures: [...new Set(failures)] };
}

export function runReleaseGate() {
  const manifest = readJson(path.join(directory, 'manifest.json'));
  const files = Object.fromEntries(Object.entries(manifest.files).map(([logicalName, entry]) => [
    logicalName,
    fs.readFileSync(path.join(directory, entry.path), 'utf8'),
  ]));
  return evaluateReleaseGate({ manifest, files });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runReleaseGate();
  if (!result.ready) {
    console.error(`Question bank v2 is not ready for cutover:\n${result.failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('Question bank v2 release gate passed.');
  }
}
