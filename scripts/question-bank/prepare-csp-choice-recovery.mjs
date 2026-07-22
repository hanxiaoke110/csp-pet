import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stableContentHash } from './lib/normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, 'reports/csp-sources/structured-choice-sources.json');
const canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json');
const reportPath = path.join(root, 'reports/csp-sources/choice-recovery-report.json');
const candidatePath = path.join(root, 'reports/csp-sources/canonical-choice-recovery-candidate.json');
const overlayPath = path.join(root, 'scripts/question-bank/data/csp-choice-recovery.json');

const ANSWER_KEYS = {
  '2019-J': 'ADC AADCCBCCACBA'.replace(/\s/g, ''),
  '2019-S': 'DCDBBBCBBADDBBA',
  '2020-J': 'BACBDBBCCDCDBBD',
  '2020-S': 'CBBBDBAACCCDBDC',
  '2021-J': 'DBACDDCABBBACBB',
  '2021-S': 'ABACCCCBDAACCCB',
  '2022-J': 'ACCCBBBCBDDBCBB',
  '2022-S': 'BADCABCBDACDBBB',
  '2023-J': 'BDAACBCADAABBAD',
  '2023-S': 'BAACBACBACACCBA',
  '2024-J': 'CABDDCDBBABADAB',
  '2024-S': 'AACBBBDABDacbcd'.toUpperCase(),
};

const SEVERE_UNCERTAINTY = /visual|missing|incomplete|garbled|not.?available|omitted|corrupt|figure|graph|table|obscured|图示|图形|表格|缺失|无法从文本完整恢复/i;

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function compactOption(value) {
  return String(value ?? '')
    .replace(/^[A-DＡ-Ｄ](?:[.、．:)]|\s)+/i, '')
    .replace(/[\s　，,。；;]/g, '')
    .toLowerCase();
}

function answerIndex(key, number) {
  const letter = ANSWER_KEYS[key]?.[number - 1];
  return letter ? letter.charCodeAt(0) - 65 : null;
}

function questionId(key, number) {
  const [year, group] = key.split('-');
  return `csp-${group.toLowerCase()}-${year}-c${String(number).padStart(2, '0')}`;
}

function replaceQuestion(canonical, source, key, officialAnswer) {
  const core = {
    ...canonical,
    question: source.question.trim(),
    code: String(source.code || '').trim() || null,
    options: source.options.map(option => String(option).trim()),
    answer: { correctIndex: officialAnswer ?? canonical.answer.correctIndex },
    explanation: '',
    knowledgePoint: '待复核',
    provenance: {
      ...canonical.provenance,
      level: 'local_source_copy',
      page: source.sourcePages[0],
    },
  };
  const { contentHash: _oldHash, importOrigin: _oldOrigin, importPriority: _oldPriority, ...hashable } = core;
  return {
    ...hashable,
    importOrigin: 'official_source_recovery',
    importPriority: 110,
    contentHash: stableContentHash(hashable),
  };
}

export function prepareCspChoiceRecovery() {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  const canonicalById = new Map(canonical.questions.map(question => [question.id, question]));
  const records = [];
  const replacements = new Map();

  for (const paper of source.papers) {
    for (const extracted of paper.questions) {
      const id = questionId(paper.key, extracted.number);
      const current = canonicalById.get(id);
      if (!current) {
        records.push({ id, paper: paper.key, number: extracted.number, status: 'missing_canonical' });
        continue;
      }
      const uncertainty = (extracted.uncertainFields || []).map(String);
      const normalizedOptions = extracted.options.map(compactOption);
      const malformedOptions = normalizedOptions.some(option => !option)
        || new Set(normalizedOptions).size !== normalizedOptions.length;
      const severe = extracted.requiresVisual
        || malformedOptions
        || uncertainty.some(item => SEVERE_UNCERTAINTY.test(item));
      const officialAnswer = answerIndex(paper.key, extracted.number);
      const oldCorrectValue = compactOption(current.options[current.answer.correctIndex]);
      const remappedAnswer = extracted.options.findIndex(option => compactOption(option) === oldCorrectValue);
      const resolvedAnswer = officialAnswer ?? (remappedAnswer >= 0 ? remappedAnswer : null);
      const status = severe ? 'quarantined_source_gap'
        : officialAnswer !== null ? 'ready_official_answer'
          : remappedAnswer >= 0 ? 'ready_answer_value_match'
            : 'needs_ai_answer';
      const record = {
        id,
        paper: paper.key,
        number: extracted.number,
        status,
        uncertainty,
        malformedOptions,
        sourcePages: extracted.sourcePages,
        currentAnswer: current.answer.correctIndex,
        officialAnswer,
        remappedAnswer: remappedAnswer >= 0 ? remappedAnswer : null,
        resolvedAnswer,
        changedStem: compactOption(current.question) !== compactOption(extracted.question),
        changedOptions: JSON.stringify(current.options.map(compactOption)) !== JSON.stringify(extracted.options.map(compactOption)),
      };
      records.push(record);
      if (!severe) replacements.set(id, replaceQuestion(current, extracted, paper.key, resolvedAnswer));
    }
  }

  const questions = canonical.questions.map(question => replacements.get(question.id) || question);
  const counts = records.reduce((result, record) => {
    result[record.status] = (result[record.status] || 0) + 1;
    return result;
  }, {});
  const candidate = {
    ...canonical,
    generatedAt: new Date().toISOString(),
    questions,
  };
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    counts,
    replacementCount: replacements.size,
    records,
  };
  writeJsonAtomic(reportPath, report);
  writeJsonAtomic(candidatePath, candidate);
  fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
  writeJsonAtomic(overlayPath, {
    schemaVersion: 1,
    source: 'CSP-J/S official first-round papers',
    questions: [...replacements.values()],
  });
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = prepareCspChoiceRecovery();
  console.log(`Prepared ${result.replacementCount} CSP choice replacements: ${JSON.stringify(result.counts)}`);
}
