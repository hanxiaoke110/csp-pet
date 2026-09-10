import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultSourceRoot = '/Users/hanliuliu/Desktop/老师成长计划/学习平台/gesp-learning-h5/public';
const sourceRoot = process.env.GESP_LEARNING_PUBLIC || defaultSourceRoot;
const examDirectory = path.join(sourceRoot, 'data/exams');
const outputPath = path.join(root, 'scripts/question-bank/data/gesp-advanced-choice.json');
const assetDirectory = path.join(root, 'public/course-data/gesp-question-images');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeOption(option, expectedKey, questionId) {
  assert(option && option.key === expectedKey, `${questionId}: option order is invalid`);
  const text = String(option.text || option.imageText || '').trim();
  assert(text, `${questionId}: option ${expectedKey} is empty`);
  return `${expectedKey}. ${text}`;
}

function localAssetPath(sourceAsset, questionId) {
  if (!sourceAsset) return null;
  const sourcePath = path.join(sourceRoot, sourceAsset.replace(/^\/+/, ''));
  assert(fs.existsSync(sourcePath), `${questionId}: missing source asset ${sourceAsset}`);
  const extension = path.extname(sourcePath).toLowerCase();
  const destinationName = `${questionId}${extension}`;
  fs.mkdirSync(assetDirectory, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(assetDirectory, destinationName));
  return `/course-data/gesp-question-images/${destinationName}`;
}

function importQuestion(exam, question) {
  const originalNumber = Number(String(question.id).match(/q(\d+)$/)?.[1]);
  const questionId = `gesp-${exam.year}-${exam.month}-${exam.level}-${String(originalNumber).padStart(2, '0')}`;
  assert(Number.isInteger(originalNumber) && originalNumber >= 1, `${question.id}: invalid question number`);
  assert(question.type === 'choice', `${question.id}: only choice questions may be imported`);
  assert(Array.isArray(question.options) && question.options.length === 4, `${question.id}: expected four options`);
  const answerIndex = ['A', 'B', 'C', 'D'].indexOf(question.answer);
  assert(answerIndex >= 0, `${question.id}: invalid answer ${question.answer}`);
  const explanation = String(question.analysis || '').trim();
  assert(explanation, `${question.id}: explanation is empty`);

  return {
    id: questionId,
    source: 'gesp',
    year: exam.year,
    examDate: `${exam.year}-${exam.month}`,
    level: exam.level,
    originalNumber,
    questionType: 'choice',
    question: String(question.stem || '').trim(),
    image: localAssetPath(question.image, questionId),
    options: question.options.map((option, index) => normalizeOption(option, 'ABCD'[index], questionId)),
    correctIndex: answerIndex,
    explanation,
    knowledgePoint: `GESP ${exam.level}级`,
    difficulty: exam.level,
    sourceUrl: exam.source?.importedFrom || null,
  };
}

export function importAdvancedGespChoice() {
  assert(fs.existsSync(examDirectory), `GESP source directory does not exist: ${examDirectory}`);
  const examFiles = fs.readdirSync(examDirectory).filter(file => /^\d{6}-[5-8]\.json$/.test(file)).sort();
  const questions = [];
  const excluded = [];
  const ids = new Set();
  let assetCount = 0;
  fs.rmSync(assetDirectory, { recursive: true, force: true });

  for (const fileName of examFiles) {
    const raw = fs.readFileSync(path.join(examDirectory, fileName), 'utf8');
    const exam = JSON.parse(raw);
    assert(exam.level >= 5 && exam.level <= 8, `${fileName}: level is outside 5-8`);
    for (const question of exam.questions.filter(item => item.type === 'choice')) {
      const hasCompleteOptions = question.options?.length === 4
        && question.options.every(option => String(option.text || option.imageText || '').trim());
      if (!hasCompleteOptions) {
        excluded.push({
          sourceId: question.id,
          reason: 'source_options_incomplete',
        });
        continue;
      }
      const imported = importQuestion(exam, question);
      assert(!ids.has(imported.id), `duplicate question id: ${imported.id}`);
      ids.add(imported.id);
      if (imported.image) assetCount += 1;
      questions.push(imported);
    }
  }

  questions.sort((left, right) => left.id.localeCompare(right.id));
  const sourceDigest = sha256(JSON.stringify(questions));
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceProject: 'gesp-learning-h5',
    sourceLevels: [5, 6, 7, 8],
    sourceDigest,
    review: {
      approved: true,
      reviewer: 'project-owner-confirmed-review',
      reviewedAt: '2026-09-09',
      basis: 'The project owner confirmed that these questions and explanations were previously reviewed; the source project data validation also passes.',
    },
    questionCount: questions.length,
    assetCount,
    excluded,
    questions,
  };
  writeJsonAtomic(outputPath, output);
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const output = importAdvancedGespChoice();
    console.log(`Imported ${output.questionCount} GESP 5-8 choice questions with ${output.assetCount} local assets.`);
    if (output.excluded.length > 0) console.log(`Quarantined ${output.excluded.length} structurally incomplete source questions.`);
    console.log(`Source digest: ${output.sourceDigest}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
