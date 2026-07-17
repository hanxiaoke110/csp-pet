// 统一排除题目配置加载器。
// 单一数据源：public/course-data/excluded-question-ids.json（构建后由 /course-data/ 提供）
// 被 src/components/quiz/QuizPractice.tsx 与 src-dungeon/utils/questionLoader.ts 复用，
// 避免在多处硬编码排除 ID。读取失败降级为空集合，不影响题库加载。
// 模块级缓存：首次加载后复用，避免重复请求。

const CONFIG_URL = '/course-data/excluded-question-ids.json';
const REMOTE_CONFIG_URL = 'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data/excluded-question-ids.json';

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;

async function fetchExcludedIds(url: string, timeoutMs: number): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data?.ids) ? data.ids.map(String) : [];
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 异步加载排除 ID 集合（带缓存）。失败降级为空集合。 */
export async function loadExcludedQuestionIds(): Promise<Set<string>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const remoteIds = await fetchExcludedIds(REMOTE_CONFIG_URL, 5000);
    const ids = remoteIds ?? await fetchExcludedIds(CONFIG_URL, 5000) ?? [];
    cache = new Set(ids);
    return cache;
  })();
  return inflight;
}

/** 同步读取已加载的排除 ID 集合。若尚未加载（异步未完成）则返回空集合，供同步过滤路径安全使用。 */
export function getCachedExcludedQuestionIds(): Set<string> {
  return cache ?? new Set();
}
