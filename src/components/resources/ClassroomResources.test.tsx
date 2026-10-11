import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ClassroomResources from './ClassroomResources';
import type { LearningCatalogData } from './types';

const catalog: LearningCatalogData = {
  schemaVersion: 1,
  catalogVersion: 1,
  updatedAt: '2026-10-11T00:00:00.000Z',
  lessons: [
    {
      id: 'lesson-material-p001', lessonNo: 1, title: '基础框架', stage: 'C1',
      description: '配套讲义', tags: ['入门'], status: 'ready', requiresClassCode: false,
      feishuUrl: 'https://example.feishu.cn/docx/abc', updatedAt: '2026-10-11',
    },
    {
      id: 'lesson-material-p070', lessonNo: 70, title: '高级专题', stage: 'C4',
      description: '正在制作', tags: [], status: 'coming_soon', requiresClassCode: true,
      feishuUrl: '', updatedAt: '2026-10-11',
    },
  ],
};

describe('ClassroomResources', () => {
  it('renders lessons in stage accordions without course rewards', () => {
    const html = renderToStaticMarkup(
      <ClassroomResources catalog={catalog} query="" hasClassCode={false} onOpen={vi.fn()} onCopy={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    expect(html).toContain('C1 入门阶段');
    expect(html).toContain('P1');
    expect(html).toContain('基础框架');
    expect(html).toContain('C4 提高阶段');
    expect(html).not.toContain('金币');
    expect(html).not.toContain('经验');
  });

  it('shows a class-code gate and coming-soon state', () => {
    const html = renderToStaticMarkup(
      <ClassroomResources catalog={catalog} query="70" hasClassCode={false} onOpen={vi.fn()} onCopy={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    expect(html).toContain('需班级码');
    expect(html).toContain('绑定班级码');
    expect(html).toContain('制作中');
  });
});
