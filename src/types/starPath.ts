export type StarPathMetric =
  | 'quizCorrect'
  | 'quizAnswered'
  | 'weeklyChallenges'
  | 'superChallenges'
  | 'mazeSeals'
  | 'mazeClears'
  | 'trialStages';

export type StarPathCategory = 'learning' | 'challenge' | 'exploration' | 'trial';

export interface StarPathTask {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: StarPathCategory;
  metric: StarPathMetric;
  target: number;
  reward: {
    coins: number;
    exp: number;
  };
}

export interface StarPathCatalog {
  version: number;
  updatedAt: string;
  tasks: StarPathTask[];
}

export type StarPathMetrics = Record<StarPathMetric, number>;

