import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_NAVIGATION_URL = 'https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg';

const STAGES = new Set(['C1', 'C2', 'C3', 'C4']);

function parseLessonNo(lesson) {
  const fromId = Number.parseInt(String(lesson?.id || '').replace(/^lesson-/, ''), 10);
  const value = Number.isInteger(fromId) && fromId > 0 ? fromId : Number(lesson?.order);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`无法识别课号：${lesson?.id || lesson?.title || '未知课程'}`);
  return value;
}

function stripLessonPrefix(title, lessonNo) {
  return String(title || '').replace(new RegExp(`^P${lessonNo}[-—\\s]*`, 'i'), '').trim();
}

function normalizeStage(stageId) {
  const stage = String(stageId || '').slice(0, 2).toUpperCase();
  if (!STAGES.has(stage)) throw new Error(`未知课程阶段：${stageId}`);
  return stage;
}

function flattenLessons(lessonsData) {
  if (!Array.isArray(lessonsData?.stages)) throw new Error('lessons.json 缺少 stages');
  return lessonsData.stages.flatMap(stage => (stage.lessons || []).map(lesson => ({
    ...lesson,
    stageId: stage.id,
  })));
}

export function buildLearningCatalog({
  cardIndex,
  lessonsData,
  previousCatalog,
  now = new Date(),
  catalogVersion,
}) {
  const cardsByNo = new Map((cardIndex?.lessons || []).map(item => [Number(item.lessonNo), item]));
  const previousByNo = new Map((previousCatalog?.lessons || []).map(item => [Number(item.lessonNo), item]));
  const day = now.toISOString().slice(0, 10);
  const version = Number(catalogVersion || previousCatalog?.catalogVersion || 1);
  if (!Number.isInteger(version) || version <= 0) throw new Error('catalogVersion 必须为正整数');

  const ids = new Set();
  const numbers = new Set();
  const lessons = flattenLessons(lessonsData).map(rawLesson => {
    const lessonNo = parseLessonNo(rawLesson);
    if (numbers.has(lessonNo)) throw new Error(`课号重复：P${lessonNo}`);
    numbers.add(lessonNo);

    const card = cardsByNo.get(lessonNo);
    const previous = previousByNo.get(lessonNo);
    const id = previous?.id || `lesson-material-p${String(lessonNo).padStart(3, '0')}`;
    if (ids.has(id)) throw new Error(`资料 ID 重复：${id}`);
    ids.add(id);

    const title = card?.title || stripLessonPrefix(rawLesson.title, lessonNo);
    const feishuUrl = previous?.feishuUrl || card?.feishuUrl || '';
    const isReady = Boolean(feishuUrl);
    const knowledgeTags = Array.isArray(rawLesson.knowledgePoints)
      ? rawLesson.knowledgePoints.filter(item => typeof item === 'string' && item.trim()).slice(0, 8)
      : [];

    return {
      id,
      lessonNo,
      title,
      stage: normalizeStage(rawLesson.stageId || card?.stage),
      description: previous?.description || String(rawLesson.summary || '').trim()
        || `P${lessonNo} ${title}配套讲义与知识卡。`,
      tags: previous?.tags || knowledgeTags,
      feishuUrl,
      status: previous?.status || (isReady ? 'ready' : 'coming_soon'),
      requiresClassCode: previous?.requiresClassCode ?? false,
      updatedAt: previous?.updatedAt || (isReady ? cardIndex?.updated || day : day),
    };
  }).sort((a, b) => a.lessonNo - b.lessonNo);

  return {
    schemaVersion: 1,
    catalogVersion: version,
    updatedAt: now.toISOString(),
    navigationUrl: previousCatalog?.navigationUrl || DEFAULT_NAVIGATION_URL,
    lessons,
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runCli() {
  const courseDir = path.join(ROOT, 'public', 'course-data');
  const outputPath = path.join(courseDir, 'learning-catalog.json');
  const versionPath = path.join(courseDir, 'learning-catalog.version.json');
  const previousCatalog = fs.existsSync(outputPath) ? readJson(outputPath) : undefined;
  const previousVersion = fs.existsSync(versionPath) ? readJson(versionPath).version : undefined;
  const catalog = buildLearningCatalog({
    cardIndex: readJson(path.join(courseDir, 'course-card-index.json')),
    lessonsData: readJson(path.join(courseDir, 'lessons.json')),
    previousCatalog,
    catalogVersion: previousVersion || previousCatalog?.catalogVersion || 1,
    now: new Date(),
  });

  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  fs.writeFileSync(versionPath, `${JSON.stringify({
    version: catalog.catalogVersion,
    published: catalog.updatedAt.slice(0, 10),
  }, null, 2)}\n`);
  const ready = catalog.lessons.filter(item => item.status === 'ready').length;
  console.log(`学习资料目录已生成：${catalog.lessons.length} 课，${ready} 课已就绪，${catalog.lessons.length - ready} 课制作中。`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
