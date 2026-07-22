import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(root, 'reports/csp-sources');
const pageRoot = path.join(sourceRoot, 'pages');
const paddlePython = path.join(process.env.HOME, '.claude/skills/paddleocr/.venv/bin/python');
const paddleHelper = path.join(root, 'scripts/question-bank/paddle-ocr-pages.py');

const SOURCES = [
  ['2019-J', 'pdfs/2019-J.pdf', 'answers/2019-JS.pdf'],
  ['2019-S', 'pdfs/2019-S.pdf', 'answers/2019-JS.pdf'],
  ['2020-J', 'pdfs/2020-J.pdf', 'answers/2020-JS.pdf'],
  ['2020-S', 'pdfs/2020-S.pdf', 'answers/2020-JS.pdf'],
  ['2021-J', 'pdfs/2021-J.pdf', 'answers/2021-J.pdf'],
  ['2021-S', 'pdfs/2021-S.pdf', 'answers/2021-S.pdf'],
  ['2022-J', 'pdfs/2022-J.pdf', null],
  ['2022-S', 'pdfs/2022-S.pdf', 'answers/2022-S.pdf'],
  ['2023-J', 'pdfs/2023-J.pdf', 'answers/2023-J.pdf'],
  ['2023-S', 'pdfs/2023-S.pdf', null],
  ['2024-J', 'pdfs/2024-J.pdf', 'answers/2024-J.pdf'],
  ['2024-S', 'pdfs/2024-S.pdf', 'pdfs/2024-S.pdf'],
];

function sha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function parsePdfInfo(value) {
  const pageMatch = String(value).match(/^Pages:\s+(\d+)$/m);
  const sizeMatch = String(value).match(/^File size:\s+(\d+) bytes$/m);
  return {
    pages: pageMatch ? Number(pageMatch[1]) : 0,
    bytes: sizeMatch ? Number(sizeMatch[1]) : 0,
  };
}

function renderPage(pdfPath, pageNumber, outputPrefix) {
  execFileSync('pdftoppm', [
    '-f', String(pageNumber),
    '-l', String(pageNumber),
    '-singlefile',
    '-png',
    '-r', '180',
    pdfPath,
    outputPrefix,
  ], { stdio: 'ignore' });
}

function runPaddleOcr(imagePaths) {
  if (imagePaths.length === 0) return;
  if (!fs.existsSync(paddlePython)) throw new Error(`Missing local PaddleOCR runtime: ${paddlePython}`);
  execFileSync(paddlePython, ['-W', 'ignore', paddleHelper, ...imagePaths], {
    env: { ...process.env, PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True' },
    stdio: 'inherit',
  });
}

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

export function indexCspSources({ force = process.argv.includes('--force') } = {}) {
  fs.mkdirSync(pageRoot, { recursive: true });
  const metadata = [];
  const pendingPaddleImages = [];
  const entries = [];

  for (const [key, relativePdf, relativeAnswer] of SOURCES) {
    const pdfPath = path.join(sourceRoot, relativePdf);
    if (!fs.existsSync(pdfPath)) throw new Error(`Missing CSP source: ${relativePdf}`);
    const info = parsePdfInfo(execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' }));
    if (info.pages === 0) throw new Error(`Unable to read page count: ${relativePdf}`);
    const outputDirectory = path.join(pageRoot, key);
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (let pageNumber = 1; pageNumber <= info.pages; pageNumber += 1) {
      const basename = `p${String(pageNumber).padStart(2, '0')}`;
      const imagePath = path.join(outputDirectory, `${basename}.png`);
      const textPath = path.join(outputDirectory, `${basename}.txt`);
      const paddlePath = path.join(outputDirectory, `${basename}.paddle.json`);
      if (force || !fs.existsSync(imagePath)) renderPage(pdfPath, pageNumber, path.join(outputDirectory, basename));
      if (force || !fs.existsSync(textPath) || !fs.existsSync(paddlePath)) pendingPaddleImages.push(imagePath);
    }
    metadata.push({ key, relativePdf, relativeAnswer, pdfPath, info, outputDirectory });
  }

  runPaddleOcr(pendingPaddleImages);

  for (const { key, relativePdf, relativeAnswer, pdfPath, info, outputDirectory } of metadata) {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= info.pages; pageNumber += 1) {
      const basename = `p${String(pageNumber).padStart(2, '0')}`;
      const imagePath = path.join(outputDirectory, `${basename}.png`);
      const textPath = path.join(outputDirectory, `${basename}.txt`);
      const paddlePath = path.join(outputDirectory, `${basename}.paddle.json`);
      const text = fs.readFileSync(textPath, 'utf8');
      const paddle = JSON.parse(fs.readFileSync(paddlePath, 'utf8'));
      pages.push({
        page: pageNumber,
        imagePath: path.relative(root, imagePath),
        textPath: path.relative(root, textPath),
        paddlePath: path.relative(root, paddlePath),
        imageSha256: sha256(imagePath),
        textSha256: sha256(textPath),
        ocrCharacters: text.replace(/\s/g, '').length,
        averageConfidence: paddle.lines.length > 0
          ? Number((paddle.lines.reduce((sum, line) => sum + line.confidence, 0) / paddle.lines.length).toFixed(4))
          : 0,
      });
    }

    const [year, group] = key.split('-');
    const firstPageText = fs.readFileSync(path.join(outputDirectory, 'p01.txt'), 'utf8');
    const titleVerified = firstPageText.includes(year)
      && /CCF|非专业级别软件能力认证/.test(firstPageText)
      && new RegExp(`CSP\\s*-?\\s*${group}`, 'i').test(firstPageText);
    const answerPath = relativeAnswer ? path.join(sourceRoot, relativeAnswer) : null;
    entries.push({
      key,
      year: Number(year),
      group,
      source: 'local_original_scan',
      titleVerified,
      pdfPath: path.relative(root, pdfPath),
      pdfSha256: sha256(pdfPath),
      pdfBytes: info.bytes,
      answerPath: answerPath ? path.relative(root, answerPath) : null,
      answerSha256: answerPath ? sha256(answerPath) : null,
      pageCount: info.pages,
      pages,
    });
    console.log(`${key}: pages=${info.pages}, titleVerified=${titleVerified}`);
  }

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    entries,
  };
  writeJsonAtomic(path.join(sourceRoot, 'index.json'), output);
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = indexCspSources();
    console.log(`Indexed ${result.entryCount} CSP source papers.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
