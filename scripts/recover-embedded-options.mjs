import { readFileSync, writeFileSync } from 'node:fs';

const sourcePath = 'reports/luogu-import/gesp-extracted.json';
const bankPaths = [
  'public/course-data/unified-quiz-bank.json',
  '../csp-pet-gitee/public/course-data/unified-quiz-bank.json',
];

const sourceQuestions = JSON.parse(readFileSync(sourcePath, 'utf8'));
const targetIds = [
  'gesp-2025-09-1-11', 'gesp-2025-09-2-13', 'gesp-2025-09-4-10', 'gesp-2025-09-4-13',
  'gesp-2025-12-1-12', 'gesp-2025-12-2-06', 'gesp-2025-12-2-14', 'gesp-2025-12-4-12',
  'gesp-2026-03-1-05', 'gesp-2026-03-1-11', 'gesp-2026-03-1-15', 'gesp-2026-03-2-09',
  'gesp-2026-03-2-12', 'gesp-2026-03-2-13', 'gesp-2026-03-2-14', 'gesp-2026-03-4-13',
];

function normalizeStem(value) {
  return String(value || '')
    .replace(/\n\s*A\.([\s\S]*)$/, '')
    .replace(/\s+/g, '')
    .replace(/[（）()。,.，：:`$]/g, '');
}

function extractOptions(question) {
  const markers = [...String(question || '').matchAll(/^([A-D])\.\s*$/gm)];
  if (markers.length !== 4 || markers.map(match => match[1]).join('') !== 'ABCD') return [];
  return markers.map((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].index : question.length;
    const rawContent = question.slice(marker.index + marker[0].length, end);
    const fenced = /^[\s]*```(?:cpp|plain|c\+\+)?\r?\n/.test(rawContent);
    const withoutFence = rawContent
      .replace(/^[\s]*```(?:cpp|plain|c\+\+)?\r?\n/, '')
      .replace(/\r?\n```[\s]*$/, '');
    let content = fenced
      ? withoutFence.replace(/^\r?\n+|\r?\n+$/g, '')
      : withoutFence.trim();
    if (fenced) {
      const lines = content.split(/\r?\n/);
      const indents = lines.filter(line => line.trim()).map(line => line.match(/^ */)[0].length);
      const commonIndent = indents.length ? Math.min(...indents) : 0;
      if (commonIndent) content = lines.map(line => line.slice(commonIndent)).join('\n');
    }
    return `${marker[1]}. ${content}`;
  });
}

function stripEmptyOptionLabels(question) {
  return String(question || '').replace(/\n\s*A\.\s*\n\s*B\.\s*\n\s*C\.\s*\n\s*D\.\s*$/, '').trim();
}

const primaryBank = JSON.parse(readFileSync(bankPaths[0], 'utf8'));
const targets = targetIds.map(id => primaryBank[id]);

const recovered = new Map();
for (const question of targets) {
  const stem = normalizeStem(question.question);
  const source = sourceQuestions.find(candidate => {
    const candidateStem = normalizeStem(candidate.question);
    const prefixLength = Math.min(30, stem.length);
    return candidateStem.includes(stem.slice(0, prefixLength)) || stem.includes(candidateStem.slice(0, prefixLength));
  });
  if (!source) throw new Error(`No source question found for ${question.id}`);
  const options = extractOptions(source.question);
  if (options.length !== 4 || options.some(option => !option.slice(3).trim())) {
    throw new Error(`Could not recover four options for ${question.id}`);
  }
  recovered.set(question.id, {
    question: stripEmptyOptionLabels(question.question),
    options,
  });
}

if (recovered.size !== 16) throw new Error(`Expected 16 recoveries, got ${recovered.size}`);

for (const bankPath of bankPaths) {
  const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
  for (const [id, patch] of recovered) {
    // Some mirrors intentionally carry a smaller bank. Do not introduce partial records.
    if (!bank[id]?.id) {
      delete bank[id];
      continue;
    }
    bank[id] = { ...bank[id], ...patch };
  }
  writeFileSync(bankPath, `${JSON.stringify(bank, null, 2)}\n`);
}

console.log(JSON.stringify(Object.fromEntries(recovered), null, 2));
