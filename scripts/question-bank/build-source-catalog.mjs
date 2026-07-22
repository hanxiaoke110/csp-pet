import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalPath = path.join(root, 'public/course-data/question-bank-v2/canonical.json');
const pdfDirectory = path.join(root, 'reports/gesp-sources/pdfs');
const outputPath = path.join(root, 'public/course-data/question-bank-v2/source-catalog.json');

export function buildSourceCatalog() {
  const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  const urls = new Map();
  for (const question of canonical.questions) {
    if (question.source !== 'gesp' || !question.exam.date || !question.exam.level || !question.provenance.url) continue;
    urls.set(`${question.exam.date}-${question.exam.level}`, question.provenance.url);
  }
  const entries = fs.readdirSync(pdfDirectory)
    .filter(fileName => /^\d{4}-\d{2}-\d+\.pdf$/.test(fileName))
    .map(fileName => {
      const key = fileName.replace(/\.pdf$/, '');
      const filePath = path.join(pdfDirectory, fileName);
      const url = urls.get(key);
      if (!url) return null;
      return {
        key,
        source: 'gesp',
        url,
        localPath: path.relative(root, filePath),
        sha256: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.key.localeCompare(right.key));
  const catalog = { schemaVersion: 1, generatedAt: new Date().toISOString(), entryCount: entries.length, entries };
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const catalog = buildSourceCatalog();
  console.log(`Built ${catalog.entryCount} official source catalog entries.`);
}
