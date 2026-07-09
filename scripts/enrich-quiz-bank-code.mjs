import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lessonsFile = path.join(root, 'public/course-data/lessons.json');
const quizFiles = [
  'public/course-data/quiz-bank.json',
  'dist/course-data/quiz-bank.json',
  'dist-dungeon/course-data/quiz-bank.json',
].filter(file => fs.existsSync(path.join(root, file)));

function collectLessonCode() {
  const lessons = JSON.parse(fs.readFileSync(lessonsFile, 'utf8'));
  const byId = new Map();
  for (const stage of lessons.stages || []) {
    for (const lesson of stage.lessons || []) {
      for (const section of ['homework', 'inClassCodes', 'extended']) {
        for (const problem of lesson[section] || []) {
          const code = String(problem.answerCode || problem.code || '').trim();
          if (problem.id && code) byId.set(problem.id, code);
        }
      }
    }
  }
  return byId;
}

function enrichFile(file, codeById) {
  const abs = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let filled = 0;
  let alreadyHadCode = 0;
  let missingSource = 0;

  for (const [id, question] of Object.entries(data)) {
    if (!question || typeof question !== 'object') continue;
    const currentCode = String(question.code || '').trim();
    const sourceCode = codeById.get(id);
    const currentLooksIncomplete = /TODO|待补|省略/.test(currentCode) || /^[.…\s]+$/.test(currentCode);
    if (currentCode && !currentLooksIncomplete) {
      alreadyHadCode += 1;
      continue;
    }
    if (!sourceCode) {
      missingSource += 1;
      continue;
    }
    question.code = sourceCode;
    if (!question.id) question.id = id;
    filled += 1;
  }

  if (filled) fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n');
  return { file, filled, alreadyHadCode, missingSource };
}

const codeById = collectLessonCode();
const results = quizFiles.map(file => enrichFile(file, codeById));

let totalFilled = 0;
for (const result of results) {
  totalFilled += result.filled;
  console.log(`${result.file}: filled=${result.filled}, alreadyHadCode=${result.alreadyHadCode}, missingSource=${result.missingSource}`);
}
console.log(`lesson code sources: ${codeById.size}`);
console.log(`total filled: ${totalFilled}`);
