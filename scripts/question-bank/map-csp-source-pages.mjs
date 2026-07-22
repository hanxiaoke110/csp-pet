import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json');
const sourceIndexPath = path.join(root, 'reports/csp-sources/index.json');
const outputPath = path.join(root, 'reports/csp-sources/question-page-map.json');

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

export function normalizeMatchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[（(][^)）]{0,4}[）)]/g, '')
    .replace(/[^一-鿿㐀-䶿a-z0-9_+<>=!&|%*/^~-]/g, '');
}

function ngrams(value, size) {
  const normalized = normalizeMatchText(value);
  const result = new Set();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    result.add(normalized.slice(index, index + size));
  }
  return result;
}

function containmentScore(needle, haystack, size) {
  const expected = ngrams(needle, size);
  if (expected.size === 0) return 0;
  const observed = ngrams(haystack, size);
  let matches = 0;
  for (const gram of expected) if (observed.has(gram)) matches += 1;
  return matches / expected.size;
}

function questionEvidenceText(question) {
  return [
    question.question,
    question.code,
    ...question.options,
    ...question.children.flatMap(child => [child.label, ...child.options]),
  ].filter(Boolean).join('\n');
}

export function scoreQuestionPage(question, pageText) {
  const stem = String(question.question || '');
  const code = String(question.code || '');
  const options = question.children.length > 0
    ? question.children.flatMap(child => child.options)
    : question.options;
  const full = questionEvidenceText(question);
  const stemScore = containmentScore(stem, pageText, stem.length < 24 ? 2 : 3);
  const codeScore = code ? containmentScore(code, pageText, 3) : null;
  const optionScore = options.length > 0 ? containmentScore(options.join('\n'), pageText, 2) : 0;
  const fullScore = containmentScore(full, pageText, 3);
  const weighted = codeScore === null
    ? (stemScore * 0.62) + (optionScore * 0.23) + (fullScore * 0.15)
    : (stemScore * 0.35) + (codeScore * 0.4) + (optionScore * 0.1) + (fullScore * 0.15);
  const evidenceScore = Math.max(stemScore, optionScore, codeScore ?? 0);
  return {
    score: Number(weighted.toFixed(4)),
    evidenceScore: Number(evidenceScore.toFixed(4)),
    stemScore: Number(stemScore.toFixed(4)),
    codeScore: codeScore === null ? null : Number(codeScore.toFixed(4)),
    optionScore: Number(optionScore.toFixed(4)),
    fullScore: Number(fullScore.toFixed(4)),
  };
}

function matchLevel(best, runnerUp) {
  const margin = best.evidenceScore - (runnerUp?.evidenceScore || 0);
  if (best.evidenceScore >= 0.78 && margin >= 0.12) return 'high';
  if (best.evidenceScore >= 0.55 && margin >= 0.06) return 'probable';
  return 'unresolved';
}

function contentSignals(question, match) {
  const codePresent = Boolean(String(question.code || '').trim());
  return {
    stem: match.stemScore >= 0.55 ? 'consistent' : match.stemScore < 0.25 ? 'conflict' : 'weak',
    options: match.optionScore >= 0.7 ? 'consistent' : match.optionScore < 0.3 ? 'conflict' : 'weak',
    code: !codePresent ? 'not_applicable'
      : match.codeScore >= 0.55 ? 'consistent' : match.codeScore < 0.25 ? 'conflict' : 'weak',
  };
}

export function mapCspSourcePages({ canonicalFile = canonicalPath, sourceIndexFile = sourceIndexPath } = {}) {
  const canonical = JSON.parse(fs.readFileSync(canonicalFile, 'utf8'));
  const sourceIndex = JSON.parse(fs.readFileSync(sourceIndexFile, 'utf8'));
  const sourceByPaper = new Map(sourceIndex.entries.map(entry => [entry.key, entry]));
  const textCache = new Map();
  const matches = [];

  for (const question of canonical.questions.filter(item => item.source === 'csp_exam')) {
    const paperKey = `${question.exam.year}-${question.exam.group}`;
    const source = sourceByPaper.get(paperKey);
    if (!source) {
      matches.push({ questionId: question.id, paperKey, level: 'unresolved', reason: 'missing_source_paper' });
      continue;
    }
    const candidates = source.pages.map(page => {
      const absoluteTextPath = path.join(root, page.textPath);
      if (!textCache.has(absoluteTextPath)) textCache.set(absoluteTextPath, fs.readFileSync(absoluteTextPath, 'utf8'));
      return {
        page: page.page,
        imagePath: page.imagePath,
        textPath: page.textPath,
        ...scoreQuestionPage(question, textCache.get(absoluteTextPath)),
      };
    }).sort((left, right) => right.evidenceScore - left.evidenceScore
      || right.score - left.score
      || left.page - right.page);
    const [best, runnerUp] = candidates;
    const level = matchLevel(best, runnerUp);
    matches.push({
      questionId: question.id,
      paperKey,
      type: question.type,
      originalNumber: question.exam.originalNumber,
      level,
      margin: Number((best.evidenceScore - (runnerUp?.evidenceScore || 0)).toFixed(4)),
      contentSignals: contentSignals(question, best),
      best,
      runnerUp,
    });
  }

  const counts = matches.reduce((result, match) => {
    result[match.level] = (result[match.level] || 0) + 1;
    return result;
  }, {});
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    questionCount: matches.length,
    counts,
    matches,
  };
  writeJsonAtomic(outputPath, output);
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = mapCspSourcePages();
  console.log(`Mapped ${result.questionCount} CSP questions: ${JSON.stringify(result.counts)}`);
}
