export interface ReviewQuestionItem {
  label?: string;
  position?: number;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
}

export interface ReviewableQuestion {
  id: string;
  type?: 'choice' | 'reading' | 'fillBlank';
  question: string;
  code?: string;
  image?: string | null;
  codeImage?: string | null;
  options: string[];
  correctIndex: number;
  explanation: string;
  subQuestions?: ReviewQuestionItem[];
  blanks?: ReviewQuestionItem[];
  reviewErrorId?: string;
  reviewParentQuestion?: string;
  reviewPartLabel?: string;
}

function normalizeOption(value?: string): string {
  return String(value || '')
    .trim()
    .replace(/^[A-DＡ-Ｄ]\s*[.．、:：]\s*/i, '')
    .replace(/^[√✓✔×✕✖]\s*/, '')
    .trim();
}

function prepareItem(item: ReviewQuestionItem): ReviewQuestionItem {
  const normalized = (item.options || []).map(normalizeOption);
  const meaningful = normalized.filter(Boolean);
  const isTrueFalse = /^判断(?:题)?\s*\d*\s*[:：]/.test(String(item.label || '').trim())
    || (meaningful.length === 2 && meaningful[0] === '正确' && meaningful[1] === '错误');
  if (!isTrueFalse) return item;
  return {
    ...item,
    options: normalized.slice(0, 2),
    correctIndex: Number(item.correctIndex) > 1 ? 1 : item.correctIndex,
  };
}

function isValidItem(item: ReviewQuestionItem): boolean {
  const options = item.options || [];
  return Boolean(item.label?.trim())
    && options.length >= 2
    && options.every(option => Boolean(String(option).trim()))
    && Number.isInteger(item.correctIndex)
    && Number(item.correctIndex) >= 0
    && Number(item.correctIndex) < options.length;
}

function childErrorId(parentId: string, index: number): string {
  return `${parentId}-q${index + 1}`;
}

/** Expands composite wrong questions into one independently answerable review card per child. */
export function buildMonthlyReviewQuestions<T extends ReviewableQuestion>(
  bank: T[],
  errorIds: Set<string>,
): T[] {
  const result: T[] = [];
  const seen = new Set<string>();

  const append = (question: T) => {
    if (seen.has(question.id)) return;
    seen.add(question.id);
    result.push(question);
  };

  for (const question of bank) {
    if (question.type === 'choice') {
      if (errorIds.has(question.id)) append(question);
      continue;
    }

    if (question.type !== 'reading' && question.type !== 'fillBlank') continue;
    const items = question.type === 'fillBlank'
      ? (question.blanks || [])
      : (question.subQuestions || []);
    const hasParentError = errorIds.has(question.id);

    items.forEach((item, index) => {
      const id = childErrorId(question.id, index);
      const prepared = prepareItem(item);
      if ((!hasParentError && !errorIds.has(id)) || !isValidItem(prepared)) return;

      append({
        ...question,
        id,
        type: 'choice',
        question: prepared.label!.trim(),
        options: [...prepared.options!],
        correctIndex: Number(prepared.correctIndex),
        explanation: prepared.explanation || question.explanation,
        reviewErrorId: hasParentError ? question.id : id,
        reviewParentQuestion: question.question,
        reviewPartLabel: `${question.type === 'fillBlank' ? '程序填空' : '程序阅读'} · 第 ${index + 1} 小问`,
      } as T);
    });
  }

  return result;
}
