export type VerificationStatus = 'auto_verified' | 'auto_probable' | 'disputed' | 'broken';

export type QuestionChannel = 'daily' | 'super' | 'exam' | 'dungeon';

export interface CanonicalQuestionChild {
  id: string;
  label: string | null;
  position: number | null;
  options: string[];
  correctIndex: number | null;
  answer: unknown;
  explanation: string;
}

export interface CanonicalQuestion {
  id: string;
  source: string;
  exam: {
    year: number;
    date: string | null;
    group: 'J' | 'S' | null;
    level: number | null;
    originalNumber: string | number | null;
  };
  type: 'choice' | 'boolean' | 'reading' | 'fillBlank';
  question: string;
  code: string | null;
  assets: string[];
  options: string[];
  answer: { correctIndex: number | null };
  children: CanonicalQuestionChild[];
  explanation: string;
  knowledgePoint: string;
  difficulty: number;
  provenance: {
    level: string;
    url: string | null;
    page: number | null;
    answerUrl: string | null;
    answerPage: number | null;
  };
  contentHash: string;
  verificationStatus?: VerificationStatus;
}

export interface QuestionBankManifestFile {
  path: string;
  sha256: string;
  bytes: number;
  count: number;
}

export interface QuestionBankManifest {
  schemaVersion: 2;
  contentRevision: number;
  verificationRevision: number;
  channelRulesRevision: number;
  generatedAt: string;
  files: Record<string, QuestionBankManifestFile>;
}
