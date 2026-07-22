import fs from 'node:fs';

import { normalizeLegacyQuestion } from './normalize.mjs';

const OPTION_PREFIX = /^[A-DＡ-Ｄ][.、．:\s)]*/i;

function compactText(value) {
  return String(value ?? '')
    .trim()
    .replace(OPTION_PREFIX, '')
    .replace(/\s+/g, '')
    .replace(/[Ａ-Ｄ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xfee0));
}

function arrayStartsWith(candidate, expected) {
  return expected.every((value, index) => compactText(candidate[index]) === compactText(value));
}

export function canonicalAnswerVector(question) {
  return question.children.length > 0
    ? question.children.map(child => child.correctIndex)
    : [question.answer.correctIndex];
}

export function isQuestionContentCompatible(candidate, canonical) {
  if (!candidate || candidate.type !== canonical.type) return false;
  if (compactText(candidate.question) !== compactText(canonical.question)) return false;
  if (compactText(candidate.code) !== compactText(canonical.code)) return false;
  if (!arrayStartsWith(candidate.options, canonical.options)) return false;
  if (candidate.children.length !== canonical.children.length) return false;

  return canonical.children.every((child, index) => {
    const other = candidate.children[index];
    return compactText(other.label) === compactText(child.label)
      && other.position === child.position
      && arrayStartsWith(other.options, child.options);
  });
}

function rawQuestions(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.questions)) return value.questions;
  if (value?.questions && typeof value.questions === 'object') return Object.values(value.questions);
  if (Array.isArray(value?.data)) return value.data;
  if (value?.data && typeof value.data === 'object') return Object.values(value.data);
  return [];
}

export function loadQuestionSnapshot(filePath, origin) {
  if (!fs.existsSync(filePath)) return { origin, questions: new Map() };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const questions = rawQuestions(parsed)
    .map(normalizeLegacyQuestion)
    .filter(question => question.id);
  return { origin, questions: new Map(questions.map(question => [question.id, question])) };
}

export function collectImportConsensus(question, snapshots) {
  const matches = snapshots
    .map(snapshot => ({ origin: snapshot.origin, question: snapshot.questions.get(question.id) }))
    .filter(item => item.question && isQuestionContentCompatible(item.question, question))
    .map(item => ({
      origin: item.origin,
      answerVector: canonicalAnswerVector(item.question),
    }));
  const expected = canonicalAnswerVector(question);
  const agreeing = matches.filter(item => JSON.stringify(item.answerVector) === JSON.stringify(expected));

  return {
    count: agreeing.length,
    origins: agreeing.map(item => item.origin),
    answerVector: agreeing.length > 0 ? expected : null,
    contentCompatible: agreeing.length >= 2,
    observed: matches,
  };
}

export function answerVectorsEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}
