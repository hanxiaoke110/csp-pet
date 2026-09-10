export type GespLevelFilter = 'foundation' | 'all' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface PracticeQuestionFilterLike {
  source: string;
  level?: number;
  group?: string | null;
}

export function matchesGespLevel(question: PracticeQuestionFilterLike, levelFilter: GespLevelFilter): boolean {
  if (question.source !== 'gesp') return true;
  if (levelFilter === 'all') return true;
  if (levelFilter === 'foundation') return Number(question.level) >= 1 && Number(question.level) <= 4;
  return question.level === levelFilter;
}

export function gespLevelLabel(levelFilter: GespLevelFilter): string | null {
  if (levelFilter === 'all') return 'GESP 1-8级';
  if (levelFilter === 'foundation') return 'GESP 基础1-4级';
  return `GESP ${levelFilter}级`;
}
