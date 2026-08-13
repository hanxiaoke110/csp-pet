export interface SuperChallengeItem {
  label?: string;
  options?: string[];
  correctIndex?: number;
}

export interface SuperChallengeQuestion {
  type?: string;
  code?: string;
  image?: string | null;
  codeImage?: string | null;
  subQuestions?: SuperChallengeItem[];
  blanks?: SuperChallengeItem[];
}

export function getSuperChallengeItems(question: SuperChallengeQuestion): SuperChallengeItem[] {
  return question.type === 'fillBlank' ? (question.blanks || []) : (question.subQuestions || []);
}

export function isCompleteSuperChallenge(question: SuperChallengeQuestion): boolean {
  if (!['reading', 'fillBlank'].includes(question.type || '')) return false;
  if (!question.code?.trim() && !question.image && !question.codeImage) return false;
  const items = getSuperChallengeItems(question);
  return items.length > 0 && items.every(item => {
    const options = item.options || [];
    return Boolean(item.label?.trim())
      && options.length >= 2
      && options.every(option => Boolean(String(option).trim()))
      && Number.isInteger(item.correctIndex)
      && Number(item.correctIndex) >= 0
      && Number(item.correctIndex) < options.length;
  });
}
