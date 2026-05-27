// Course types — mirrors shared/data/ data structure
export interface Stage {
  id: string;
  name: string;
  lessonRange: [number, number];
  color: string;
}

export interface KnowledgePoint {
  name: string;
  detail?: string;
}

export interface ProblemSample {
  in: string;
  out: string;
  input?: string;
  output?: string;
}

export interface CommonMistake {
  mistake: string;
  fix: string;
}

export interface AnimationStep {
  type: string;
  targets: string[];
  props?: Record<string, unknown>;
  duration?: number;
}

export interface Problem {
  id: string;
  platform?: string;
  pid?: string;
  title: string;
  difficulty?: string;
  tags?: string[];
  description: string;
  inputFormat?: string;
  outputFormat?: string;
  samples?: ProblemSample[];
  thinking?: string;
  code?: string;
  answerCode?: string;
  answer?: string;
  analysis?: string;
  commonMistakes?: CommonMistake[];
  progressiveHints?: [string, string, string];
  animationSteps?: AnimationStep[];
  animation?: {
    keyCode?: string[];
  };
  animationFile?: string;
  animationHTML?: string;
  tipsVideos?: string[];
  hints?: string[];
  codeTemplate?: string;
  solutionCode?: string;
  teachingTips?: string;
  timeLimit?: number;
  memoryLimit?: number;
  videoSteps?: unknown[];
  videoHTML?: string;
  videoFile?: string;
}

export interface Lesson {
  id: string;
  order: number;
  title: string;
  summary?: string;
  kpSummary?: string;
  knowledgePoints?: KnowledgePoint[];
  tags?: string[];
  password?: string;
  review?: Problem[];
  inClassCodes?: Problem[];
  inClassQuiz?: Problem[];
  homework?: Problem[];
  extended?: Problem[];
}

export interface LessonsData {
  stages?: { lessons: Lesson[] }[];
  lessons?: Lesson[];
  aiConfig?: { configured: boolean; provider: string; apiKey: string; model?: string };
  dataVersion?: number;
}
