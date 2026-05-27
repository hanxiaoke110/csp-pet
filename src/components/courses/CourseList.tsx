import { useCourseStore } from '../../stores/courseStore';
import LessonCard from './LessonCard';

export default function CourseList() {
  const stages = useCourseStore(s => s.stages);
  const searchQuery = useCourseStore(s => s.searchQuery);
  const setSearchQuery = useCourseStore(s => s.setSearchQuery);
  const expandedStages = useCourseStore(s => s.expandedStages);
  const toggleStage = useCourseStore(s => s.toggleStage);
  const getFiltered = useCourseStore(s => s.getFiltered);

  return (
    <div className="course-list">
      <div className="course-header">
        <h2>📚 课程目录</h2>
        <input
          type="text" className="search-input" placeholder="搜索课程、知识点、题目..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="stages">
        {stages.map(stage => {
          const filtered = getFiltered(stage);
          if (filtered.length === 0 && searchQuery) return null;
          const isOpen = expandedStages.has(stage.id);
          return (
            <div key={stage.id} className="stage-item">
              <div className="stage-header" onClick={() => toggleStage(stage.id)}>
                <span className="stage-arrow">{isOpen ? '▼' : '▶'}</span>
                <span className="stage-dot" style={{ background: stage.color }} />
                <span className="stage-name">{stage.name}</span>
                <span className="stage-count">{filtered.length} 课</span>
              </div>
              {isOpen && (
                <div className="stage-lessons">
                  {filtered.map(lesson => (
                    <LessonCard key={lesson.id} lesson={lesson} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {stages.length === 0 && (
          <div className="empty-state">没有课程数据，请检查课程包是否正确加载。</div>
        )}
      </div>
    </div>
  );
}
