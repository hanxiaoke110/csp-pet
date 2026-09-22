import bundledCatalog from './starPathCatalog.json';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { StarPathCatalog, StarPathMetric, StarPathTask } from '../types/starPath';

export const STAR_PATH_CATALOG_URL = 'https://cards.cspstudy.top/star-path/catalog.json';
export const STAR_PATH_CATALOG_FALLBACK_URL =
  'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/star-path/catalog.json';
export const STAR_PATH_CATALOG_CACHE_KEY = 'csp_star_path_catalog_cache_v1';
export const STAR_PATH_CATALOG_EVENT = 'csp-star-path-catalog-updated';

const metrics = new Set<StarPathMetric>([
  'quizCorrect', 'quizAnswered', 'weeklyChallenges', 'superChallenges',
  'mazeSeals', 'mazeClears', 'trialStages',
]);
const categories = new Set(['learning', 'challenge', 'exploration', 'trial']);
let refreshPromise: Promise<void> | null = null;

function validReward(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const reward = value as Record<string, unknown>;
  return Number.isInteger(reward.coins) && Number(reward.coins) >= 0 && Number(reward.coins) <= 500
    && Number.isInteger(reward.exp) && Number(reward.exp) >= 0 && Number(reward.exp) <= 500
    && (Number(reward.coins) > 0 || Number(reward.exp) > 0);
}

export function isStarPathCatalog(value: unknown): value is StarPathCatalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<StarPathCatalog>;
  if (!Number.isInteger(catalog.version) || (catalog.version || 0) < 1
    || !Array.isArray(catalog.tasks) || catalog.tasks.length === 0 || catalog.tasks.length > 50) return false;
  const ids = new Set<string>();
  return catalog.tasks.every(raw => {
    const task = raw as StarPathTask;
    if (!task || typeof task !== 'object' || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(task.id || '') || ids.has(task.id)) return false;
    ids.add(task.id);
    return typeof task.title === 'string' && task.title.length > 0 && task.title.length <= 30
      && typeof task.description === 'string' && task.description.length > 0 && task.description.length <= 80
      && typeof task.icon === 'string' && task.icon.length > 0 && task.icon.length <= 8
      && categories.has(task.category)
      && metrics.has(task.metric)
      && Number.isInteger(task.target) && task.target > 0 && task.target <= 100_000
      && validReward(task.reward);
  });
}

async function fetchCatalog(url: string, timeoutMs: number): Promise<StarPathCatalog> {
  const runtime = window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };
  if (typeof runtime.__TAURI_INTERNALS__?.invoke === 'function') {
    const response = await tauriFetch(url, { connectTimeout: timeoutMs });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!isStarPathCatalog(value)) throw new Error('星途任务配置格式错误');
    return value;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'default', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!isStarPathCatalog(value)) throw new Error('星途任务配置格式错误');
    return value;
  } finally {
    window.clearTimeout(timer);
  }
}

function readCache(): StarPathCatalog | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STAR_PATH_CATALOG_CACHE_KEY) || 'null');
    return isStarPathCatalog(value) ? value : null;
  } catch { return null; }
}

async function refreshCatalogInBackground(bundled: StarPathCatalog): Promise<void> {
  for (const url of [STAR_PATH_CATALOG_URL, STAR_PATH_CATALOG_FALLBACK_URL]) {
    try {
      const remote = await fetchCatalog(url, 5500);
      if (remote.version >= bundled.version) {
        localStorage.setItem(STAR_PATH_CATALOG_CACHE_KEY, JSON.stringify(remote));
        window.dispatchEvent(new CustomEvent<StarPathCatalog>(STAR_PATH_CATALOG_EVENT, { detail: remote }));
      }
      return;
    } catch { /* try the next static source */ }
  }
}

export async function loadStarPathCatalog(): Promise<StarPathCatalog> {
  const bundled = bundledCatalog as StarPathCatalog;
  const cached = readCache();
  const immediate = cached && cached.version >= bundled.version ? cached : bundled;
  // A navigation back to “我的” must not create another network request. The
  // static catalog is refreshed once per app session and remains available
  // offline from the bundled/cache copy.
  refreshPromise ||= refreshCatalogInBackground(bundled);
  void refreshPromise;
  return immediate;
}
