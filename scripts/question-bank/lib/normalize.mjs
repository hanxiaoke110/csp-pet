import { createHash } from 'node:crypto';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key])]),
  );
}

export function stableContentHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableText(value) {
  const text = asText(value);
  return text || null;
}

function asNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeGroup(raw) {
  const idGroup = String(raw.id || '').match(/^csp-([js])-/i)?.[1];
  const value = asText(raw.group || raw.examGroup || idGroup).toUpperCase();
  if (value === 'J' || value.includes('入门')) return 'J';
  if (value === 'S' || value.includes('提高')) return 'S';
  return null;
}

function normalizeId(raw) {
  const id = String(raw?.id ?? '').trim();
  const legacyChoice = id.match(/^csp-([js])-(\d{4})-(\d{3})$/i);
  if (!legacyChoice) return id;
  return `csp-${legacyChoice[1].toLowerCase()}-${legacyChoice[2]}-c${Number(legacyChoice[3]).toString().padStart(2, '0')}`;
}

function inferOriginalNumber(id, explicitValue) {
  if (explicitValue !== undefined && explicitValue !== null && explicitValue !== '') return explicitValue;
  const match = id.match(/-(?:c|r|f|reading-|fillblank-)?(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function normalizeType(raw) {
  const value = asText(raw.questionType || raw.type || 'choice').toLowerCase();
  const id = asText(raw.id).toLowerCase();
  if (['completion', 'fill', 'fillblank', 'fill_blank', 'programming-fill'].includes(value)) {
    return 'fillBlank';
  }
  if (['reading', 'program-reading', 'program_reading'].includes(value)) return 'reading';
  if (['boolean', 'judge', 'true-false', 'true_false'].includes(value)) return 'boolean';
  if (/-f\d+$|-fillblank-\d+$/.test(id)) return 'fillBlank';
  if (/-r\d+$|-reading-\d+$/.test(id)) return 'reading';
  return 'choice';
}

function normalizeCorrectIndex(value) {
  if (Number.isInteger(value)) return value;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeChild(parentId, item, index, kind) {
  return {
    id: asText(item?.id) || `${parentId}:${kind}:${index + 1}`,
    label: asNullableText(item?.label || item?.question || item?.prompt),
    position: asNullableNumber(item?.position),
    options: Array.isArray(item?.options) ? item.options.map(value => String(value).trim()) : [],
    correctIndex: normalizeCorrectIndex(item?.correctIndex),
    answer: item?.answer ?? null,
    explanation: asText(item?.explanation),
  };
}

function collectAssets(raw) {
  const candidates = [
    raw.image,
    raw.codeImage,
    ...(Array.isArray(raw.assets) ? raw.assets : []),
    ...(Array.isArray(raw.images) ? raw.images : []),
  ];
  return [...new Set(candidates.map(asText).filter(Boolean))];
}

export function normalizeLegacyQuestion(raw) {
  const id = normalizeId(raw);
  const group = normalizeGroup(raw || {});
  const source = asText(raw?.source) || (raw?.level || raw?.group === 'GESP' ? 'gesp' : 'csp_exam');
  const subQuestions = Array.isArray(raw?.subQuestions)
    ? raw.subQuestions.map((item, index) => normalizeChild(id, item, index, 'sub'))
    : [];
  const blanks = Array.isArray(raw?.blanks)
    ? raw.blanks.map((item, index) => normalizeChild(id, item, index, 'blank'))
    : [];

  const core = {
    id,
    source,
    exam: {
      year: Number(raw?.year || 0),
      date: asNullableText(raw?.examDate || raw?.date),
      group,
      level: asNullableNumber(raw?.level),
      originalNumber: inferOriginalNumber(id, raw?.originalNumber ?? raw?.questionNumber),
    },
    type: normalizeType(raw || {}),
    question: asText(raw?.question || raw?.stem),
    code: asNullableText(raw?.code),
    assets: collectAssets(raw || {}),
    options: Array.isArray(raw?.options) ? raw.options.map(value => String(value).trim()) : [],
    answer: {
      correctIndex: normalizeCorrectIndex(raw?.correctIndex ?? raw?.answer?.correctIndex),
    },
    children: subQuestions.length ? subQuestions : blanks,
    explanation: asText(raw?.explanation),
    knowledgePoint: asText(raw?.knowledgePoint) || '未分类',
    difficulty: Number(raw?.difficulty || raw?.level || 1),
    provenance: {
      level: source === 'practice_original'
        ? 'project_authored'
        : raw?.sourceUrl ? 'official_unlinked' : 'secondary',
      url: asNullableText(raw?.sourceUrl || raw?.provenance?.url),
      page: asNullableNumber(raw?.sourcePage || raw?.provenance?.page),
      answerUrl: asNullableText(raw?.answerSourceUrl || raw?.provenance?.answerUrl),
      answerPage: asNullableNumber(raw?.answerSourcePage || raw?.provenance?.answerPage),
    },
  };

  return { ...core, contentHash: stableContentHash(core) };
}
