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
  bundled: SnapshotCandidate<T> | null,
): SnapshotCandidate<T> {
  const candidates = [current, previous, bundled]
    .filter((candidate): candidate is SnapshotCandidate<T> => Boolean(candidate?.valid));
  // 同版本时优先内置快照：内置数据随安装包做过 sha256 校验，比“同版本缓存”更可信，
  // 防止远程数据修复但未 bump 版本号时，坏缓存一直压过内置好数据。
  const preferenceOrder = [bundled, current, previous];
  const rank = (candidate: SnapshotCandidate<T>): number => {
    const index = preferenceOrder.indexOf(candidate);
    return index === -1 ? preferenceOrder.length : index;
  };
  const valid = candidates.sort((left, right) => {
    const byRevision = right.revision - left.revision;
    return byRevision !== 0 ? byRevision : rank(left) - rank(right);
  });
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

async function cacheMatchesManifest(cache: CachedRevision | null, manifest: QuestionBankManifest): Promise<boolean> {
  if (!cache || cache.manifest.schemaVersion !== 2) return false;
  for (const logicalName of Object.keys(manifest.files)) {
    const raw = cache.files[logicalName];
    const expected = manifest.files[logicalName]?.sha256;
    if (!raw || !expected || await sha256(raw) !== expected) return false;
  }
  return true;
}

function bundledMatchesRemote(bundled: QuestionBankManifest, remote: QuestionBankManifest): boolean {
  if (bundled.contentRevision !== remote.contentRevision
      || bundled.verificationRevision !== remote.verificationRevision
      || bundled.channelRulesRevision !== remote.channelRulesRevision) {
    return false;
  }
  const bundledFiles = bundled.files;
  const remoteFiles = remote.files;
  if (Object.keys(bundledFiles).length !== Object.keys(remoteFiles).length) return false;
  for (const logicalName of Object.keys(remoteFiles)) {
    const bundledEntry = bundledFiles[logicalName];
    const remoteEntry = remoteFiles[logicalName];
    if (!bundledEntry || !remoteEntry
        || bundledEntry.path !== remoteEntry.path
        || bundledEntry.sha256 !== remoteEntry.sha256) {
      return false;
    }
  }
  return true;
}

const FETCH_TIMEOUT_MS = 20_000;

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Question bank HTTP ${response.status}: ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
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
  const [current, previous] = [
    readCache(V2_KEYS.current),
    readCache(V2_KEYS.previous),
  ];
  const [currentValid, previousValid] = await Promise.all([
    validateCache(current, requiredFiles),
    validateCache(previous, requiredFiles),
  ]);
  // 内置数据损坏（安装不完整/文件缺失）不应致命：仍有有效缓存时优先用缓存，
  // 全部无效才抛出，由 UI 显示可重试的错误而不是永远转圈。
  let bundled: CachedRevision | null = null;
  try {
    bundled = await loadBundled(requiredFiles);
  } catch {
    bundled = null;
  }
  const selected = chooseQuestionSnapshot(
    current ? { revision: current.manifest.contentRevision, valid: currentValid, data: { cache: current, source: 'current' as const } } : null,
    previous ? { revision: previous.manifest.contentRevision, valid: previousValid, data: { cache: previous, source: 'previous' as const } } : null,
    bundled ? { revision: bundled.manifest.contentRevision, valid: true, data: { cache: bundled, source: 'bundled' as const } } : null,
  );
  return parseSession(selected.data.cache, requiredChannels, selected.data.source);
}

export async function refreshQuestionBankV2(): Promise<boolean> {
  const manifest = JSON.parse(await fetchText(`${REMOTE_BASE}/manifest`)) as QuestionBankManifest;
  const current = readCache(V2_KEYS.current);
  const previous = readCache(V2_KEYS.previous);

  // 即使 manifest 版本号相同，也要校验缓存文件内容与远程 manifest 的 sha256 是否一致：
  // 远程数据可能修复过但版本号没变，只有内容级校验通过才认为缓存可信，
  // 避免“同版本坏缓存”一直卡住客户端。
  const [currentOk, previousOk, bundledOk] = await Promise.all([
    cacheMatchesManifest(current, manifest),
    cacheMatchesManifest(previous, manifest),
    (async () => {
      try {
        const bundled = JSON.parse(await fetchText(`${BUNDLED_BASE}/manifest.json`)) as QuestionBankManifest;
        return bundledMatchesRemote(bundled, manifest);
      } catch {
        // 内置快照不可用时，仍然尝试从远程下载修复
        return false;
      }
    })(),
  ]);

  if (currentOk) return false;

  // 当前缓存不可信，但 previous 与远程一致：直接提升为 current，避免重复下载
  if (previousOk && previous) {
    localStorage.setItem(V2_KEYS.current, JSON.stringify(previous));
    return true;
  }

  // 内置快照与远程 manifest 完全一致：清掉坏缓存，让加载逻辑直接使用内置数据
  if (bundledOk) {
    localStorage.removeItem(V2_KEYS.current);
    localStorage.removeItem(V2_KEYS.previous);
    return false;
  }

  // 否则重新下载全部文件并覆盖缓存
  const logicalNames = Object.keys(manifest.files);
  const files = Object.fromEntries(await Promise.all(logicalNames.map(async logicalName => {
    const raw = await fetchText(`${REMOTE_BASE}/${logicalName}`);
    if (await sha256(raw) !== manifest.files[logicalName].sha256) {
      throw new Error(`Remote hash mismatch: ${logicalName}`);
    }
    return [logicalName, raw];
  })));
  const next: CachedRevision = { manifest, files, cachedAt: new Date().toISOString() };
  localStorage.setItem(V2_KEYS.current, JSON.stringify(next));
  localStorage.removeItem(V2_KEYS.previous);
  return true;
}
