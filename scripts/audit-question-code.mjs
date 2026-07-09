import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const DEFAULT_FILES = [
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

const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;

const codeMarkers = [
  '#include', 'int main', 'using namespace', 'cout', 'cin', 'scanf', 'printf',
  'return 0', 'for(', 'for (', 'while(', 'while (', 'if(', 'if (', 'switch',
  'struct ', 'class ', 'vector<', 'string ', 'void ', 'bool ', 'double ',
  'char ', 'int ', 'long ', 'short ', 'std::', '->', '++', '--', '&&', '||',
  ';', '{', '}',
];

const weakCodeOptionMarkers = [
  /[a-zA-Z_]\w*\s*\([^)]*\)/,
  /[a-zA-Z_]\w*\s*=\s*[^，。；]+/,
  /[+\-*/%]=?/,
  /==|!=|<=|>=|&&|\|\|/,
  /cout|cin|printf|scanf|return|break|continue/,
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function asQuestions(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.questions)) return data.questions;
  if (Array.isArray(data.items)) return data.items;
  if (data && typeof data === 'object') return Object.values(data).filter(item => item && typeof item === 'object');
  return [];
}

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function hasCodeBlock(value) {
  const s = text(value);
  if (/```[\s\S]*?```/.test(s)) return true;
  let score = 0;
  for (const marker of codeMarkers) {
    if (s.includes(marker)) score += marker === ';' || marker === '{' || marker === '}' ? 0.5 : 1;
  }
  return score >= 2;
}

function stemNeedsCode(stem) {
  const s = text(stem).normalize('NFKC').replace(/\s+/g, '');

  if (/流程图/.test(s)) return false;

  const sourceRef = /(下列|以下|下面|如下).{0,12}(代码|程序)|阅读.{0,12}(代码|程序)|代码段/.test(s);
  const codeHoleRef = /(代码|程序).{0,12}(横线|空白|填入|补全|划线)|横线处|空白处|补全|划线/.test(s);
  const outputRef = /(输出|运行|执行).{0,12}(结果|是|为)|不能输出/.test(s);
  const inlineOnly = !sourceRef && !codeHoleRef && /([a-zA-Z_]\w*|\d+)\s*(<<|>>|[+\-*/%]?=|[+\-*/%])/.test(s);

  if (inlineOnly) return false;

  if (/DevC\+\+|集成开发环境|调试代码段/.test(s) && !sourceRef && !codeHoleRef) {
    return false;
  }

  if (/程序设计|程序结构/.test(s) && !sourceRef && !codeHoleRef) {
    return false;
  }

  return codeHoleRef || (sourceRef && outputRef);
}

function optionsLookLikeCode(options) {
  if (!Array.isArray(options)) return false;
  let codeLike = 0;
  for (const option of options) {
    const s = text(option);
    if (hasCodeBlock(s) || weakCodeOptionMarkers.some(pattern => pattern.test(s))) codeLike += 1;
  }
  return codeLike >= Math.min(2, options.length);
}

function getOptions(q) {
  if (Array.isArray(q.options)) return q.options;
  if (q.options && typeof q.options === 'object') return Object.values(q.options);
  return [];
}

function auditQuestion(q, index, file) {
  const id = q.id || q.questionId || q.uid || `${file}#${index + 1}`;
  const qType = q.type || q.questionType || '';
  const stem = q.question || q.title || q.stem || q.content || '';
  const code = text(q.code || q.program || q.sourceCode || q.codeBlock).trim();
  const hasContextImage = Boolean(q.image || q.codeImage);
  const explanation = q.explanation || q.analysis || q['解析'] || '';
  const options = getOptions(q);
  const issues = [];

  if ((qType === 'reading' || qType === 'fillBlank') && !code && !hasCodeBlock(stem) && !hasContextImage) {
    issues.push({
      severity: 'P0',
      reason: `${qType} question has no code field and no inline code`,
    });
  }

  if (!code && stemNeedsCode(stem) && !hasCodeBlock(stem) && !hasContextImage) {
    issues.push({
      severity: 'P1',
      reason: 'stem explicitly references code/program/output/blank but no code is available',
    });
  }

  if (!code && !hasCodeBlock(stem) && !hasContextImage && optionsLookLikeCode(options) && /填入|横线|空白|正确|错误|语句|表达式/.test(text(stem))) {
    issues.push({
      severity: 'P2',
      reason: 'options look like code but stem has no independent code block',
    });
  }

  if (code && (/TODO|待补|省略/.test(code) || /^[.…\s]+$/.test(code))) {
    issues.push({
      severity: 'P1',
      reason: 'code field contains placeholder-like text',
    });
  }

  if (!issues.length) return [];

  const bestSeverity = issues.map(i => i.severity).sort()[0];
  return [{
    file,
    id,
    type: qType || 'unknown',
    group: q.group || q.category || '',
    severity: bestSeverity,
    reasons: issues.map(i => i.reason),
    question: text(stem).replace(/\s+/g, ' ').slice(0, 180),
    options: options.map(option => text(option).replace(/\s+/g, ' ').slice(0, 80)).slice(0, 4),
    explanation: text(explanation).replace(/\s+/g, ' ').slice(0, 120),
  }];
}

const findings = [];
const summaries = [];

for (const file of files) {
  const questions = asQuestions(readJson(file));
  const fileFindings = questions.flatMap((q, index) => auditQuestion(q, index, file));
  findings.push(...fileFindings);
  const bySeverity = fileFindings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});
  summaries.push({ file, questions: questions.length, findings: fileFindings.length, bySeverity });
}

const outDir = path.join(root, 'reports');
fs.mkdirSync(outDir, { recursive: true });
const reportFile = path.join(outDir, 'question-code-audit.json');
fs.writeFileSync(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), summaries, findings }, null, 2));

const markdownFile = path.join(outDir, 'question-code-audit.md');
const uniqueP1 = new Map();
for (const item of findings.filter(finding => finding.severity === 'P1')) {
  if (!uniqueP1.has(item.id)) uniqueP1.set(item.id, item);
}
const fixTemplateFile = path.join(outDir, 'question-code-fixes.template.json');
fs.writeFileSync(fixTemplateFile, JSON.stringify([...uniqueP1.values()].map(item => ({
  id: item.id,
  file: item.file,
  question: item.question,
  code: '',
  note: item.reasons.join('; '),
})), null, 2) + '\n');
const groupedP1 = [...uniqueP1.values()].reduce((acc, item) => {
  const group = item.id.startsWith('gesp-') ? 'GESP' : item.id.startsWith('codemao-') ? 'CodeMao' : 'Other';
  if (!acc[group]) acc[group] = [];
  acc[group].push(item);
  return acc;
}, {});
const markdown = [
  '# Question Code Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Summary',
  '',
  '| File | Questions | P0 | P1 | P2 |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...summaries.map(summary => `| ${summary.file} | ${summary.questions} | ${summary.bySeverity.P0 || 0} | ${summary.bySeverity.P1 || 0} | ${summary.bySeverity.P2 || 0} |`),
  '',
  `Unique P1 missing-code candidates: ${uniqueP1.size}`,
  '',
  '## P1 Missing-Code Candidates',
  '',
  ...Object.entries(groupedP1).flatMap(([group, items]) => [
    `### ${group} (${items.length})`,
    '',
    ...items.map(item => `- ${item.id} (${item.file}): ${item.question}`),
    '',
  ]),
  '## P2 Review Candidates',
  '',
  'P2 means code-like options are present but no independent code block is required yet. These are review-only unless the UI renders option code poorly.',
  '',
].join('\n');
fs.writeFileSync(markdownFile, markdown);

for (const summary of summaries) {
  const p0 = summary.bySeverity.P0 || 0;
  const p1 = summary.bySeverity.P1 || 0;
  const p2 = summary.bySeverity.P2 || 0;
  console.log(`${summary.file}: ${summary.questions} questions, ${summary.findings} code issue(s) [P0=${p0}, P1=${p1}, P2=${p2}]`);
}

const total = findings.reduce((acc, item) => {
  acc[item.severity] = (acc[item.severity] || 0) + 1;
  return acc;
}, {});
console.log(`total: ${findings.length} code issue(s) [P0=${total.P0 || 0}, P1=${total.P1 || 0}, P2=${total.P2 || 0}]`);
console.log(`report: ${path.relative(root, reportFile)}`);
console.log(`markdown: ${path.relative(root, markdownFile)}`);
console.log(`fix template: ${path.relative(root, fixTemplateFile)}`);

for (const item of findings.slice(0, 30)) {
  console.log(`  - [${item.severity}] ${item.file} :: ${item.id} :: ${item.reasons[0]}`);
}
if (findings.length > 30) console.log(`  ... ${findings.length - 30} more in ${path.relative(root, reportFile)}`);

if (process.env.STRICT_QUESTION_CODE_AUDIT === '1' && findings.some(item => item.severity === 'P0' || item.severity === 'P1')) {
  process.exit(1);
}
