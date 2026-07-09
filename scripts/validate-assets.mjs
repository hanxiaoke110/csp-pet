import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const questionFiles = [
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

const suspiciousText = /TODO|待补|undefined|\[object Object\]|等等，需要|让我重新|重读代码|实际确实|\.{3}$|…$/;
const codeRequired = [
  '下列代码', '以下程序', '如下代码', '下面代码', '程序输出', '代码执行',
  '代码运行', '这段代码', '该程序', 'C++代码', 'C++程序', '代码段', '横线',
];
const inlineCodeMarkers = [
  '#include', 'int main', 'for (', 'for(', 'while (', 'while(', 'cout',
  'printf', 'scanf', 'cin', 'return 0', 'struct ', 'vector<', 'std::', ';\n',
];

function asQuestions(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.questions)) return data.questions;
  if (Array.isArray(data.items)) return data.items;
  if (data && typeof data === 'object') return Object.values(data).filter(item => item && typeof item === 'object');
  return [];
}

function hasCodeInQuestion(question) {
  return inlineCodeMarkers.some(marker => String(question || '').includes(marker));
}

function requireCode(question) {
  const stem = String(question || '').normalize('NFKC').replace(/\s+/g, '');
  if (/流程图/.test(stem)) return false;
  const sourceRef = /(下列|以下|下面|如下).{0,12}(代码|程序)|阅读.{0,12}(代码|程序)|代码段/.test(stem);
  const codeHoleRef = /(代码|程序).{0,12}(横线|空白|填入|补全|划线)|横线处|空白处|补全|划线/.test(stem);
  const outputRef = /(输出|运行|执行).{0,12}(结果|是|为)|不能输出/.test(stem);
  const inlineOnly = !sourceRef && !codeHoleRef && /([a-zA-Z_]\w*|\d+)\s*(<<|>>|[+\-*/%]?=|[+\-*/%])/.test(stem);
  if (inlineOnly) return false;
  if (/DevC\+\+|集成开发环境|调试代码段/.test(stem) && !sourceRef && !codeHoleRef) return false;
  if (/程序设计|程序结构/.test(stem) && !sourceRef && !codeHoleRef) return false;
  return codeHoleRef || (sourceRef && outputRef);
}

function validateOptionSet(owner, options, answer, failures) {
  if (options && !Array.isArray(options) && typeof options === 'object') {
    options = Object.keys(options).sort().map(key => options[key]);
  }
  if (typeof answer === 'string' && /^[A-Z]$/.test(answer)) {
    answer = answer.charCodeAt(0) - 65;
  }
  if (!Array.isArray(options) || options.length < 2) {
    failures.push(`${owner}: options missing`);
    return;
  }
  options.forEach((opt, index) => {
    if (!String(opt || '').trim()) failures.push(`${owner}: option ${index + 1} empty`);
  });
  if (typeof answer !== 'number' || answer < 0 || answer >= options.length) {
    failures.push(`${owner}: answer index invalid`);
  }
}

function validateQuestionFile(file) {
  const abs = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const questions = asQuestions(data);
  const failures = [];

  questions.forEach((q, index) => {
    const id = q.id || `${file}#${index + 1}`;
    if (!String(q.question || '').trim()) failures.push(`${id}: question empty`);
    if (suspiciousText.test(JSON.stringify(q))) failures.push(`${id}: suspicious draft text`);

    if (q.image) {
      const imagePath = String(q.image).replace(/^\/+/, '');
      const candidates = [
        path.join(root, imagePath),
        path.join(root, 'public', imagePath),
        path.join(path.dirname(abs), imagePath),
      ];
      if (!/^https?:\/\//.test(String(q.image)) && !candidates.some(fs.existsSync)) {
        failures.push(`${id}: image missing (${q.image})`);
      }
    }

    if (q.type === 'choice') {
      validateOptionSet(id, q.options, q.correctIndex ?? q.answer, failures);
      if (!String(q.explanation || '').trim()) failures.push(`${id}: explanation empty`);
      if (!q.code && !q.image && !q.codeImage && requireCode(q.question) && !hasCodeInQuestion(q.question)) {
        failures.push(`${id}: referenced code is missing`);
      }
    } else if (q.type === 'reading') {
      if (!String(q.code || '').trim()) failures.push(`${id}: reading code missing`);
      const subQuestions = q.subQuestions || q.sub_questions;
      const hasQuestionCount = typeof subQuestions === 'number' && subQuestions > 0;
      if (!Array.isArray(subQuestions) && !hasQuestionCount) {
        failures.push(`${id}: subQuestions missing`);
      } else if (hasQuestionCount && (!Array.isArray(q.answers) || q.answers.length !== subQuestions)) {
        failures.push(`${id}: answers count mismatch subQuestions=${subQuestions} answers=${q.answers?.length || 0}`);
      }
      if (Array.isArray(subQuestions)) subQuestions.forEach((sub, subIndex) => {
        const owner = `${id}.sub${subIndex + 1}`;
        if (!String(sub.label || sub.question || '').trim()) failures.push(`${owner}: label empty`);
        validateOptionSet(owner, sub.options, sub.correctIndex ?? sub.answer, failures);
        if (!String(sub.explanation || '').trim()) failures.push(`${owner}: explanation empty`);
      });
    } else if (q.type === 'fillBlank') {
      const code = String(q.code || '');
      if (!code.trim()) failures.push(`${id}: fillBlank code missing`);
      const blanks = q.blanks || q.sub_questions;
      if (!Array.isArray(blanks) || blanks.length === 0) {
        failures.push(`${id}: blanks missing`);
      }
      const markerCount = (code.match(/__\d+__/g) || []).length;
      if (code && markerCount !== (blanks?.length || 0)) {
        failures.push(`${id}: blank count mismatch code=${markerCount} blanks=${blanks?.length || 0}`);
      }
      if (Array.isArray(blanks)) blanks.forEach((blank, blankIndex) => {
        const owner = `${id}.blank${blankIndex + 1}`;
        validateOptionSet(owner, blank.options, blank.correctIndex ?? blank.answer, failures);
        if (!String(blank.explanation || '').trim()) failures.push(`${owner}: explanation empty`);
      });
    }
  });

  return { file, count: questions.length, failures };
}

function extractRegisteredPets() {
  const typeFile = path.join(root, 'src/types/pet.ts');
  const text = fs.readFileSync(typeFile, 'utf8');
  return [...text.matchAll(/speciesId: '([^']+)'.*?modelPath: '([^']+)'/gs)]
    .map(match => ({ id: match[1], modelPath: match[2] }))
    .filter(pet => pet.modelPath.includes('/pet-sprites/2d/'));
}

function validatePetAssets() {
  const failures = [];
  const remoteCovered = [];
  const remoteNames = new Set(
    fs.existsSync(path.join(root, '../csp-pet-gitee/public/pet-sprites/2d'))
      ? fs.readdirSync(path.join(root, '../csp-pet-gitee/public/pet-sprites/2d'))
      : [],
  );
  const registered = extractRegisteredPets();
  const typeText = fs.readFileSync(path.join(root, 'src/types/pet.ts'), 'utf8');
  const remoteIds = new Set([...typeText.matchAll(/'([^']+)': '(?:rare|legendary)'/g)].map(match => match[1]));
  registered.forEach(pet => {
    const baseName = path.basename(pet.modelPath, '.json');
    for (const ext of ['json', 'png']) {
      const local = path.join(root, 'public/pet-sprites/2d', `${baseName}.${ext}`);
      const coveredByMirror = remoteNames.has(`${baseName}.${ext}`);
      const coveredByRuntimeDownload = remoteIds.has(pet.id);
      if (!fs.existsSync(local) && (coveredByMirror || coveredByRuntimeDownload)) {
        remoteCovered.push(`${pet.id}.${ext}`);
      } else if (!fs.existsSync(local)) {
        failures.push(`${pet.id}: missing sprite ${baseName}.${ext}`);
      }
    }
    const preview = path.join(root, 'public/pet-sprites/previews', `${pet.id}.png`);
    if (!fs.existsSync(preview)) failures.push(`${pet.id}: missing preview`);
  });
  return { registered: registered.length, remoteCovered: remoteCovered.length, failures };
}

const questionResults = questionFiles.map(validateQuestionFile);
const petResult = validatePetAssets();
let failed = false;

for (const result of questionResults) {
  console.log(`${result.file}: ${result.count} questions, ${result.failures.length} issue(s)`);
  if (result.failures.length) {
    failed = true;
    result.failures.slice(0, 80).forEach(item => console.log(`  - ${item}`));
    if (result.failures.length > 80) console.log(`  ... ${result.failures.length - 80} more`);
  }
}

console.log(`pet assets: ${petResult.registered} registered, ${petResult.remoteCovered} remote/runtime-covered, ${petResult.failures.length} issue(s)`);
if (petResult.failures.length) {
  failed = true;
  petResult.failures.slice(0, 120).forEach(item => console.log(`  - ${item}`));
  if (petResult.failures.length > 120) console.log(`  ... ${petResult.failures.length - 120} more`);
}

if (failed) process.exit(1);
