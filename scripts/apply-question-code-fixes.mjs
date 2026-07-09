import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fixesFile = process.argv[2] || 'reports/question-code-fixes.json';
const targetFiles = [
  'public/course-data/csp-exam-bank.json',
  'src-dungeon/data/csp-exam-bank.json',
  'dist/course-data/csp-exam-bank.json',
  'dist-dungeon/course-data/csp-exam-bank.json',
  'public/course-data/unified-quiz-bank.json',
  'dist/course-data/unified-quiz-bank.json',
  'dist-dungeon/course-data/unified-quiz-bank.json',
  'public/course-data/quiz-bank.json',
  'dist/course-data/quiz-bank.json',
  'dist-dungeon/course-data/quiz-bank.json',
].filter(file => fs.existsSync(path.join(root, file)));

function entriesFor(data) {
  if (Array.isArray(data)) return data.map((item, index) => [String(index), item]);
  if (Array.isArray(data.questions)) return data.questions.map((item, index) => [String(index), item]);
  if (Array.isArray(data.items)) return data.items.map((item, index) => [String(index), item]);
  if (data && typeof data === 'object') return Object.entries(data);
  return [];
}

function questionId(key, question) {
  return question?.id || question?.questionId || question?.uid || key;
}

const fixesPath = path.join(root, fixesFile);
if (!fs.existsSync(fixesPath)) {
  console.error(`fix file not found: ${fixesFile}`);
  process.exit(1);
}

const fixes = JSON.parse(fs.readFileSync(fixesPath, 'utf8'))
  .filter(item => item && item.id && String(item.code || '').trim());
const codeById = new Map(fixes.map(item => [item.id, String(item.code).trim()]));

let totalApplied = 0;
for (const file of targetFiles) {
  const abs = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let applied = 0;
  for (const [key, question] of entriesFor(data)) {
    if (!question || typeof question !== 'object') continue;
    const id = questionId(key, question);
    const code = codeById.get(id);
    if (!code) continue;
    question.code = code;
    if (!question.id) question.id = id;
    applied += 1;
  }
  if (applied) fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n');
  totalApplied += applied;
  console.log(`${file}: applied=${applied}`);
}

console.log(`fixes with code: ${fixes.length}`);
console.log(`total applied: ${totalApplied}`);
