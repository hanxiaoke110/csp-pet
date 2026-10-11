import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLearningCatalog } from './build-learning-catalog.mjs';

const cardIndex = {
  updated: '2026-07-15',
  lessons: [
    { lessonNo: 1, title: '基础框架', stage: 'C1 入门阶段', feishuUrl: 'https://scncdgmg7m6w.feishu.cn/docx/one' },
    { lessonNo: 2, title: 'cin 输入', stage: 'C1 入门阶段', feishuUrl: 'https://scncdgmg7m6w.feishu.cn/docx/two' },
  ],
};

const lessonsData = {
  stages: [{
    id: 'C1',
    lessons: [
      { id: 'lesson-1', order: 1, title: 'P1-基础框架', summary: '', knowledgePoints: [] },
      { id: 'lesson-2', order: 2, title: 'P2-cin 输入', summary: '', knowledgePoints: [] },
      { id: 'lesson-3', order: 3, title: 'P3-整型', summary: '整数数据的存储与运算。', knowledgePoints: ['int'] },
    ],
  }],
};

test('migrates legacy URLs and marks lessons without documents as coming soon', () => {
  const catalog = buildLearningCatalog({
    cardIndex,
    lessonsData,
    now: new Date('2026-10-11T08:00:00+08:00'),
    catalogVersion: 4,
  });

  assert.equal(catalog.catalogVersion, 4);
  assert.equal(catalog.lessons.length, 3);
  assert.equal(catalog.lessons[0].feishuUrl, cardIndex.lessons[0].feishuUrl);
  assert.equal(catalog.lessons[1].feishuUrl, cardIndex.lessons[1].feishuUrl);
  assert.equal(catalog.lessons[2].status, 'coming_soon');
  assert.equal(catalog.lessons[2].feishuUrl, '');
  assert.equal(catalog.lessons[2].description, '整数数据的存储与运算。');
});

test('preserves published metadata when rebuilding the catalog', () => {
  const previousCatalog = {
    catalogVersion: 5,
    navigationUrl: 'https://scncdgmg7m6w.feishu.cn/docx/nav',
    lessons: [{
      id: 'lesson-material-p001',
      lessonNo: 1,
      description: '已编辑说明',
      tags: ['新标签'],
      feishuUrl: 'https://scncdgmg7m6w.feishu.cn/docx/new-one',
      status: 'ready',
      requiresClassCode: true,
      updatedAt: '2026-10-10',
    }],
  };
  const catalog = buildLearningCatalog({
    cardIndex,
    lessonsData,
    previousCatalog,
    now: new Date('2026-10-11T08:00:00+08:00'),
  });
  assert.equal(catalog.catalogVersion, 5);
  assert.equal(catalog.lessons[0].feishuUrl, previousCatalog.lessons[0].feishuUrl);
  assert.equal(catalog.lessons[0].requiresClassCode, true);
  assert.deepEqual(catalog.lessons[0].tags, ['新标签']);
});

test('rejects duplicate lesson numbers', () => {
  const invalid = {
    stages: [{ id: 'C1', lessons: [
      { id: 'lesson-1', order: 1, title: 'P1-A' },
      { id: 'lesson-1', order: 1, title: 'P1-B' },
    ] }],
  };
  assert.throws(() => buildLearningCatalog({ cardIndex, lessonsData: invalid, now: new Date(), catalogVersion: 1 }), /课号重复/);
});
