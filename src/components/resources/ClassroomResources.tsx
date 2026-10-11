import { useEffect, useMemo, useState } from 'react';
import { filterCatalogLessons, groupCatalogLessons } from './learningCatalog';
import type { LearningCatalogData, LearningCatalogLesson, LearningCatalogStage } from './types';

interface ClassroomResourcesProps {
  catalog: LearningCatalogData;
  query: string;
  hasClassCode: boolean;
  onOpen: (lesson: LearningCatalogLesson) => void;
  onCopy: (url: string) => void;
  onOpenSettings: () => void;
}

const STAGE_ACCENTS: Record<LearningCatalogStage, string> = {
  C1: '#10b981',
  C2: '#3b82f6',
  C3: '#8b5cf6',
  C4: '#f59e0b',
};

export default function ClassroomResources({
  catalog,
  query,
  hasClassCode,
  onOpen,
  onCopy,
  onOpenSettings,
}: ClassroomResourcesProps) {
  const groups = useMemo(
    () => groupCatalogLessons(filterCatalogLessons(catalog.lessons, query)),
    [catalog.lessons, query],
  );
  const [expanded, setExpanded] = useState<Set<LearningCatalogStage>>(() => new Set(
    query.trim() ? groups.filter(group => group.lessons.length > 0).map(group => group.stage) : ['C1'],
  ));

  useEffect(() => {
    if (!query.trim()) return;
    setExpanded(new Set(groups.filter(group => group.lessons.length > 0).map(group => group.stage)));
  }, [groups, query]);

  const toggle = (stage: LearningCatalogStage) => {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const total = groups.reduce((sum, group) => sum + group.lessons.length, 0);
  if (total === 0) return <p className="learning-empty-state">没有匹配的课堂资料。</p>;

  return (
    <div className="classroom-resources">
      {groups.map(group => {
        if (query.trim() && group.lessons.length === 0) return null;
        const isExpanded = expanded.has(group.stage);
        const readyCount = group.lessons.filter(item => item.status === 'ready').length;
        const first = group.lessons[0]?.lessonNo;
        const last = group.lessons[group.lessons.length - 1]?.lessonNo;
        return (
          <section key={group.stage} className="learning-stage-group">
            <button
              type="button"
              className="learning-stage-toggle"
              aria-expanded={isExpanded}
              onClick={() => toggle(group.stage)}
            >
              <span className="learning-stage-arrow">{isExpanded ? '▼' : '▶'}</span>
              <span className="learning-stage-dot" style={{ background: STAGE_ACCENTS[group.stage] }} />
              <span className="learning-stage-title">{group.label}</span>
              {first && last && <span className="learning-stage-range">P{first}–P{last}</span>}
              <span className="learning-stage-count">{readyCount}/{group.lessons.length} 已上线</span>
            </button>

            {isExpanded && (
              <div className="learning-lesson-list">
                {group.lessons.map(lesson => {
                  const locked = lesson.requiresClassCode && !hasClassCode;
                  const isReady = lesson.status === 'ready';
                  return (
                    <article key={lesson.id} className="learning-lesson-row">
                      <div className="learning-lesson-number">P{lesson.lessonNo}</div>
                      <div className="learning-lesson-content">
                        <div className="learning-lesson-heading">
                          <strong>{lesson.title}</strong>
                          {!isReady && <span className="learning-status-badge coming">制作中</span>}
                          {locked && <span className="learning-status-badge locked">需班级码</span>}
                        </div>
                        <p>{lesson.description}</p>
                        {lesson.tags.length > 0 && (
                          <div className="learning-lesson-tags">
                            {lesson.tags.slice(0, 5).map(tag => <span key={tag}>{tag}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="learning-lesson-actions">
                        {locked ? (
                          <button className="mode-btn" onClick={onOpenSettings}>绑定班级码</button>
                        ) : lesson.feishuUrl ? (
                          <button className="mode-btn" onClick={() => onOpen(lesson)}>
                            {isReady ? '打开资料' : '查看预告'}
                          </button>
                        ) : (
                          <button className="mode-btn" disabled>制作中</button>
                        )}
                        {lesson.feishuUrl && (
                          <button className="learning-copy-link" onClick={() => onCopy(lesson.feishuUrl)}>复制链接</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
