import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGES = new Set(['C1', 'C2', 'C3', 'C4']);
const STATUSES = new Set(['ready', 'coming_soon', 'hidden']);

function isFeishuDoc(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname.endsWith('.feishu.cn') || url.hostname.endsWith('.larksuite.com'))
      && url.pathname.includes('/docx/');
  } catch { return false; }
}

export function validateLearningCatalogFiles(catalog, versionInfo) {
  const errors = [];
  if (catalog?.schemaVersion !== 1) errors.push('schemaVersion 必须为 1');
  if (!Number.isInteger(catalog?.catalogVersion) || catalog.catalogVersion <= 0) errors.push('catalogVersion 必须为正整数');
  if (versionInfo?.version !== catalog?.catalogVersion) errors.push('版本文件与目录 catalogVersion 不一致');
  if (!Number.isFinite(Date.parse(catalog?.updatedAt || ''))) errors.push('updatedAt 不是有效日期');
  if (catalog?.navigationUrl && !isFeishuDoc(catalog.navigationUrl)) errors.push('总导航必须是飞书 docx HTTPS 链接');
  if (!Array.isArray(catalog?.lessons)) return [...errors, 'lessons 必须是数组'];

  const ids = new Set();
  const lessonNumbers = new Set();
  for (const [index, lesson] of catalog.lessons.entries()) {
    const prefix = `lessons[${index}]`;
    if (!lesson || typeof lesson !== 'object') { errors.push(`${prefix} 不是对象`); continue; }
    if (!/^lesson-material-p\d{3,}$/.test(lesson.id || '')) errors.push(`${prefix}.id 格式错误`);
    else if (ids.has(lesson.id)) errors.push(`资料 ID 重复：${lesson.id}`);
    ids.add(lesson.id);
    if (!Number.isInteger(lesson.lessonNo) || lesson.lessonNo <= 0) errors.push(`${prefix}.lessonNo 必须为正整数`);
    else if (lessonNumbers.has(lesson.lessonNo)) errors.push(`课号重复：P${lesson.lessonNo}`);
    lessonNumbers.add(lesson.lessonNo);
    if (typeof lesson.title !== 'string' || !lesson.title.trim()) errors.push(`${prefix}.title 不能为空`);
    if (!STAGES.has(lesson.stage)) errors.push(`${prefix}.stage 无效`);
    if (!STATUSES.has(lesson.status)) errors.push(`${prefix}.status 无效`);
    if (typeof lesson.requiresClassCode !== 'boolean') errors.push(`${prefix}.requiresClassCode 必须为布尔值`);
    if (!Array.isArray(lesson.tags) || lesson.tags.some(tag => typeof tag !== 'string')) errors.push(`${prefix}.tags 必须是字符串数组`);
    if (typeof lesson.description !== 'string') errors.push(`${prefix}.description 必须是字符串`);
    if (typeof lesson.feishuUrl !== 'string') errors.push(`${prefix}.feishuUrl 必须是字符串`);
    else if (lesson.feishuUrl && !isFeishuDoc(lesson.feishuUrl)) errors.push(`${prefix}.feishuUrl 不是允许的飞书链接`);
    if (lesson.status === 'ready' && !isFeishuDoc(lesson.feishuUrl)) errors.push(`${prefix} 已上线但缺少有效飞书链接`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.updatedAt || '')) errors.push(`${prefix}.updatedAt 必须是 YYYY-MM-DD`);
  }
  return errors;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'course-data', filename), 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const catalog = readJson('learning-catalog.json');
  const versionInfo = readJson('learning-catalog.version.json');
  const errors = validateLearningCatalogFiles(catalog, versionInfo);
  if (errors.length) {
    console.error(`学习资料目录校验失败（${errors.length} 项）：\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    const ready = catalog.lessons.filter(item => item.status === 'ready').length;
    console.log(`学习资料目录校验通过：${catalog.lessons.length} 课，${ready} 课已上线。`);
  }
}
