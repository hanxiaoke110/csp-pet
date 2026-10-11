import { describe, expect, it } from 'vitest';
import bundledCatalog from '../../../public/course-data/learning-catalog.json';
import {
  filterCatalogLessons,
  groupCatalogLessons,
  validateLearningCatalog,
  visibleCatalogLessons,
} from './learningCatalog';
import type { LearningCatalogData, LearningCatalogLesson } from './types';

const lesson = (overrides: Partial<LearningCatalogLesson> = {}): LearningCatalogLesson => ({
  id: 'lesson-material-p001',
  lessonNo: 1,
  title: '基础框架',
  stage: 'C1',
  description: 'C++ 程序的基本结构。',
  tags: ['C++', '入门'],
  feishuUrl: 'https://scncdgmg7m6w.feishu.cn/docx/PDtpdjcijoyjbDxPVDscY93onMh',
  status: 'ready',
  requiresClassCode: false,
  updatedAt: '2026-10-11',
  ...overrides,
});

const catalog = (lessons: LearningCatalogLesson[]): LearningCatalogData => ({
  schemaVersion: 1,
  catalogVersion: 1,
  updatedAt: '2026-10-11T08:00:00+08:00',
  navigationUrl: 'https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg',
  lessons,
});

describe('learning catalog validation', () => {
  it('accepts the bundled 100 slots without exposing unfinished reserved slots', () => {
    const bundled = bundledCatalog as LearningCatalogData;
    expect(validateLearningCatalog(bundled)).toBe(true);
    expect(bundled.lessons).toHaveLength(100);
    expect(bundled.lessons.map(item => item.lessonNo)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(visibleCatalogLessons(bundled.lessons)).toHaveLength(77);
    expect(bundled.lessons.filter(item => item.lessonNo >= 78).every(item => item.status === 'hidden' && item.feishuUrl === '')).toBe(true);
  });

  it('accepts ready and coming-soon Feishu lessons', () => {
    expect(validateLearningCatalog(catalog([
      lesson(),
      lesson({ id: 'lesson-material-p070', lessonNo: 70, title: '递归算法（一）', stage: 'C3', feishuUrl: '', status: 'coming_soon' }),
    ]))).toBe(true);
  });

  it.each([
    ['duplicate id', [lesson(), lesson({ lessonNo: 2 })]],
    ['duplicate lesson number', [lesson(), lesson({ id: 'lesson-material-p002' })]],
    ['invalid stage', [lesson({ stage: 'C9' as 'C1' })]],
    ['invalid status', [lesson({ status: 'draft' as 'ready' })]],
    ['non-Feishu URL', [lesson({ feishuUrl: 'https://example.com/docx/a' })]],
    ['insecure URL', [lesson({ feishuUrl: 'http://scncdgmg7m6w.feishu.cn/docx/a' })]],
    ['ready without URL', [lesson({ feishuUrl: '' })]],
    ['invalid date', [lesson({ updatedAt: 'yesterday' })]],
  ])('rejects %s', (_name, lessons) => {
    expect(validateLearningCatalog(catalog(lessons))).toBe(false);
  });

  it('rejects more than 500 entries and malformed catalog timestamps', () => {
    const many = Array.from({ length: 501 }, (_, index) => lesson({
      id: `lesson-material-p${String(index + 1).padStart(3, '0')}`,
      lessonNo: index + 1,
    }));
    expect(validateLearningCatalog(catalog(many))).toBe(false);
    expect(validateLearningCatalog({ ...catalog([lesson()]), updatedAt: 'not-a-date' })).toBe(false);
  });
});

describe('learning catalog helpers', () => {
  const lessons = [
    lesson(),
    lesson({ id: 'lesson-material-p069', lessonNo: 69, title: '栈', stage: 'C3', tags: ['数据结构'] }),
    lesson({ id: 'lesson-material-p070', lessonNo: 70, title: '递归算法（一）', stage: 'C3', feishuUrl: '', status: 'coming_soon' }),
    lesson({ id: 'lesson-material-p071', lessonNo: 71, title: '内部草稿', stage: 'C3', status: 'hidden' }),
  ];

  it('hides hidden entries and searches by P number, plain number, title, and tag', () => {
    const visible = visibleCatalogLessons(lessons);
    expect(visible).toHaveLength(3);
    expect(filterCatalogLessons(visible, 'P69').map(item => item.lessonNo)).toEqual([69]);
    expect(filterCatalogLessons(visible, '69').map(item => item.lessonNo)).toEqual([69]);
    expect(filterCatalogLessons(visible, '栈').map(item => item.lessonNo)).toEqual([69]);
    expect(filterCatalogLessons(visible, '数据结构').map(item => item.lessonNo)).toEqual([69]);
  });

  it('groups in C1-C4 order and sorts lessons by number', () => {
    const groups = groupCatalogLessons(lessons.slice().reverse());
    expect(groups.map(group => group.stage)).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(groups.find(group => group.stage === 'C3')?.lessons.map(item => item.lessonNo)).toEqual([69, 70]);
  });
});
