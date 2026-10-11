import type {
  LearningCatalogData,
  LearningCatalogLesson,
  LearningCatalogStage,
  LearningCatalogStatus,
} from './types';

export const CATALOG_STAGES: LearningCatalogStage[] = ['C1', 'C2', 'C3', 'C4'];

export const CATALOG_STAGE_LABELS: Record<LearningCatalogStage, string> = {
  C1: 'C1 入门阶段',
  C2: 'C2 基础阶段',
  C3: 'C3 进阶阶段',
  C4: 'C4 提高阶段',
};

const VALID_STATUSES = new Set<LearningCatalogStatus>(['ready', 'coming_soon', 'hidden']);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isAllowedFeishuUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const allowedHost = url.hostname.endsWith('.feishu.cn') || url.hostname.endsWith('.larksuite.com');
    return url.protocol === 'https:' && allowedHost && url.pathname.includes('/docx/');
  } catch {
    return false;
  }
}

function isDate(value: unknown, dateOnly = false): value is string {
  if (typeof value !== 'string' || (dateOnly && !DATE_ONLY.test(value))) return false;
  return Number.isFinite(Date.parse(value));
}

function isLesson(value: unknown): value is LearningCatalogLesson {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LearningCatalogLesson>;
  if (typeof item.id !== 'string' || !/^lesson-material-p\d{3,}$/.test(item.id)) return false;
  if (!Number.isInteger(item.lessonNo) || Number(item.lessonNo) <= 0) return false;
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120) return false;
  if (!CATALOG_STAGES.includes(item.stage as LearningCatalogStage)) return false;
  if (typeof item.description !== 'string' || item.description.length > 500) return false;
  if (!Array.isArray(item.tags) || item.tags.length > 20 || item.tags.some(tag => typeof tag !== 'string' || tag.length > 40)) return false;
  if (!VALID_STATUSES.has(item.status as LearningCatalogStatus)) return false;
  if (typeof item.requiresClassCode !== 'boolean' || !isDate(item.updatedAt, true)) return false;
  if (typeof item.feishuUrl !== 'string') return false;
  if (item.status === 'ready' && !isAllowedFeishuUrl(item.feishuUrl)) return false;
  if (item.feishuUrl && !isAllowedFeishuUrl(item.feishuUrl)) return false;
  return true;
}

export function validateLearningCatalog(value: unknown): value is LearningCatalogData {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<LearningCatalogData>;
  if (catalog.schemaVersion !== 1) return false;
  if (!Number.isInteger(catalog.catalogVersion) || Number(catalog.catalogVersion) <= 0) return false;
  if (!isDate(catalog.updatedAt)) return false;
  if (catalog.navigationUrl !== undefined && !isAllowedFeishuUrl(catalog.navigationUrl)) return false;
  if (!Array.isArray(catalog.lessons) || catalog.lessons.length > 500) return false;

  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const item of catalog.lessons) {
    if (!isLesson(item) || ids.has(item.id) || numbers.has(item.lessonNo)) return false;
    ids.add(item.id);
    numbers.add(item.lessonNo);
  }
  return true;
}

export function visibleCatalogLessons(lessons: LearningCatalogLesson[]): LearningCatalogLesson[] {
  return lessons.filter(item => item.status !== 'hidden');
}

export function filterCatalogLessons(lessons: LearningCatalogLesson[], query: string): LearningCatalogLesson[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return lessons;
  const numeric = normalized.replace(/^p\s*/, '');
  return lessons.filter(item => {
    if (/^\d+$/.test(numeric) && item.lessonNo === Number(numeric)) return true;
    const haystack = [`p${item.lessonNo}`, item.title, item.description, ...item.tags].join(' ').toLowerCase();
    return haystack.includes(normalized);
  });
}

export interface LearningCatalogGroup {
  stage: LearningCatalogStage;
  label: string;
  lessons: LearningCatalogLesson[];
}

export function groupCatalogLessons(lessons: LearningCatalogLesson[]): LearningCatalogGroup[] {
  const visible = visibleCatalogLessons(lessons);
  return CATALOG_STAGES.map(stage => ({
    stage,
    label: CATALOG_STAGE_LABELS[stage],
    lessons: visible.filter(item => item.stage === stage).sort((a, b) => a.lessonNo - b.lessonNo),
  }));
}

