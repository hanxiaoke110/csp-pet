import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OFFICIAL_HOSTS = new Set(['gesp.ccf.org.cn', 'www.noi.cn', 'noi.cn', 'www.ccf.org.cn', 'ccf.org.cn']);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// PaddleOCR is the default for accurate Chinese text extraction.
// Set USE_PADDLEOCR=false to fall back to pdfjs-dist.
const USE_PADDLEOCR = process.env.USE_PADDLEOCR !== 'false' && process.env.USE_PADDLEOCR !== '0';
let defaultCatalog;

export function normalizeSourceText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[`'"“”‘’]/g, '')
    .replace(/[\s，。；：、,.!?！？（）()【】\[\]<>《》]/g, '')
    .replace(/的/g, '');
}

function diceSimilarity(left, right) {
  if (!left || !right) return 0;
  if (right.includes(left)) return 1;
  const grams = value => {
    const result = new Map();
    for (let index = 0; index < value.length - 1; index += 1) {
      const gram = value.slice(index, index + 2);
      result.set(gram, (result.get(gram) || 0) + 1);
    }
    return result;
  };
  const a = grams(left);
  const b = grams(right);
  let overlap = 0;
  for (const [gram, count] of a) overlap += Math.min(count, b.get(gram) || 0);
  return (2 * overlap) / ([...a.values()].reduce((x, y) => x + y, 0) + [...b.values()].reduce((x, y) => x + y, 0));
}

function isOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && OFFICIAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function questionSegment(text, originalNumber) {
  const number = Number(originalNumber);
  if (!Number.isInteger(number)) return text;
  const escaped = String(number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Find question start: number followed by . ． 、 or Chinese punctuation, preceded by line start or whitespace
  const startRe = new RegExp(`(?:^|[\\n\\r]|\\s{2,})${escaped}[.．、](?=\\s*\\S)`, 'm');
  const startMatch = startRe.exec(text);
  if (!startMatch) return text;
  const startIdx = startMatch.index + startMatch[0].length - startMatch[0].trimStart().length;
  const remaining = text.slice(startIdx);

  // Find question end: any subsequent numbered item at a logical boundary —
  // not just number+1. OCR misreads and skipped numbers must not extend this
  // question's span into the next one (that is how wrong 【答案】 entries got
  // attributed to the wrong question). Search starts after this question's
  // own number so the boundary regex cannot match it immediately.
  const ownToken = new RegExp(`${escaped}[.．、]`).exec(remaining);
  const searchFrom = ownToken ? ownToken.index + ownToken[0].length : 0;
  const endRe = /(?:^|[\n\r]。；：]|\s{3,})\d{1,2}[.．、](?=\s*\S)/m;
  const endMatch = endRe.exec(remaining.slice(searchFrom));
  if (!endMatch) return remaining;
  return remaining.slice(0, endMatch.index + searchFrom);
}

function extractAnswerAndExplanation(text, originalNumber) {
  // First try: find 【答案】X anywhere in the full page text near the question number
  const number = Number(originalNumber);
  if (Number.isInteger(number)) {
    // Search for the pattern: number. question... 【答案】X
    const escaped = String(number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Find the question's location (require a word character after the number
    // so a number inside an answer table or header is not mistaken for it)
    const qStartRe = new RegExp(`(?:^|[\\n\\r]|\\s{2,})${escaped}[.．、](?=\\s*\\S)`);
    const qStart = qStartRe.exec(text);
    if (qStart) {
      // Look for 【答案】X after this position (within reasonable distance)
      const afterQuestion = text.slice(qStart.index);
      const answerMatch = afterQuestion.match(/【答案】\s*([A-D])/i);
      if (answerMatch) {
        // Make sure this answer belongs to THIS question (not a later one)
        const answerPos = answerMatch.index;
        // Any subsequent numbered item (not just number+1) ends this
        // question's span; search starts after this question's own number.
        const ownToken = new RegExp(`${escaped}[.．、]`).exec(afterQuestion);
        const searchFrom = ownToken ? ownToken.index + ownToken[0].length : 0;
        const nextQRe = /(?:^|[\n\r]。；：]|\s{3,})\d{1,2}[.．、](?=\s*\S)/m;
        const nextQMatch = nextQRe.exec(afterQuestion.slice(searchFrom));
        const nextQPos = nextQMatch ? nextQMatch.index + searchFrom : Infinity;
        if (answerPos < nextQPos) {
          // Answer belongs to this question
          const explanationMatch = afterQuestion.slice(answerPos).match(/【解析】\s*([\s\S]*?)(?=(?:【答案】|\s*\d+[.．、]\s*[^\d]|$))/);
          return {
            extractedAnswerIndex: answerMatch[1].toUpperCase().charCodeAt(0) - 65,
            officialExplanation: explanationMatch?.[1]?.trim() || null,
          };
        }
      }
    }
  }

  // Fallback: segment-based extraction (improved)
  const segment = questionSegment(text, originalNumber);
  const answer = segment.match(/【答案】\s*([A-D])/i)?.[1];
  const explanation = segment.match(/【解析】\s*([\s\S]*?)(?=(?:\s+\d+[.．、]\s+\S)|$)/)?.[1]?.trim() || null;
  return {
    extractedAnswerIndex: answer ? answer.toUpperCase().charCodeAt(0) - 65 : null,
    officialExplanation: explanation,
  };
}

function extractAnswerTable(text) {
  const questionHeader = text.indexOf('题号');
  const answerHeader = text.indexOf('答案', questionHeader + 2);
  if (questionHeader < 0 || answerHeader < 0) return {};
  const end = [text.indexOf('单选题', answerHeader), text.indexOf('C++', answerHeader)]
    .filter(index => index > answerHeader)
    .sort((left, right) => left - right)[0] ?? Math.min(text.length, answerHeader + 300);
  const numbers = text.slice(questionHeader + 2, answerHeader).match(/\d+/g) || [];
  const answers = text.slice(answerHeader + 2, end).match(/\b[A-D]\b/g) || [];
  return Object.fromEntries(numbers.slice(0, answers.length).map((number, index) => [
    Number(number),
    answers[index].charCodeAt(0) - 65,
  ]));
}

function loadCatalog() {
  if (defaultCatalog) return defaultCatalog;
  const catalogPath = path.join(root, 'public/course-data/question-bank-v2/source-catalog.json');
  defaultCatalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : { entries: [] };
  return defaultCatalog;
}

async function loadPdfDocument(url, localPath, cache = new Map()) {
  const cacheKey = localPath || url;
  let cached = cache.get(cacheKey);
  if (!cached) {
    let bytes;
    if (localPath) {
      bytes = new Uint8Array(fs.readFileSync(path.join(root, localPath)));
    } else {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`official PDF HTTP ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    if (USE_PADDLEOCR) {
      // Use PaddleOCR for accurate Chinese text extraction
      cached = await loadPdfWithPaddleOCR(bytes, sha256, localPath, cacheKey);
    } else {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
      cached = {
        pdf,
        sha256,
        pageCount: pdf.numPages,
        pages: new Map(),
        answerMap: null,
      };
    }
    cache.set(cacheKey, cached);
  }
  return cached;
}

async function loadPdfWithPaddleOCR(bytes, sha256, localPath, cacheKey) {
  const tmpDir = fs.mkdtempSync(path.join(root, '.tmp/paddle-pdf-'));
  const pdfPath = path.join(tmpDir, 'paper.pdf');
  fs.writeFileSync(pdfPath, bytes);

  const paddleScript = path.join(root, 'scripts/question-bank/paddle-extract-fast.sh');
  const result = spawnSync('bash', [paddleScript, pdfPath], {
    timeout: 600_000,  // 10 minutes for full PDF OCR
    maxBuffer: 10 * 1024 * 1024,
    encoding: 'utf8',
  });

  // Clean up temp files
  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}

  if (result.error || result.status !== 0) {
    const msg = result.error?.message || result.stderr?.slice(0, 200) || 'unknown';
    throw new Error(`PaddleOCR failed: ${msg}`);
  }

  let ocrData;
  try {
    ocrData = JSON.parse(result.stdout.trim().split('\n').pop() || '{}');
  } catch {
    throw new Error(`PaddleOCR returned invalid JSON: ${result.stdout?.slice(0, 200)}`);
  }

  const pages = new Map();
  for (const p of (ocrData.pages || [])) {
    pages.set(p.page, p.text);
  }

  return {
    pdfPath,
    sha256,
    pageCount: pages.size,
    pages,
    answerMap: ocrData.answerMap || {},
    _paddleData: ocrData,
  };
}

export async function extractPdfPage(url, pageNumber, cache = new Map(), localPath = null) {
  const cached = await loadPdfDocument(url, localPath, cache);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > cached.pageCount) {
    throw new Error('official PDF page is out of range');
  }

  if (USE_PADDLEOCR) {
    // PaddleOCR path: text is pre-extracted into pages map
    if (!cached.pages.has(pageNumber)) {
      // Page not extracted yet — need to re-run with specific page
      // For now, throw; in practice pages are pre-loaded with --all
      throw new Error(`PaddleOCR page ${pageNumber} not in pre-extracted set`);
    }
    return {
      text: cached.pages.get(pageNumber),
      sha256: cached.sha256,
      pageNumber,
      pageCount: cached.pageCount,
      answerMap: cached.answerMap || {},
    };
  }

  // pdfjs-dist path (original)
  if (!cached.pages.has(pageNumber)) {
    const page = await cached.pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    cached.pages.set(pageNumber, content.items.map(item => item.str).join(' '));
  }
  if (cached.answerMap === null) {
    if (!cached.pages.has(1)) {
      const firstPage = await cached.pdf.getPage(1);
      const firstContent = await firstPage.getTextContent();
      cached.pages.set(1, firstContent.items.map(item => item.str).join(' '));
    }
    cached.answerMap = extractAnswerTable(cached.pages.get(1));
  }
  return {
    text: cached.pages.get(pageNumber),
    sha256: cached.sha256,
    pageNumber,
    pageCount: cached.pageCount,
    answerMap: cached.answerMap,
  };
}

function sourceStem(text, originalNumber) {
  return questionSegment(text, originalNumber)
    .split(/\sA\s*[.．、]/i)[0]
    .replace(/^\s*\d+\s*[.．、]\s*/, '');
}

function resolveSource(question, catalog) {
  const directUrl = question.provenance.url;
  const key = `${question.exam.date || ''}-${question.exam.level || ''}`;
  const catalogEntry = catalog.entries?.find(entry => entry.key === key);
  return {
    url: directUrl || catalogEntry?.url || null,
    page: question.provenance.page,
    localPath: catalogEntry?.localPath || null,
    expectedSha256: catalogEntry?.sha256 || null,
  };
}

async function findBestSourcePage(question, resolved, cache) {
  const document = await loadPdfDocument(resolved.url, resolved.localPath, cache);
  if (resolved.expectedSha256 && resolved.expectedSha256 !== document.sha256) {
    throw new Error('official PDF hash differs from source catalog');
  }
  const candidatePages = Number.isInteger(resolved.page)
    ? [...new Set([resolved.page - 1, resolved.page, resolved.page + 1].filter(page => page >= 1 && page <= document.pageCount))]
    : Array.from({ length: document.pageCount }, (_, index) => index + 1);
  let best = null;
  for (const pageNumber of candidatePages) {
    const page = await extractPdfPage(resolved.url, pageNumber, cache, resolved.localPath);
    const normalizedQuestion = normalizeSourceText(question.question);
    const normalizedPage = normalizeSourceText(page.text);
    const similarity = normalizedPage.includes(normalizedQuestion)
      ? 1
      : diceSimilarity(normalizedQuestion, normalizeSourceText(sourceStem(page.text, question.exam.originalNumber)));
    if (!best || similarity > best.textSimilarity) best = { ...page, textSimilarity: similarity };
  }
  if (best && best.pageNumber < document.pageCount) {
    const nextPage = await extractPdfPage(resolved.url, best.pageNumber + 1, cache, resolved.localPath);
    best.text = `${best.text} ${nextPage.text}`;
  }
  return best;
}

export async function matchOfficialSource(question, {
  extractPage = null,
  cache = new Map(),
  catalog = loadCatalog(),
} = {}) {
  const resolved = resolveSource(question, catalog);
  if (!isOfficialUrl(resolved.url) && !resolved.localPath) {
    return { officialMatch: false, reason: 'missing_or_untrusted_source' };
  }
  try {
    const source = extractPage
      ? await extractPage(resolved.url, resolved.page, cache)
      : await findBestSourcePage(question, resolved, cache);
    const textSimilarity = source.textSimilarity ?? diceSimilarity(
      normalizeSourceText(question.question),
      normalizeSourceText(sourceStem(source.text, question.exam.originalNumber)),
    );
    const answer = extractAnswerAndExplanation(source.text, question.exam.originalNumber);
    if (answer.extractedAnswerIndex === null && Number.isInteger(source.answerMap?.[question.exam.originalNumber])) {
      answer.extractedAnswerIndex = source.answerMap[question.exam.originalNumber];
    }
    const officialMatch = textSimilarity >= 0.92
      && answer.extractedAnswerIndex === question.answer.correctIndex;
    return {
      officialMatch,
      sourceUrl: resolved.url,
      sourcePage: source.pageNumber || resolved.page,
      sourceSha256: source.sha256,
      textSimilarity,
      ...answer,
      explanationVerified: officialMatch && Boolean(answer.officialExplanation),
      publishedExplanation: officialMatch ? answer.officialExplanation : null,
      reason: textSimilarity < 0.92
        ? 'content_mismatch'
        : answer.extractedAnswerIndex === null
          ? 'answer_not_found'
          : answer.extractedAnswerIndex !== question.answer.correctIndex
            ? 'answer_conflict'
            : 'matched',
    };
  } catch (error) {
    return { officialMatch: false, reason: 'source_error', sourceError: error.message };
  }
}
