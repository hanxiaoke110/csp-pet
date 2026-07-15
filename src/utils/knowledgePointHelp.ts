/**
 * 知识点帮助工具 — 加载题目映射和知识点目录，提供查询函数
 *
 * 数据来源：
 *   - public/course-data/question-knowledge-mapping.json
 *   - public/course-data/knowledge-points.json
 *   - public/course-data/learning-resources.json
 *
 * 两个 JSON 均为轻量数据（mapping ~80KB, kp ~15KB），直接 fetch 即可。
 * 后续启用 REMOTE_RESOURCE_INDEX_URL 时可升级为远程索引。
 */

import type { LearningResource } from '../components/resources/types';

// ---- 知识点目录条目 ----

export interface KnowledgePoint {
  id: string;
  name: string;
  stage: string;
  batch: string;
  summary: string;
  feishuCardUrl: string;
  feishuCardTitle: string;
  feishuLectureUrl: string;
  feishuLectureTitle: string;
  prerequisiteIds: string[];
  relatedLessonIds: number[];
  isClassCodeRequired: boolean;
}

interface KnowledgePointsData {
  version: number;
  updated: string;
  totalNavigationUrl: string;
  totalNavigationTitle: string;
  items: KnowledgePoint[];
}

export interface KnowledgeLecture {
  id: string;
  title: string;
  sourceFile: string;
  knowledgePointIds: string[];
  knowledgePointNames: string[];
  stage: string;
  batch: string;
  feishuUrl: string;
  cardUrl: string;
}

interface KnowledgeLecturesData {
  version: number;
  updated: string;
  lectures: KnowledgeLecture[];
}

// ---- 题目映射 ----

interface QuestionMapping {
  primary: string | null;
  secondary?: string[];
  _method?: string;
  _needsReview?: boolean;
}

interface QuestionKnowledgeMappingData {
  version: number;
  updated: string;
  mappings: Record<string, QuestionMapping>;
}

// ---- 缓存 ----

let _kpData: KnowledgePointsData | null = null;
let _mappingData: QuestionKnowledgeMappingData | null = null;
let _lectureData: KnowledgeLecturesData | null = null;
let _kpMap: Map<string, KnowledgePoint> | null = null;
let _lectureMap: Map<string, KnowledgeLecture[]> | null = null;
let _loading = false;
let _loadPromise: Promise<void> | null = null;

// ---- 加载 ----

async function loadJson<T>(path: string): Promise<T> {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const url = `${baseUrl}${path}`.replace(/\/+/g, '/');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
  return resp.json();
}

export async function loadKnowledgePointData(): Promise<void> {
  if (_kpData && _mappingData && _lectureData) return;
  if (_loading && _loadPromise) return _loadPromise;

  _loading = true;
  _loadPromise = (async () => {
    try {
      const [kpData, mappingData, lectureData] = await Promise.all([
        loadJson<KnowledgePointsData>('course-data/knowledge-points.json'),
        loadJson<QuestionKnowledgeMappingData>('course-data/question-knowledge-mapping.json'),
        loadJson<KnowledgeLecturesData>('course-data/knowledge-lectures.json').catch(() => ({
          version: 0,
          updated: '',
          lectures: [],
        })),
      ]);
      _kpData = kpData;
      _mappingData = mappingData;
      _lectureData = lectureData;

      // 构建快速查询 Map
      _kpMap = new Map();
      for (const item of kpData.items) {
        _kpMap.set(item.id, item);
      }
      _lectureMap = new Map();
      for (const lecture of lectureData.lectures || []) {
        for (const kpId of lecture.knowledgePointIds || []) {
          const list = _lectureMap.get(kpId) || [];
          list.push(lecture);
          _lectureMap.set(kpId, list);
        }
      }
    } catch (e) {
      console.warn('[KnowledgePointHelp] Failed to load data:', e);
      // 不抛异常——加载失败不阻塞答题流程
    } finally {
      _loading = false;
    }
  })();
  return _loadPromise;
}

// ---- 查询 ----

/**
 * 根据题目 ID 获取主知识点信息。
 * 返回 null 表示：未建立映射 / 数据未加载 / 主知识点不存在。
 */
export function getPrimaryKnowledgePoint(questionId: string): KnowledgePoint | null {
  if (!_mappingData || !_kpMap) return null;
  const mapping = _mappingData.mappings[questionId];
  if (!mapping?.primary) return null;
  return _kpMap.get(mapping.primary) || null;
}

/**
 * 根据题目 ID 获取主知识点下的专题详解。
 * 一个知识点可能有多份详解（例如贪心、二分各有两个专题）。
 */
export function getPrimaryKnowledgeLectures(questionId: string): KnowledgeLecture[] {
  const kp = getPrimaryKnowledgePoint(questionId);
  if (!kp || !_lectureMap) return [];
  return _lectureMap.get(kp.id) || [];
}

/**
 * 获取题目的辅助知识点（最多 2 个）。
 */
export function getSecondaryKnowledgePoints(questionId: string): KnowledgePoint[] {
  if (!_mappingData || !_kpMap) return [];
  const mapping = _mappingData.mappings[questionId];
  if (!mapping?.secondary || mapping.secondary.length === 0) return [];
  return mapping.secondary.map(id => _kpMap!.get(id)).filter(Boolean) as KnowledgePoint[];
}

/**
 * 检查某道题是否已有映射（含待复核标记）。
 */
export function hasMapping(questionId: string): boolean {
  if (!_mappingData) return false;
  const m = _mappingData.mappings[questionId];
  return !!(m?.primary);
}

/**
 * 获取与主知识点关联的学习资料卡片（来自 learning-resources.json）。
 * 需要外部传入已加载的资源列表（避免循环依赖）。
 */
export function getRelatedResources(
  kp: KnowledgePoint,
  allResources: LearningResource[],
): LearningResource[] {
  if (!kp.relatedLessonIds || kp.relatedLessonIds.length === 0) return [];
  const lessonSet = new Set(kp.relatedLessonIds);
  return allResources.filter(r => r.lessonNo && lessonSet.has(r.lessonNo));
}

/**
 * 预加载：在应用初始化时调用（不阻塞渲染）。
 */
export function preloadKnowledgePointData(): void {
  loadKnowledgePointData().catch(() => {});
}
