import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'public/course-data/question-bank-v2');

export const DEFAULT_THRESHOLDS = {
  daily: 50,
  super: 5,
  examPapers: 12,
  examQuestionsPerPaper: 5,
  dungeon: 100,
  topic: 100,
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
  const channelCounts = summary.channelCounts ?? {};
  if (summary.publishedBlockers !== 0) failures.push(`publishedBlockers=${summary.publishedBlockers}`);
  if ((channelCounts.daily ?? 0) < thresholds.daily) failures.push(`daily=${channelCounts.daily ?? 0}<${thresholds.daily}`);
  if ((channelCounts.super ?? 0) < thresholds.super) failures.push(`super=${channelCounts.super ?? 0}<${thresholds.super}`);
  if ((channelCounts.dungeon ?? 0) < thresholds.dungeon) failures.push(`dungeon=${channelCounts.dungeon ?? 0}<${thresholds.dungeon}`);
  if ((channelCounts.topic ?? 0) < thresholds.topic) failures.push(`topic=${channelCounts.topic ?? 0}<${thresholds.topic}`);

  const examManifests = parsed['exam-manifests.json'];
  const paperCount = examManifests?.papers?.length ?? 0;
  if (paperCount < thresholds.examPapers) {
    failures.push(`examPapers=${paperCount}<${thresholds.examPapers}`);
  } else {
    for (const paper of examManifests.papers) {
      if (!Array.isArray(paper.questionIds) || paper.questionIds.length < thresholds.examQuestionsPerPaper) {
        failures.push(`examPaper=${paper.id}:${paper.questionIds?.length ?? 0}<${thresholds.examQuestionsPerPaper}`);
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
      if (question.options?.some(option => /\b\d+\s+um\s*=\s*sum\b/.test(String(option)))) {
        failures.push(`ocrCodeResidue=${logicalName}:${question.id}`);
      }
      if (logicalName === 'super-cspj.json') {
        if (!['reading', 'fillBlank'].includes(question.type)
            || (!String(question.code || '').trim() && !(question.assets?.length > 0))
            || !(question.children?.length > 0)) {
          failures.push(`invalidSuperStructure=${question.id}`);
        } else {
          for (const child of question.children) {
            if (!String(child.label || '').trim()
                || !(child.options?.length >= 2)
                || child.options.some(option => !String(option).trim())
                || !Number.isInteger(child.correctIndex)
                || child.correctIndex < 0
                || child.correctIndex >= child.options.length) {
              failures.push(`invalidSuperChild=${question.id}:${child.id || child.position || '?'}`);
            }
          }
        }
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
