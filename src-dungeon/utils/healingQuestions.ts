import type { Question } from '../types/dungeon';
import { isUsableChoiceQuestion } from './questionLoader';

function matchesKnowledgePoint(question: Question, knowledgePoint: string): boolean {
  const questionPoint = question.knowledgePoint?.trim();
  const target = knowledgePoint.trim();
  return Boolean(questionPoint && target && (
    questionPoint.includes(target) || target.includes(questionPoint)
  ));
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function pickHealingQuestions(
  questionBank: Question[],
  knowledgePoint: string,
  count = 5,
  recentIds: string[] = [],
  random: () => number = Math.random,
): Question[] {
  const uniqueQuestions = Array.from(new Map(
    questionBank.filter(isUsableChoiceQuestion).map(question => [question.id, question]),
  ).values());
  const matching = uniqueQuestions.filter(question => matchesKnowledgePoint(question, knowledgePoint));
  const fallback = uniqueQuestions.filter(question => !matchesKnowledgePoint(question, knowledgePoint));
  const recentSet = new Set(recentIds);
  const preferred = [
    ...shuffle(matching.filter(question => !recentSet.has(question.id)), random),
    ...shuffle(fallback.filter(question => !recentSet.has(question.id)), random),
    ...shuffle(matching.filter(question => recentSet.has(question.id)), random),
    ...shuffle(fallback.filter(question => recentSet.has(question.id)), random),
  ];
  const selected = Array.from(new Map(preferred.map(question => [question.id, question])).values()).slice(0, count);

  const lastRecentId = recentIds[recentIds.length - 1];
  if (selected.length > 1 && selected[0].id === lastRecentId) {
    [selected[0], selected[1]] = [selected[1], selected[0]];
  }
  return selected;
}
