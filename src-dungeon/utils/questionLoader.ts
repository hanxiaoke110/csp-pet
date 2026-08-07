// 潜龙闭关 — 题目加载器（3级缓存）
import type { Question, DungeonDefinition } from '../types/dungeon';
import type { KnowledgeTag } from '../data/skills';
import { loadExcludedQuestionIds, getCachedExcludedQuestionIds } from '../../src/utils/excludedQuestions';
import { loadVersionedRemoteJson } from '../../src/utils/versionedRemoteJson';
import { beginQuestionBankSession } from '../../src/question-bank/repository';
import { toLegacyQuestion } from '../../src/question-bank/adapters';

const CACHE_PREFIX = 'dungeon_';
const REVIEWED_BANK_API = 'https://api.cspstudy.top/api/question-bank';
const REVIEWED_BANK_CACHE_KEY = 'reviewed_exam_bank_v1';
const REVIEWED_BANK_VERSION_KEY = 'dungeon_reviewed_exam_bank_version';

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

interface DungeonQuestionBankData {
  questions: Question[];
}

interface ReviewedBankVersion {
  baseVersion: number;
  revision: number;
}

function isDungeonQuestionBankData(data: unknown): data is DungeonQuestionBankData {
  return Boolean(
    data &&
    typeof data === 'object' &&
    Array.isArray((data as DungeonQuestionBankData).questions) &&
    (data as DungeonQuestionBankData).questions.length > 0
  );
}

// ── Public API ──

export async function loadQuestionBank(): Promise<Question[]> {
  // 统一排除配置（/course-data/excluded-question-ids.json）须先加载，
  // V2 与旧版两条路径的 isBrokenCodeQuestion 过滤都依赖它。
  await loadExcludedQuestionIds();
  try {
    const session = await beginQuestionBankSession(['dungeon']);
    const verified = (session.channels.dungeon || []).map(question => toLegacyQuestion(question)) as Question[];
    if (verified.length > 0) return verified;
  } catch {
    // Older installations can still use the legacy three-level cache below.
  }
  const data = await loadVersionedRemoteJson<DungeonQuestionBankData>({
    cacheKey: 'dungeon_exam_bank_v1',
    versionKey: 'dungeon_exam_bank_version',
    versionFile: 'dungeon-exam-version.json',
    dataFile: 'dungeon-exam-bank.json',
    bundledUrl: '/course-data/dungeon-exam-bank.json',
    validate: isDungeonQuestionBankData,
  });
  let cachedReviewed = loadFromCache<Question[]>(REVIEWED_BANK_CACHE_KEY);

  // The desktop shell already downloads the merged teacher-reviewed bank on launch.
  // Reuse it immediately so entering the dungeon never falls back to an older answer set.
  try {
    const desktopVersion = localStorage.getItem('csp_reviewed_quiz_bank_version');
    const desktopBankRaw = localStorage.getItem('csp_quiz_bank');
    if (desktopVersion && desktopBankRaw) {
      const desktopBank = JSON.parse(desktopBankRaw) as Record<string, unknown>;
      cachedReviewed = mergeReviewedQuestionBank(data.questions, desktopBank);
      saveToCache(REVIEWED_BANK_CACHE_KEY, cachedReviewed);
      localStorage.setItem(REVIEWED_BANK_VERSION_KEY, desktopVersion);
    }
  } catch {
    // Ignore a corrupt desktop cache and continue with the dungeon cache/API.
  }

  try {
    const versionResponse = await fetch(`${REVIEWED_BANK_API}/version`, { cache: 'no-store' });
    if (!versionResponse.ok) throw new Error(`题库版本请求失败：${versionResponse.status}`);
    const version = await versionResponse.json() as ReviewedBankVersion;
    const versionKey = `${Number(version.baseVersion) || 0}:${Number(version.revision) || 0}`;

    if (cachedReviewed?.length && localStorage.getItem(REVIEWED_BANK_VERSION_KEY) === versionKey) {
      return cachedReviewed;
    }

    const bankResponse = await fetch(`${REVIEWED_BANK_API}/data`, { cache: 'no-store' });
    if (!bankResponse.ok) throw new Error(`题库数据请求失败：${bankResponse.status}`);
    const reviewedBank = await bankResponse.json() as Record<string, unknown>;
    const merged = mergeReviewedQuestionBank(data.questions, reviewedBank);
    saveToCache(REVIEWED_BANK_CACHE_KEY, merged);
    localStorage.setItem(REVIEWED_BANK_VERSION_KEY, versionKey);
    return merged;
  } catch {
    return cachedReviewed?.length ? cachedReviewed : data.questions;
  }
}

function inferReviewedGroup(raw: Record<string, unknown>, fallback?: Question): Question['group'] {
  if (fallback?.group) return fallback.group;
  if (raw.source === 'gesp') return 'GESP';
  const examGroup = String(raw.examGroup || '');
  return examGroup.includes('提高') ? 'S' : 'J';
}

function normalizeReviewedQuestion(raw: Record<string, unknown>, fallback?: Question): Question | null {
  const id = String(raw.id || fallback?.id || '').trim();
  if (!id) return null;

  const rawType = String(raw.questionType || raw.type || fallback?.type || 'choice');
  const type: Question['type'] = rawType === 'reading'
    ? 'reading'
    : (rawType === 'fillBlank' || rawType === 'completion' ? 'fillBlank' : 'choice');
  const options = Array.isArray(raw.options) ? raw.options.map(String) : fallback?.options;
  const correctIndex = typeof raw.correctIndex === 'number' ? raw.correctIndex : fallback?.correctIndex;

  return {
    ...fallback,
    id,
    year: Number(raw.year ?? fallback?.year ?? 0),
    group: inferReviewedGroup(raw, fallback),
    type,
    knowledgePoint: String(raw.knowledgePoint ?? fallback?.knowledgePoint ?? '其他'),
    difficulty: Number(raw.difficulty ?? raw.level ?? fallback?.difficulty ?? 1),
    question: String(raw.question ?? fallback?.question ?? ''),
    code: raw.code === null || typeof raw.code === 'string' ? raw.code : fallback?.code,
    image: raw.image === null || typeof raw.image === 'string' ? raw.image : fallback?.image,
    codeImage: raw.codeImage === null || typeof raw.codeImage === 'string' ? raw.codeImage : fallback?.codeImage,
    options,
    correctIndex,
    subQuestions: Array.isArray(raw.subQuestions) ? raw.subQuestions as Question['subQuestions'] : fallback?.subQuestions,
    blanks: Array.isArray(raw.blanks) ? raw.blanks as Question['blanks'] : fallback?.blanks,
    explanation: typeof raw.explanation === 'string' ? raw.explanation : fallback?.explanation,
    level: Number(raw.level ?? fallback?.level) || undefined,
  };
}

/** Keep dungeon metadata while applying the teacher-reviewed public bank as the source of truth. */
export function mergeReviewedQuestionBank(
  baseQuestions: Question[],
  reviewedBank: Record<string, unknown>
): Question[] {
  const merged = new Map(baseQuestions.map(question => [question.id, question]));
  for (const raw of Object.values(reviewedBank)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const id = String(record.id || '').trim();
    const normalized = normalizeReviewedQuestion(record, merged.get(id));
    if (normalized) merged.set(normalized.id, normalized);
  }
  return [...merged.values()];
}

export async function loadDungeons(): Promise<DungeonDefinition[]> {
  // Dungeon definitions ship with the app and are small. Always read the
  // current bundled version so an old localStorage cache cannot keep stale
  // artwork, copy, or unlock rules after an application update.
  try {
    localStorage.removeItem(`${CACHE_PREFIX}dungeons_v1`);
  } catch { /* ignore stale-cache cleanup */ }
  const mod = await import('../data/dungeons.json');
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
      .filter(isUsableChoiceQuestion);
  }

  // Shuffle and pick — only CHOICE questions (reading/fillBlank need separate UI)
  const choiceIds = stageIds.filter(id => {
    const q = bank.find(bq => bq.id === id);
    return isUsableChoiceQuestion(q);
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
    .filter(isUsableChoiceQuestion);
}

// 题干出现这些词时，必须有 code 字段或题干内联代码才能选用（否则代码块缺失，学生看到残缺题）
const CODE_REQUIRED_PATTERNS = [
  '下列代码', '以下代码', '关于以下代码', '以下程序', '如下代码', '下面代码', '关于下面代码',
  '代码的横线', '代码的横线处',
  '程序后输出', '程序输出', '代码执行', '代码运行', '这段代码', '该程序',
  // 「C++」夹在中间的变体：题干如「下面C++代码段执行后输出」「执行以下C++程序后」，
  // 子串匹配不到「下面代码」/「以下程序」（中间隔着 C++），单独列出
  'C++代码', 'C++程序', '代码段',
  // 代码填空题：横线 = 代码里的空。CCF 原题代码是图片，导入后 code 字段缺失，
  // 题干只剩「横线处应填入」，必须过滤
  '横线',
  // 「代码输出X」类：题干如「代码输出数字三角形，last+=1 改为...执行效果」
  '代码输出',
];

const QUESTION_HISTORY_KEY = 'csp_question_history_v1';
const QUESTION_HISTORY_LIMIT = 120;

type QuestionHistoryEntry = { id: string; at: number; channel: string };

function readQuestionHistory(): QuestionHistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUESTION_HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x): x is QuestionHistoryEntry => typeof x?.id === 'string' && typeof x?.at === 'number') : [];
  } catch { return []; }
}

export function rememberQuestionsShown(questions: Question[], channel: string): void {
  if (!questions.length) return;
  try {
    const now = Date.now();
    const added = questions.map(q => ({ id: q.id, at: now, channel }));
    const deduped = [...added, ...readQuestionHistory().filter(old => !added.some(next => next.id === old.id))]
      .slice(0, QUESTION_HISTORY_LIMIT);
    localStorage.setItem(QUESTION_HISTORY_KEY, JSON.stringify(deduped));
  } catch { /* localStorage is optional */ }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function chooseFreshQuestions(candidates: Question[], count: number, channel: string): Question[] {
  const history = readQuestionHistory();
  const recentIds = new Set(history.slice(0, 30).map(item => item.id));
  const weekAgo = Date.now() - 7 * 86400000;
  const thisChannelIds = new Set(history.filter(item => item.channel === channel).slice(0, 50).map(item => item.id));
  const fresh = candidates.filter(q => !recentIds.has(q.id) && !thisChannelIds.has(q.id));
  const older = candidates.filter(q => !recentIds.has(q.id) && !fresh.includes(q));
  const stale = candidates.filter(q => !recentIds.has(q.id) && history.some(item => item.id === q.id && item.at < weekAgo));
  const pool = fresh.length >= count ? fresh : [...fresh, ...older, ...stale, ...candidates];
  const chosen = shuffle(pool.filter((q, index, all) => all.findIndex(other => other.id === q.id) === index)).slice(0, count);
  rememberQuestionsShown(chosen, channel);
  return chosen;
}

// 题干里若含真实代码片段（哪怕没有独立 code 字段），题目仍可作答，不算残缺
const INLINE_CODE_MARKERS = [
  '#include', 'int main', 'for(', 'while(', 'cout', 'printf', 'scanf', 'cin>>',
  // 题干带行号代码 / 函数 / 结构体定义（如「1 void insertion_sort(...)」「struct pass{」）
  'vector<', 'std::', 'void ', 'struct ', 'return 0', ';\n', '};',
  'string s', 'int a=', 'int i=', 'int n=', 'int cnt=',
];

function needsCodeBlock(stem: string): boolean {
  return CODE_REQUIRED_PATTERNS.some(p => stem.includes(p));
}

function hasInlineCode(stem: string): boolean {
  return INLINE_CODE_MARKERS.some(m => stem.includes(m));
}

// 残缺题：题干要求看代码/程序/填空，但既无 code 字段、题干也无内联代码片段
export function isBrokenCodeQuestion(q: Question): boolean {
  // 统一排除配置（/course-data/excluded-question-ids.json）中的题直接排除。
  // 缓存由 loadQuestionBank 预加载；未加载时返回空集，不排除（降级安全）。
  if (q.id && getCachedExcludedQuestionIds().has(q.id)) return true;
  const stem = q.question || '';
  if (q.code) return false;                // 有独立 code 字段 → 不残缺
  if (getTrustedQuestionImage(q)) return false; // 流程图等不可文本化素材可作为完整上下文
  if (hasInlineCode(stem)) return false;   // 题干自带可执行代码片段 → 不残缺
  if (needsCodeBlock(stem)) return true;   // 明确引用代码块/程序/横线 → 残缺
  // 循环输出/执行后结果类：题干要求算某段循环的输出，但既无 code 也无完整循环结构
  // 如「cnt+=i++循环输出cnt是」「循环执行后输出是」——原题循环代码丢失
  if (/循环/.test(stem) && /输出|执行后|结果是|的值是/.test(stem)) return true;
  return false;
}

/**
 * GESP code screenshots were extracted from answer PDFs by page position. Some files contain
 * neighbouring questions and even official answers, so they must never be shown in gameplay.
 * Structured code is the canonical representation; only diagrams and other trusted assets remain.
 */
export function getTrustedQuestionImage(q: Question): string | null {
  const src = q.image || q.codeImage;
  if (!src || /\/gesp-code-images\//.test(src)) return null;
  return src;
}

export function isUsableChoiceQuestion(q: Question | undefined): q is Question {
  return Boolean(q) &&
    q!.type === 'choice' &&
    Array.isArray(q!.options) &&
    q!.options.length >= 4 &&
    !isBrokenCodeQuestion(q!);
}

// ── Pick questions by skill knowledge tag ──
// 普通技能用：CSP-J 选择题 + GESP 1-4 级选择题，按知识点标签匹配
// difficultyRange: [min,max] 按题目 difficulty 过滤（CSP-J difficulty 1-4, GESP level 1-4→difficulty）
export function pickQuestionsByTag(
  allQuestions: Question[],
  tag: KnowledgeTag,
  count: number,
  difficultyRange?: [number, number]
): Question[] {
  const tagMap: Record<KnowledgeTag, string[]> = {
    'grammar': ['语法', '变量', '数据类型', '运算符'],
    'control-flow': ['分支', '循环', 'if', 'for', 'while'],
    'data-structure': ['数组', '字符串', '栈', '队列', '树', '结构'],
    'algorithm': ['枚举', '递归', '排序', '贪心', '搜索', '算法'],
  };

  const keywords = tagMap[tag];
  const [minD, maxD] = difficultyRange || [1, 4];
  const isEligible = (q: Question) =>
    q.type === 'choice' &&
    Array.isArray(q.options) && q.options.length >= 4 &&
    typeof q.correctIndex === 'number' &&
    // 组别：CSP-J 或 GESP 1-4 级（排除 CSP-S 超纲题）
    ((q.group === 'J') || (q.group === 'GESP' && q.level && q.level <= 4)) &&
    // 难度过滤：CSP-J 用 difficulty，GESP 用 level（导入时已设 difficulty=level）
    q.difficulty >= minD && q.difficulty <= maxD &&
    // 跳过缺代码的题：题干要求看代码但 code 字段为空且题干也无内联代码
    // （原题代码是图片，导入丢失；如「横线处应填入」「下面C++代码执行后」）
    !isBrokenCodeQuestion(q) &&
    keywords.some(kw =>
      (q.knowledgePoint?.includes(kw)) ||
      (q.question?.includes(kw))
    );

  const matched = allQuestions.filter(isEligible);

  // 随机抽取 count 道，不足则全取
  return chooseFreshQuestions(matched, count, `dungeon-skill-${tag}`);
}

// ── Skill fallback: any usable choice question ──
// 某技能的知识点/难度没有匹配题时兜底用，保证试炼场技能永远不会因为
// 题库覆盖缺口而完全卡死（答错也有 0.3 倍伤害，能继续推进战斗）。
export function pickFallbackChoiceQuestions(
  allQuestions: Question[],
  count: number,
  difficultyRange?: [number, number]
): Question[] {
  const [minD, maxD] = difficultyRange || [1, 4];
  const eligible = allQuestions.filter(q =>
    isUsableChoiceQuestion(q) &&
    // 与 pickQuestionsByTag 同口径：排除 CSP-S 超纲题
    ((q.group === 'J') || (q.group === 'GESP' && q.level && q.level <= 4)) &&
    q.difficulty >= minD && q.difficulty <= maxD
  );
  return chooseFreshQuestions(eligible, count, 'dungeon-skill-fallback');
}

// 副本 → 题目难度范围映射（按副本主题递进）
export function getDungeonDifficulty(dungeonId: string): [number, number] {
  const map: Record<string, [number, number]> = {
    'dungeon-01': [1, 2],  // 天机阁·计算机基础：简单
    'dungeon-02': [1, 2],  // 数术殿·进制编码：简单
    'dungeon-03': [2, 3],  // 灵码洞·C++语法：中等
    'dungeon-04': [2, 3],  // 万木林·数据结构：中等
    'dungeon-05': [3, 4],  // 算法塔·算法：难
    'dungeon-06': [3, 4],  // 天算台·数学：难
    'dungeon-07': [1, 4],  // 真题战场：全难度
    'dungeon-08': [2, 4],  // 潜龙觉醒：中高难度
  };
  return map[dungeonId] || [1, 4];
}

// ── Pick big-move questions: CSP-J 程序阅读题 / 程序填空题 ──
// 大招用：取 reading/fillBlank 题的第一个子问题，转成 choice 格式，复用现有答题 UI。
// 这类题难度高、耗时长，适合大招（每局限用2次）。
export function pickBigMoveQuestions(
  allQuestions: Question[],
  count: number,
  group: 'J' | 'S' = 'J'
): Question[] {
  const candidates: Question[] = [];

  for (const q of allQuestions) {
    if (q.group !== group) continue;
    // 跳过缺代码的题（题干要求看代码但 code 为空且无内联代码）
    if (isBrokenCodeQuestion(q)) continue;

    // 程序阅读题：取第一个 subQuestion
    if (q.type === 'reading' && q.subQuestions?.length) {
      const sub = q.subQuestions[0];
      if (sub.options?.length >= 4 && typeof sub.correctIndex === 'number') {
        candidates.push({
          ...q,
          question: `${q.question} ${sub.label}`,
          options: sub.options,
          correctIndex: sub.correctIndex,
          type: 'choice',  // 转成 choice 供 UI 处理
        });
      }
    }

    // 程序填空题：取第一个 blank
    if (q.type === 'fillBlank' && q.blanks?.length) {
      const blank = q.blanks[0];
      if (blank.options?.length >= 4 && typeof blank.correctIndex === 'number') {
        candidates.push({
          ...q,
          question: `${q.question} 第${blank.position}空`,
          options: blank.options,
          correctIndex: blank.correctIndex,
          type: 'choice',
        });
      }
    }
  }

  return chooseFreshQuestions(candidates, count, 'dungeon-big-move');
}
