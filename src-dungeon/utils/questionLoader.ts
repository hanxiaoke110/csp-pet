// 潜龙闭关 — 题目加载器（3级缓存）
import type { Question, DungeonDefinition } from '../types/dungeon';
import type { KnowledgeTag } from '../data/skills';

const CACHE_PREFIX = 'dungeon_';
const REMOTE_BASE = 'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data';

async function tryLoad(path: string): Promise<Response | null> {
  try {
    const resp = await fetch(path);
    // Only accept JSON responses (avoid HTML from SPA fallback)
    const ct = resp.headers.get('content-type') || '';
    if (resp.ok && ct.includes('json')) return resp;
    return null;
  } catch {
    return null;
  }
}

// Level 1: localStorage cache
function loadFromCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveToCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch { /* ignore */ }
}

// Level 2: Remote fetch (Gitee)
async function loadFromRemote<T>(filename: string): Promise<T | null> {
  const resp = await tryLoad(`${REMOTE_BASE}/${filename}`);
  if (resp) {
    const data = await resp.json();
    saveToCache(filename, data);
    return data as T;
  }
  return null;
}

// Level 3: Bundled fallback
async function loadBundled<T>(filename: string): Promise<T | null> {
  const resp = await tryLoad(`/course-data/${filename}`);
  if (resp) return resp.json() as Promise<T>;
  return null;
}

// ── Public API ──

export async function loadQuestionBank(): Promise<Question[]> {
  const cacheKey = 'csp_exam_bank_v4';

  // Try cache first
  const cached = loadFromCache<{ questions: Question[] }>(cacheKey);
  if (cached?.questions?.length) return cached.questions;

  // Try bundled import first (works in both dev and IIFE builds)
  try {
    const mod = await import('../data/csp-exam-bank.json');
    const data = (mod as any).default || mod;
    if (data?.questions?.length) {
      saveToCache(cacheKey, data);
      return data.questions;
    }
  } catch { /* fall through */ }

  // Try remote
  const remote = await loadFromRemote<{ questions: Question[] }>('csp-exam-bank.json');
  if (remote?.questions?.length) return remote.questions;

  throw new Error('无法加载题库');
}

export async function loadDungeons(): Promise<DungeonDefinition[]> {
  const cacheKey = 'dungeons_v1';

  const cached = loadFromCache<DungeonDefinition[]>(cacheKey);
  if (cached?.length) return cached;

  // Dungeon definitions are small, always bundled
  const bundled = await loadBundled<DungeonDefinition[]>('dungeons.json');
  if (bundled?.length) {
    saveToCache(cacheKey, bundled);
    return bundled;
  }

  // Dynamic import fallback
  const mod = await import('../data/dungeons.json');
  saveToCache(cacheKey, mod.default);
  return mod.default as DungeonDefinition[];
}

export async function loadQuestionMapping(): Promise<Record<string, Record<string, string[]>>> {
  const cacheKey = 'question_mapping_v1';

  const cached = loadFromCache<Record<string, Record<string, string[]>>>(cacheKey);
  if (cached) return cached;

  const mod = await import('../data/question-mapping.json');
  saveToCache(cacheKey, mod.default);
  return mod.default as Record<string, Record<string, string[]>>;
}

export async function loadSchools() {
  const cacheKey = 'schools_v1';

  const cached = loadFromCache(cacheKey);
  if (cached) return cached;

  const mod = await import('../data/schools.json');
  saveToCache(cacheKey, mod.default);
  return mod.default;
}

// ── Get questions for a specific stage ──
export function getStageQuestions(
  bank: Question[],
  mapping: Record<string, Record<string, string[]>>,
  dungeonId: string,
  stageId: string,
  count: number = 5
): Question[] {
  const dungeonMap = mapping[dungeonId];
  if (!dungeonMap) return [];

  const stageIds = dungeonMap[stageId] || [];
  if (stageIds.length === 0) {
    // Fallback: use any questions from the dungeon
    const allIds = Object.values(dungeonMap).flat();
    const shuffled = [...allIds].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count)
      .map(id => bank.find(q => q.id === id))
      .filter(Boolean) as Question[];
  }

  // Shuffle and pick — only CHOICE questions (reading/fillBlank need separate UI)
  const choiceIds = stageIds.filter(id => {
    const q = bank.find(bq => bq.id === id);
    return q && q.type === 'choice' && q.options && q.options.length >= 4;
  });
  const shuffled = [...choiceIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count)
    .map(id => bank.find(q => q.id === id))
    .filter(Boolean) as Question[];
}

// ── Get boss questions (across all stages in a dungeon) ──
export function getBossQuestions(
  bank: Question[],
  mapping: Record<string, Record<string, string[]>>,
  dungeonId: string,
  count: number = 10
): Question[] {
  const dungeonMap = mapping[dungeonId];
  if (!dungeonMap) return [];

  const allIds = Object.values(dungeonMap).flat();
  const shuffled = [...allIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count)
    .map(id => bank.find(q => q.id === id))
    .filter(Boolean) as Question[];
}

// ── Pick questions by skill knowledge tag ──
export function pickQuestionsByTag(
  allQuestions: Question[],
  tag: KnowledgeTag,
  count: number
): Question[] {
  const tagMap: Record<KnowledgeTag, string[]> = {
    'grammar': ['语法', '变量', '数据类型', '运算符'],
    'control-flow': ['分支', '循环', 'if', 'for', 'while'],
    'data-structure': ['数组', '字符串', '栈', '队列', '树', '结构'],
    'algorithm': ['枚举', '递归', '排序', '贪心', '搜索', '算法'],
  };

  const keywords = tagMap[tag];
  const matched = allQuestions.filter(q =>
    keywords.some(kw =>
      (q.knowledgePoint?.includes(kw)) ||
      (q.question?.includes(kw))
    )
  );

  // 随机抽取 count 道，不足则全取
  const shuffled = [...matched].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
