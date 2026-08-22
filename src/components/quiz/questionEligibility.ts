export interface ChoiceQuestionLike {
  type?: string;
  question?: string;
  options?: unknown[];
  correctIndex?: unknown;
}

export function isStandaloneChoiceQuestion(question: ChoiceQuestionLike): boolean {
  if (question.type !== 'choice' || !String(question.question || '').trim()) return false;
  if (!Array.isArray(question.options) || question.options.length < 2) return false;
  if (!question.options.every(option => String(option || '').trim().length > 0)) return false;
  return Number.isInteger(question.correctIndex)
    && Number(question.correctIndex) >= 0
    && Number(question.correctIndex) < question.options.length;
}
