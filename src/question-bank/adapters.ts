import type { CanonicalQuestion } from './types';

export function toLegacyQuestion(question: CanonicalQuestion, source = question.source) {
  const children = question.children.map((child, index) => ({
    label: child.label || `第 ${index + 1} 小问`,
    position: child.position ?? index + 1,
    options: child.options,
    correctIndex: child.correctIndex as number,
    explanation: child.explanation,
  }));
  return {
    id: question.id,
    source,
    year: question.exam.year,
    group: question.exam.group,
    level: question.exam.level ?? undefined,
    type: question.type,
    knowledgePoint: question.knowledgePoint,
    difficulty: question.difficulty,
    question: question.question,
    code: question.code || undefined,
    image: question.assets[0] || null,
    codeImage: null,
    options: question.options,
    correctIndex: question.answer.correctIndex as number,
    explanation: question.explanation,
    subQuestions: question.type === 'reading' ? children : undefined,
    blanks: question.type === 'fillBlank' ? children : undefined,
    answers: children.map(child => child.correctIndex),
  };
}
