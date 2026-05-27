import { useState } from 'react';
import { useCourseStore } from '../../stores/courseStore';
import ProblemViewer from './ProblemViewer';
import PasswordUnlock from './PasswordUnlock';
import type { Lesson } from '../../types/course';

interface Props { lesson: Lesson; }

const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'review', label: '温故知新', icon: '📄' },
  { key: 'inClassCodes', label: '课上 OJ', icon: '💻' },
  { key: 'inClassQuiz', label: '课堂小测', icon: '📝' },
  { key: 'homework', label: '课后作业', icon: '📋' },
  { key: 'extended', label: '扩展练习', icon: '📌' },
];

export default function LessonCard({ lesson }: Props) {
  const [open, setOpen] = useState(false);
  const unlockedLessons = useCourseStore(s => s.unlockedLessons);
  const isUnlocked = unlockedLessons.has(lesson.id);

  // Count problems by type for header summary
  const homeworkCount = (lesson.homework || []).length;

  return (
    <div className={`lesson-card ${open ? 'expanded' : ''}`}>
      <div className="lesson-header-row" onClick={() => setOpen(!open)}>
        <span className="lesson-arrow-sm">{open ? '▼' : '▶'}</span>
        <span className="lesson-order">{lesson.order}</span>
        <div className="lesson-title-wrap">
          <span className="lesson-title">{lesson.title}</span>
        </div>
        <div className="lesson-header-meta">
          {homeworkCount > 0 && <span className="meta-badge meta-homework">{homeworkCount}题作业</span>}
        </div>
        {lesson.password && !isUnlocked && <span className="lesson-lock-icon">🔒</span>}
      </div>

      {open && (
        <div className="lesson-body">
          {!isUnlocked && lesson.password ? (
            <PasswordUnlock lesson={lesson} onUnlock={() => {}} />
          ) : (
            <div className="lesson-sections">
              {SECTIONS.map(({ key, label, icon }) => {
                const problems = (lesson as unknown as Record<string, unknown>)[key] as import('../../types/course').Problem[] | undefined;
                if (!problems || problems.length === 0) return null;
                return (
                  <div key={key} className="problem-section">
                    <div className="section-label">
                      <span>{icon}</span> {label}
                      <span className="section-count">{problems.length}</span>
                    </div>
                    <div className="section-problems">
                      {problems.map(p => (
                        <ProblemViewer key={p.id} problem={p} sectionType={key as 'review' | 'inClassCodes' | 'inClassQuiz' | 'homework' | 'extended'} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
