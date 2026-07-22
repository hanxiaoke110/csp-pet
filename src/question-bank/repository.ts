import type {
  CanonicalQuestion,
  QuestionBankManifest,
  QuestionChannel,
} from './types';

const BUNDLED_BASE = '/course-data/question-bank-v2';
const REMOTE_BASE = 'https://api.cspstudy.top/api/question-bank/v2';

export const V2_KEYS = {
  current: 'question_bank_v2_current',
  previous: 'question_bank_v2_previous',
} as const;

const LOGICAL_FILES: Record<QuestionChannel, string> = {
  daily: 'daily-gesp.json',
  super: 'super-cspj.json',
  exam: 'exam-questions.json',
  dungeon: 'dungeon-mixed.json',
};

interface SnapshotCandidate<T> {
  revision: number;
  valid: boolean;
  data: T;
}

interface CachedRevision {
  manifest: QuestionBankManifest;
  files: Record<string, string>;
  cachedAt: string;
}

interface QuestionSnapshot {
  questions: CanonicalQuestion[];
}

interface ExamManifestSnapshot {
  papers: Array<{
    id: string;
    year: number;
    group: 'J' | 'S';
    questionIds: string[];
  }>;
}

export interface QuestionBankSession {
  revision: number;
  verificationRevision: number;
  channelRulesRevision: number;
  source: 'current' | 'previous' | 'bundled';
  channels: Partial<Record<QuestionChannel, CanonicalQuestion[]>>;
  examManifests: ExamManifestSnapshot['papers'];
}

export function chooseQuestionSnapshot<T>(
  current: SnapshotCandidate<T> | null,
  previous: SnapshotCandidate<T> | null,
  bundled: SnapshotCandidate<T>,
): SnapshotCandidate<T> {
  const valid = [current, previous, bundled]
    .filter((candidate): candidate is SnapshotCandidate<T> => Boolean(candidate?.valid))
    .sort((left, right) => right.revision - left.revision);
  if (!valid[0]) throw new Error('No valid question bank snapshot is available');
  return valid[0];
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function readCache(key: string): CachedRevision | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as CachedRevision : null;
  } catch {
    return null;
  }
}

async function validateCache(cache: CachedRevision | null, requiredFiles: string[]): Promise<boolean> {
  if (!cache || cache.manifest.schemaVersion !== 2) return false;
  for (const logicalName of requiredFiles) {
    const raw = cache.files[logicalName];
    const expected = cache.manifest.files[logicalName]?.sha256;
    if (!raw || !expected || await sha256(raw) !== expected) return false;
  }
  return true;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Question bank HTTP ${response.status}: ${url}`);
  return response.text();
}

async function loadBundled(requiredFiles: string[]): Promise<CachedRevision> {
  const manifest = JSON.parse(await fetchText(`${BUNDLED_BASE}/manifest.json`)) as QuestionBankManifest;
  const files = Object.fromEntries(await Promise.all(requiredFiles.map(async logicalName => {
    const entry = manifest.files[logicalName];
    if (!entry || !/^[a-z0-9-]+\.[a-f0-9]{12}\.json$/.test(entry.path)) {
      throw new Error(`Invalid bundled path for ${logicalName}`);
    }
    const raw = await fetchText(`${BUNDLED_BASE}/${entry.path}`);
    if (await sha256(raw) !== entry.sha256) throw new Error(`Bundled hash mismatch: ${logicalName}`);
    return [logicalName, raw];
  })));
  return { manifest, files, cachedAt: manifest.generatedAt };
}

function parseSession(
  cache: CachedRevision,
  requiredChannels: QuestionChannel[],
  source: QuestionBankSession['source'],
): QuestionBankSession {
  const channels = Object.fromEntries(requiredChannels.map(channel => {
    const logicalName = LOGICAL_FILES[channel];
    const snapshot = JSON.parse(cache.files[logicalName]) as QuestionSnapshot;
    return [channel, snapshot.questions];
  }));
  const examManifests = cache.files['exam-manifests.json']
    ? (JSON.parse(cache.files['exam-manifests.json']) as ExamManifestSnapshot).papers
    : [];
  return {
    revision: cache.manifest.contentRevision,
    verificationRevision: cache.manifest.verificationRevision,
    channelRulesRevision: cache.manifest.channelRulesRevision,
    source,
    channels,
    examManifests,
  };
}

export async function beginQuestionBankSession(requiredChannels: QuestionChannel[]): Promise<QuestionBankSession> {
  const requiredFiles = [...new Set([
    ...requiredChannels.map(channel => LOGICAL_FILES[channel]),
    ...(requiredChannels.includes('exam') ? ['exam-manifests.json'] : []),
  ])];
  const [bundled, current, previous] = await Promise.all([
    loadBundled(requiredFiles),
    Promise.resolve(readCache(V2_KEYS.current)),
    Promise.resolve(readCache(V2_KEYS.previous)),
  ]);
  const [currentValid, previousValid] = await Promise.all([
    validateCache(current, requiredFiles),
    validateCache(previous, requiredFiles),
  ]);
  const selected = chooseQuestionSnapshot(
    current ? { revision: current.manifest.contentRevision, valid: currentValid, data: { cache: current, source: 'current' as const } } : null,
    previous ? { revision: previous.manifest.contentRevision, valid: previousValid, data: { cache: previous, source: 'previous' as const } } : null,
    { revision: bundled.manifest.contentRevision, valid: true, data: { cache: bundled, source: 'bundled' as const } },
  );
  return parseSession(selected.data.cache, requiredChannels, selected.data.source);
}

export async function refreshQuestionBankV2(): Promise<boolean> {
  const manifest = JSON.parse(await fetchText(`${REMOTE_BASE}/manifest`)) as QuestionBankManifest;
  const logicalNames = Object.keys(manifest.files);
  const files = Object.fromEntries(await Promise.all(logicalNames.map(async logicalName => {
    const raw = await fetchText(`${REMOTE_BASE}/${logicalName}`);
    if (await sha256(raw) !== manifest.files[logicalName].sha256) {
      throw new Error(`Remote hash mismatch: ${logicalName}`);
    }
    return [logicalName, raw];
  })));
  const next: CachedRevision = { manifest, files, cachedAt: new Date().toISOString() };
  const currentRaw = localStorage.getItem(V2_KEYS.current);
  if (currentRaw) localStorage.setItem(V2_KEYS.previous, currentRaw);
  localStorage.setItem(V2_KEYS.current, JSON.stringify(next));
  return true;
}
