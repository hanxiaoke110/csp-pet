import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const python = '/Users/hanliuliu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const templateFile = path.join(root, 'reports/question-code-fixes.template.json');
const selectedPdfsFile = path.join(root, 'reports/gesp-sources/selected-pdfs.json');

const fixes = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
const sources = JSON.parse(fs.readFileSync(selectedPdfsFile, 'utf8'));
const sourceByKey = new Map(sources.map(item => [item.key, item]));

function keyForId(id) {
  const match = id.match(/^gesp-(\d{4})-(\d{2})-(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    sourceKey: `${match[1]}-${match[2]}-${match[3]}`,
    questionNo: Number(match[4]),
  };
}

function cleanLine(line) {
  let s = line
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/；/g, ';')
    .replace(/，/g, ',')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[＠@Q]/g, '0')
    .replace(/\s+$/g, '');

  s = s.replace(/^\s*(?:\d{1,2}|[A-Z]|[a-z]|[>)}\]])[\.、]?\s+/, '');
  s = s.replace(/\s+$/g, '');
  if (!s) return '';

  if (/\/\/|在此处|填入|FE|FERC|ARIS|TELC/.test(s)) {
    if (/if\s*\(/.test(s)) return 'if (____)  // 在此处填入代码';
    if (/while\s*\(/.test(s)) return 'while (____)  // 在此处填入代码';
    if (/for\s*\(/.test(s)) return s.replace(/\/\/.*$/, '// 在此处填入代码');
    return '____;  // 在此处填入代码';
  }

  s = s
    .replace(/\bt=/g, '+=')
    .replace(/\bt =/g, '+=')
    .replace(/\bO\b/g, '0')
    .replace(/= =/g, '==')
    .replace(/< =/g, '<=')
    .replace(/> =/g, '>=')
    .replace(/! =/g, '!=')
    .replace(/«/g, '<<')
    .replace(/》/g, '>>')
    .replace(/\s+x\s*<\s*/g, ' << ')
    .replace(/\s+xb\s+/g, ' << ')
    .replace(/\bend1\b/g, 'endl')
    .replace(/\bendi\b/g, 'endl')
    .replace(/\bstd:\b/g, 'std;');

  if (/[A-Za-z0-9_\])'"]3$/.test(s)) s = s.slice(0, -1) + ';';
  if (/return 0[.;]?$/.test(s)) s = 'return 0;';
  return s.trimEnd();
}

function cleanOcrCode(ocr) {
  const lines = ocr.split(/\r?\n/)
    .map(cleanLine)
    .filter(line => line && !/^[|:;._\-\s]+$/.test(line));

  const codeLines = [];
  for (const line of lines) {
    if (/^(A|B|C|D)[\.\s]/.test(line)) break;
    if (/答案|考纲|解析/.test(line)) break;
    if (/#include|using namespace|main\s*\(|int |long |double |char |bool |string |for\s*\(|while\s*\(|if\s*\(|else|cout|cin|printf|scanf|return|^\{|^\}|____|;|std::|vector|const /.test(line)) {
      codeLines.push(line);
    }
  }
  return codeLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const results = [];
const skipped = [];

for (const item of fixes) {
  const parsed = keyForId(item.id);
  if (!parsed) continue;
  const source = sourceByKey.get(parsed.sourceKey);
  if (!source) {
    skipped.push({ id: item.id, reason: `source missing for ${parsed.sourceKey}` });
    continue;
  }
  const py = spawnSync(python, ['scripts/extract_gesp_code_region.py', parsed.sourceKey, String(parsed.questionNo)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (py.status !== 0) {
    skipped.push({ id: item.id, reason: py.stderr || py.stdout });
    continue;
  }
  const extracted = JSON.parse(py.stdout);
  const code = cleanOcrCode(extracted.ocrMixed || extracted.ocr || '');
  results.push({
    id: item.id,
    question: item.question,
    code,
    source: source.url,
    sourceTitle: source.text,
    page: extracted.page,
    crop: extracted.crop,
    confidence: code.includes('#include') || code.includes('int main') || code.includes('____') ? 'candidate' : 'low',
    rawOcr: extracted.ocr,
    rawOcrMixed: extracted.ocrMixed,
  });
}

const outDir = path.join(root, 'reports/gesp-sources');
fs.writeFileSync(path.join(outDir, 'extracted-code-candidates.json'), JSON.stringify({ results, skipped }, null, 2));
fs.writeFileSync(path.join(outDir, 'extracted-code-fixes.json'), JSON.stringify(results.map(({ id, question, code, source, sourceTitle, page, crop }) => ({
  id, question, code, source, sourceTitle, page, crop,
})), null, 2));

console.log(`candidates: ${results.length}`);
console.log(`skipped: ${skipped.length}`);
console.log(`with code: ${results.filter(item => item.code).length}`);
console.log(`low: ${results.filter(item => item.confidence === 'low' || !item.code).length}`);
