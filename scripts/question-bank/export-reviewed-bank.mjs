import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function validateReviewedExport({ data, version }) {
  if (!version || !Number.isInteger(version.revision)) {
    throw new Error('reviewed bank export is missing a numeric revision');
  }
  if (!Number.isInteger(version.baseVersion)) {
    throw new Error('reviewed bank export is missing a numeric baseVersion');
  }
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).length === 0) {
    throw new Error('reviewed bank export has no question data');
  }
  return true;
}

function writeJsonAtomic(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, outputPath);
}

export async function exportReviewedBank({
  apiBase = process.env.QUESTION_BANK_API_BASE || 'https://api.cspstudy.top',
  outputPath = path.join(root, '.tmp/reviewed-question-bank.json'),
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const request = route => fetchImpl(`${apiBase}${route}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  }).then(async response => {
    if (!response.ok) throw new Error(`${route} failed: HTTP ${response.status}`);
    return response.json();
  });

  const [data, version] = await Promise.all([
    request('/api/question-bank/data'),
    request('/api/question-bank/version'),
  ]);
  validateReviewedExport({ data, version });

  const result = {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    baseVersion: version.baseVersion,
    revision: version.revision,
    questionCount: Object.keys(data).length,
    questions: data,
  };
  writeJsonAtomic(outputPath, result);
  return result;
}

async function main() {
  const inputArg = process.argv.find(value => value.startsWith('--input='));
  const outputArg = process.argv.find(value => value.startsWith('--output='));
  const outputPath = outputArg ? path.resolve(outputArg.slice('--output='.length)) : undefined;

  if (inputArg) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(inputArg.slice('--input='.length)), 'utf8'));
    validateReviewedExport(fixture);
    const result = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      baseVersion: fixture.version.baseVersion,
      revision: fixture.version.revision,
      questionCount: Object.keys(fixture.data).length,
      questions: fixture.data,
    };
    writeJsonAtomic(outputPath || path.join(root, '.tmp/reviewed-question-bank.json'), result);
    console.log(`Exported ${result.questionCount} reviewed questions at revision ${result.revision}.`);
    return;
  }

  const result = await exportReviewedBank({ outputPath });
  console.log(`Exported ${result.questionCount} reviewed questions at revision ${result.revision}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
