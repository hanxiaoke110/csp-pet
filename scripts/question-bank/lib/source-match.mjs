import { createHash } from 'node:crypto';

const OFFICIAL_HOSTS = new Set(['gesp.ccf.org.cn', 'www.noi.cn', 'noi.cn', 'www.ccf.org.cn', 'ccf.org.cn']);

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
  const next = String(number + 1);
  const start = new RegExp(`(?:^|\\s)${escaped}[.．、\\s]`).exec(text)?.index;
  if (start === undefined) return text;
  const remaining = text.slice(start);
  const end = new RegExp(`(?:^|\\s)${next}[.．、\\s]`).exec(remaining.slice(2))?.index;
  return end === undefined ? remaining : remaining.slice(0, end + 2);
}

function extractAnswerAndExplanation(text, originalNumber) {
  const segment = questionSegment(text, originalNumber);
  const answer = segment.match(/【?答案】?\s*[:：]?\s*([A-D])/i)?.[1];
  const explanation = segment.match(/【解析】\s*([\s\S]*?)(?=(?:\s\d+[.．、]\s)|$)/)?.[1]?.trim() || null;
  return {
    extractedAnswerIndex: answer ? answer.toUpperCase().charCodeAt(0) - 65 : null,
    officialExplanation: explanation,
  };
}

export async function extractPdfPage(url, pageNumber, cache = new Map()) {
  let cached = cache.get(url);
  if (!cached) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`official PDF HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
    cached = {
      pdf,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      pageCount: pdf.numPages,
    };
    cache.set(url, cached);
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > cached.pageCount) {
    throw new Error('official PDF page is out of range');
  }
  const page = await cached.pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return {
    text: content.items.map(item => item.str).join(' '),
    sha256: cached.sha256,
    pageNumber,
    pageCount: cached.pageCount,
  };
}

export async function matchOfficialSource(question, { extractPage = extractPdfPage, cache = new Map() } = {}) {
  const { url, page } = question.provenance;
  if (!isOfficialUrl(url) || !Number.isInteger(page)) {
    return { officialMatch: false, reason: 'missing_or_untrusted_source' };
  }
  try {
    const source = await extractPage(url, page, cache);
    const stem = normalizeSourceText(question.question);
    const segment = questionSegment(source.text, question.exam.originalNumber);
    const sourceStem = segment
      .split(/\sA\s*[.．、]/i)[0]
      .replace(/^\s*\d+\s*[.．、]\s*/, '');
    const textSimilarity = diceSimilarity(stem, normalizeSourceText(sourceStem));
    const answer = extractAnswerAndExplanation(source.text, question.exam.originalNumber);
    const officialMatch = textSimilarity >= 0.92
      && answer.extractedAnswerIndex === question.answer.correctIndex;
    return {
      officialMatch,
      sourceUrl: url,
      sourcePage: source.pageNumber || page,
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
