// Visualization types
export interface TracerStep {
  action: 'select' | 'patch' | 'delay' | 'deselect' | 'swap' | 'compare' | 'highlight-line';
  targets: number[];
  payload?: Record<string, unknown>;
  duration: number;
}

export interface VizDefinition {
  algoId: string;
  algoName: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  lessonRefs: number[];
  initialData: number[] | string[];
  codeSnippet: string;
  generateSteps: (input: number[] | string[]) => TracerStep[];
}

export type PlayState = 'idle' | 'playing' | 'paused' | 'finished';
export type PlaySpeed = 0.5 | 1 | 2;

export interface VizProgress {
  algoId: string;
  viewedAt: string | null;
  completedSteps: number;
  totalSteps: number;
}
