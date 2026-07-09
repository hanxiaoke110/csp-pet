import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
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

function hasCode(q) {
  return typeof q.code === 'string' && q.code.trim().length > 0;
}

function firstFence(question) {
  const s = String(question || '');
  const match = s.match(/```(?:cpp|c\+\+|c|cc|)\s*\n([\s\S]*?)```/i) || s.match(/```\s*([\s\S]*?)```/);
  if (!match) return null;
  const code = match[1].trim();
  if (!code || code.length < 8) return null;
  return { code, question: s.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim() };
}

function asksAboutPreviousCode(question) {
  const s = String(question || '');
  return /上述代码|上述程序|上面代码|上面程序|该代码|该程序|以下关于上述|关于上述代码|关于上述程序/.test(s);
}

function codeLooksSubstantial(code) {
  const s = String(code || '');
  if (s.length < 20) return false;
  return /#include|int\s+main|using\s+namespace|cout|cin|printf|scanf|for\s*\(|while\s*\(|if\s*\(|return/.test(s);
}

function normalizeFile(file) {
  const abs = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const entries = entriesFor(data);
  let extracted = 0;
  let idsAdded = 0;

  for (const [key, q] of entries) {
    if (!q || typeof q !== 'object') continue;
    if (!q.id && !Array.isArray(data) && !Array.isArray(data.questions) && !Array.isArray(data.items)) {
      q.id = key;
      idsAdded += 1;
    }

    if (!hasCode(q)) {
      const fence = firstFence(q.question);
      if (fence) {
        q.code = fence.code;
        q.question = fence.question || '阅读以下程序，回答问题。';
        extracted += 1;
      }
    }

    // Do not infer "previous code" from object order. The flat quiz banks are not
    // guaranteed to preserve source grouping, so inheriting context can attach
    // unrelated code. Those cases remain in the audit report for source repair.
  }

  if (extracted || idsAdded) {
    fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n');
  }
  return { file, extracted, inherited: 0, idsAdded };
}

const results = files.map(normalizeFile);
let total = { extracted: 0, inherited: 0, idsAdded: 0 };
for (const result of results) {
  total.extracted += result.extracted;
  total.inherited += result.inherited;
  total.idsAdded += result.idsAdded;
  console.log(`${result.file}: extracted=${result.extracted}, inherited=${result.inherited}, idsAdded=${result.idsAdded}`);
}
console.log(`total: extracted=${total.extracted}, inherited=${total.inherited}, idsAdded=${total.idsAdded}`);
