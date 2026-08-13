import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildChannels, CHANNEL_RULES_REVISION } from './lib/channels.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputDirectory = path.join(root, 'public/course-data/question-bank-v2');
const excludedQuestionIdsPath = path.join(root, 'public/course-data/excluded-question-ids.json');

// Papers with fewer verified questions than this are not a usable exam
// experience and are dropped from the manifest until re-verified.
export const MIN_PAPER_QUESTIONS = 5;

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(outputDirectory, fileName), 'utf8'));
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeAtomic(filePath, content) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, filePath);
}

function writeImmutable(logicalName, value) {
  const content = serialize(value);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const extension = path.extname(logicalName);
  const baseName = logicalName.slice(0, -extension.length);
  const fileName = `${baseName}.${sha256.slice(0, 12)}${extension}`;
  const filePath = path.join(outputDirectory, fileName);
  if (!fs.existsSync(filePath)) writeAtomic(filePath, content);
  return {
    path: fileName,
    sha256,
    bytes: Buffer.byteLength(content),
    count: Array.isArray(value.questions) ? value.questions.length : Array.isArray(value.papers) ? value.papers.length : 1,
  };
}

function studentQuestion(question, verdict) {
  const publishedExplanation = verdict.evidence?.publishedExplanation || question.explanation;
  return {
    ...question,
    assets: question.assets.filter(source => !/\/gesp-code-images\//.test(source)),
    explanation: publishedExplanation,
    verificationStatus: verdict.status,
  };
}

export function publishSnapshots() {
  const canonical = readJson('canonical.json');
  const verification = readJson('verification.json');
  const rawExamManifests = readJson('exam-manifests.json');
  if (canonical.contentRevision !== verification.contentRevision) {
    throw new Error('canonical and verification revisions differ');
  }

  const verdicts = new Map(verification.results.map(result => [result.questionId, result]));
  const excludedQuestionIds = new Set(JSON.parse(fs.readFileSync(excludedQuestionIdsPath, 'utf8')).ids || []);
  const joined = canonical.questions.map(question => {
    const verdict = verdicts.get(question.id);
    if (!verdict || verdict.contentHash !== question.contentHash) {
      throw new Error(`stale or missing verdict for ${question.id}`);
    }
    return studentQuestion(question, verdict);
  }).filter(question => !excludedQuestionIds.has(question.id));
  const channels = buildChannels(joined);
  const generatedAt = new Date().toISOString();
  const revisions = {
    contentRevision: canonical.contentRevision,
    verificationRevision: verification.verificationRevision,
    channelRulesRevision: CHANNEL_RULES_REVISION,
  };
  const snapshot = questions => ({ schemaVersion: 2, ...revisions, generatedAt, questionCount: questions.length, questions });

  // Papers with too few verified questions are not a usable exam experience
  // (a "past paper" of 1-3 questions). Drop them from the manifest and from the
  // exam channel until their questions get re-verified; J-group questions stay
  // available in the dungeon channel.
  const allExamIds = new Set(channels.exam.map(question => question.id));
  const filteredPapers = rawExamManifests.papers
    .map(paper => ({ ...paper, questionIds: paper.questionIds.filter(id => allExamIds.has(id)) }));
  const viablePapers = filteredPapers.filter(paper => paper.questionIds.length >= MIN_PAPER_QUESTIONS);
  const droppedPapers = filteredPapers
    .filter(paper => paper.questionIds.length > 0 && paper.questionIds.length < MIN_PAPER_QUESTIONS)
    .map(paper => ({ id: paper.id, questions: paper.questionIds.length }));
  const viableIds = new Set(viablePapers.flatMap(paper => paper.questionIds));
  channels.exam = channels.exam.filter(question => viableIds.has(question.id));
  const examManifests = {
    schemaVersion: 2,
    ...revisions,
    generatedAt,
    papers: viablePapers,
  };

  // Real blocker count: a published question with an empty explanation or an
  // empty option is a student-facing defect and must fail the release gate.
  const published = new Map();
  for (const questions of Object.values(channels)) {
    for (const question of questions) published.set(question.id, question);
  }
  const publishedBlockerIds = [...published.values()]
    .filter(question => !String(question.explanation || '').trim()
      || (['choice', 'boolean'].includes(question.type)
        && question.options.some(option => !String(option).trim())))
    .map(question => question.id)
    .sort();

  const statusCounts = verification.statusCounts;
  const channelCounts = Object.fromEntries(Object.entries(channels).map(([name, questions]) => [name, questions.length]));
  const summary = {
    schemaVersion: 2,
    ...revisions,
    generatedAt,
    canonicalCount: canonical.questionCount,
    statusCounts,
    channelCounts,
    publishedBlockers: publishedBlockerIds.length,
    publishedBlockerIds,
    droppedExamPapers: droppedPapers,
  };

  const logicalFiles = {
    'daily-gesp.json': snapshot(channels.daily),
    'super-cspj.json': snapshot(channels.super),
    'exam-questions.json': snapshot(channels.exam),
    'exam-manifests.json': examManifests,
    'dungeon-mixed.json': snapshot(channels.dungeon),
    'verification-summary.json': summary,
  };
  const files = Object.fromEntries(
    Object.entries(logicalFiles).map(([logicalName, value]) => [logicalName, writeImmutable(logicalName, value)]),
  );
  const manifest = { schemaVersion: 2, ...revisions, generatedAt, files };
  writeAtomic(path.join(outputDirectory, 'manifest.json'), serialize(manifest));
  return { manifest, summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { summary } = publishSnapshots();
    console.log(`Published verified channels: ${JSON.stringify(summary.channelCounts)}.`);
    if (summary.droppedExamPapers.length > 0) {
      console.log(`Dropped exam papers below ${MIN_PAPER_QUESTIONS} questions: ${summary.droppedExamPapers.map(p => `${p.id}(${p.questions})`).join(', ')}`);
    }
    if (summary.publishedBlockers > 0) {
      console.log(`WARNING: ${summary.publishedBlockers} published blockers: ${summary.publishedBlockerIds.join(', ')}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
