import { describe, expect, it } from 'vitest';
import { validateLearningCatalogFiles } from './validate-learning-catalog.mjs';

function fixture() {
  return {
    catalog: {
      schemaVersion: 1, catalogVersion: 3, updatedAt: '2026-10-11T00:00:00.000Z',
      navigationUrl: 'https://school.feishu.cn/docx/navigation',
      lessons: [{
        id: 'lesson-material-p001', lessonNo: 1, title: '基础框架', stage: 'C1', description: '讲义', tags: [],
        feishuUrl: 'https://school.feishu.cn/docx/lesson', status: 'ready', requiresClassCode: false, updatedAt: '2026-10-11',
      }],
    },
    version: { version: 3, published: '2026-10-11' },
  };
}

describe('validateLearningCatalogFiles', () => {
  it('accepts a valid catalog', () => {
    const data = fixture();
    expect(validateLearningCatalogFiles(data.catalog, data.version)).toEqual([]);
  });
  it('rejects duplicate lessons, bad URLs and mismatched versions', () => {
    const data = fixture();
    data.version.version = 2;
    data.catalog.lessons.push({ ...data.catalog.lessons[0], feishuUrl: 'https://example.com/not-feishu' });
    const errors = validateLearningCatalogFiles(data.catalog, data.version);
    expect(errors.some(error => error.includes('不一致'))).toBe(true);
    expect(errors.some(error => error.includes('重复'))).toBe(true);
    expect(errors.some(error => error.includes('飞书链接'))).toBe(true);
  });
  it('allows a coming-soon lesson without a URL', () => {
    const data = fixture();
    data.catalog.lessons[0].status = 'coming_soon';
    data.catalog.lessons[0].feishuUrl = '';
    expect(validateLearningCatalogFiles(data.catalog, data.version)).toEqual([]);
  });
});
