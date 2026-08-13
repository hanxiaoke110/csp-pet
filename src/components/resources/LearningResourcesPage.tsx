import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';

type ViewKey = 'courses' | 'firstRound' | 'secondRound';
type StageFilter = 'all' | 'C1 入门阶段' | 'C2 基础阶段' | 'C3 进阶阶段';

interface CourseCardSet {
  title: string;
  use: string;
}

interface CourseLessonResource {
  lessonNo: number;
  title: string;
  stage: StageFilter;
  feishuUrl: string;
  documentId: string;
  cards: {
    preclassFable: CourseCardSet;
    knowledgeSummary: CourseCardSet;
    reviewCombo: CourseCardSet;
  };
}

interface CourseCardIndexData {
  updated: string;
  lessons: CourseLessonResource[];
}

interface KnowledgePoint {
  id: string;
  name: string;
  stage: string;
  batch?: string;
  summary?: string;
  feishuCardUrl?: string;
  existingQuizKps?: string[];
  relatedLessonIds?: number[];
  isClassCodeRequired?: boolean;
  questionCount?: number;
}

interface KnowledgePointsData {
  updated?: string;
  totalNavigationUrl?: string;
  totalNavigationTitle?: string;
  items: KnowledgePoint[];
}

interface KnowledgeLecture {
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
  updated: string;
  lectures: KnowledgeLecture[];
}

const VIEWS: { key: ViewKey; label: string; hint: string }[] = [
  { key: 'courses', label: '常规课课程目录', hint: 'P1-P69，后续随课程继续增加' },
  { key: 'firstRound', label: 'CSP-J 一轮知识点', hint: '知识点、专题、真题梳理、535计划' },
  { key: 'secondRound', label: 'CSP-J 二轮知识点', hint: '复赛算法、代码模板、真题讲评' },
];

const RESCUE_URL = 'https://scncdgmg7m6w.feishu.cn/docx/GxWbddqOno4LcVxKD7LcqalrnTb';
const SECOND_ROUND_URL = 'https://scncdgmg7m6w.feishu.cn/docx/UHIOdn8jOo4Lqkx98AScdsmqnre';

const STAGES: { key: StageFilter; label: string }[] = [
  { key: 'all', label: '全部阶段' },
  { key: 'C1 入门阶段', label: 'C1 入门' },
  { key: 'C2 基础阶段', label: 'C2 基础' },
  { key: 'C3 进阶阶段', label: 'C3 进阶' },
];

const STAGE_LABELS: Record<string, StageFilter> = {
  C1: 'C1 入门阶段',
  C2: 'C2 基础阶段',
  C3: 'C3 进阶阶段',
  C4: 'C3 进阶阶段',
};

const CARD_TYPES = [
  { key: 'preclassFable', label: '课前寓言', color: '#8b5cf6' },
  { key: 'knowledgeSummary', label: '知识总览', color: '#2563eb' },
  { key: 'reviewCombo', label: '复习结合', color: '#0f766e' },
] as const;

async function fetchJson<T>(path: string): Promise<T> {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`${path} HTTP ${resp.status}`);
  return resp.json();
}

function includesQuery(parts: Array<string | number | undefined>, query: string): boolean {
  if (!query) return true;
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return hay.includes(query.toLowerCase());
}

function compactTitle(title: string): string {
  return title.replace(/^专题详解｜/, '').replace(/^知识卡｜/, '');
}

export default function LearningResourcesPage() {
  const navigate = useNavigate();
  const [courseData, setCourseData] = useState<CourseCardIndexData | null>(null);
  const [kpData, setKpData] = useState<KnowledgePointsData | null>(null);
  const [lectureData, setLectureData] = useState<KnowledgeLecturesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>('courses');
  const [stage, setStage] = useState<StageFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [courseCards, knowledgePoints, lectures] = await Promise.all([
          fetchJson<CourseCardIndexData>('/course-data/course-card-index.json'),
          fetchJson<KnowledgePointsData>('/course-data/knowledge-points.json'),
          fetchJson<KnowledgeLecturesData>('/course-data/knowledge-lectures.json'),
        ]);
        if (!cancelled) {
          setCourseData(courseCards);
          setKpData(knowledgePoints);
          setLectureData(lectures);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const lectureByKp = useMemo(() => {
    const map = new Map<string, KnowledgeLecture[]>();
    for (const lecture of lectureData?.lectures || []) {
      for (const kpId of lecture.knowledgePointIds || []) {
        const list = map.get(kpId) || [];
        list.push(lecture);
        map.set(kpId, list);
      }
    }
    return map;
  }, [lectureData]);

  const courses = useMemo(() => {
    return (courseData?.lessons || [])
      .filter(item => stage === 'all' || item.stage === stage)
      .filter(item => includesQuery([item.lessonNo, item.title, item.stage], query));
  }, [courseData, query, stage]);

  const lectures = useMemo(() => {
    return (lectureData?.lectures || [])
      .filter(item => stage === 'all' || STAGE_LABELS[item.stage] === stage || item.stage === stage)
      .filter(item => includesQuery([item.title, item.sourceFile, ...item.knowledgePointNames], query));
  }, [lectureData, query, stage]);

  const knowledgeCards = useMemo(() => {
    return (kpData?.items || [])
      .filter(item => stage === 'all' || STAGE_LABELS[item.stage] === stage || item.stage === stage)
      .filter(item => includesQuery([item.name, item.summary, item.batch, ...(item.existingQuizKps || [])], query));
  }, [kpData, query, stage]);

  const openExternal = async (url?: string) => {
    if (!url) return;
    try {
      if (/^https?:\/\//.test(url)) {
        await openUrl(url);
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(url, '_blank');
    }
  };

  if (loading) return <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>加载学习资料...</div>;

  if (error) {
    return (
      <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
        <p style={{ color: '#ef4444' }}>学习资料加载失败：{error}</p>
        <button className="mode-btn" onClick={() => navigate('/courses')}>返回课程</button>
      </div>
    );
  }

  return (
    <div className="quiz-practice learning-resources" style={{ maxWidth: 1180 }}>
      <div className="learning-resources-header">
        <div>
          <h2 style={{ marginBottom: 6 }}>学习资料</h2>
          <p style={{ color: '#64748b', fontSize: 14, maxWidth: 760 }}>
            按常规课、CSP-J 一轮和 CSP-J 二轮三条线整理。桌宠负责带你找到入口，完整内容从飞书文档打开，单独分享飞书链接也能阅读。
          </p>
        </div>
        {kpData?.totalNavigationUrl && (
          <button className="mode-btn" onClick={() => openExternal(kpData.totalNavigationUrl)} style={{ whiteSpace: 'nowrap' }}>
            打开飞书总导航
          </button>
        )}
      </div>

      <div className="learning-path-tabs">
        {VIEWS.map(item => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            className={view === item.key ? 'learning-path-tab active' : 'learning-path-tab'}
          >
            <div style={{ fontWeight: 800, color: view === item.key ? '#c2410c' : '#0f172a' }}>{item.label}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{item.hint}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索 P 编号、标题、知识点"
          className="search-input"
          style={{ width: 260 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STAGES.map(s => (
            <button
              key={s.key}
              className="mode-btn"
              onClick={() => setStage(s.key)}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                background: stage === s.key ? '#f59e0b' : '#fff',
                color: stage === s.key ? '#fff' : '#475569',
                border: '1px solid #e2e8f0',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'courses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {courses.map(lesson => (
            <div key={lesson.lessonNo} className="learning-course-row">
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2.4fr auto', gap: 14, alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 800, borderRadius: 6, padding: '2px 7px' }}>P{lesson.lessonNo}</span>
                    <strong style={{ fontSize: 15 }}>{lesson.title}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{lesson.stage}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8 }}>
                  {CARD_TYPES.map(cardType => {
                    const card = lesson.cards[cardType.key];
                    return (
                      <div
                        key={cardType.key}
                        style={{
                          textAlign: 'left',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          background: '#f8fafc',
                          padding: '8px 10px',
                          minWidth: 0,
                        }}
                      >
                        <span style={{ display: 'block', fontWeight: 800, color: cardType.color, fontSize: 12 }}>{cardType.label}</span>
                        <span style={{ display: 'block', color: '#64748b', fontSize: 11, lineHeight: 1.35 }}>{card.use}</span>
                      </div>
                    );
                  })}
                </div>

                <button className="mode-btn" onClick={() => openExternal(lesson.feishuUrl)} disabled={!lesson.feishuUrl}>
                  打开飞书
                </button>
              </div>
            </div>
          ))}
          {courses.length === 0 && <EmptyState />}
        </div>
      )}

      {view === 'firstRound' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            <ModuleCard title="知识点总览" desc="按知识点快速补救，适合做题后查漏。" action="打开救援索引" onClick={() => openExternal(RESCUE_URL)} />
            <ModuleCard title="专题讲解" desc="21 个一轮专题，适合系统复习。" action="查看下方专题" />
            <ModuleCard title="真题梳理" desc="按年份、题型和知识点梳理历年真题。" action="整理中" muted />
            <ModuleCard title="535计划" desc="5 年真题 + 3 次模拟，按轮次推进复盘。" action="整理中" muted />
          </div>

          <section>
            <h3 style={{ margin: '2px 0 10px' }}>知识点总览</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {knowledgeCards.map(kp => {
                const kpLectures = lectureByKp.get(kp.id) || [];
                const mainLecture = kpLectures[0];
                return (
                  <div key={kp.id} className="learning-resource-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 15 }}>{kp.name}</strong>
                      <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '2px 7px' }}>{kp.batch || 'A'}批</span>
                    </div>
                    <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5, minHeight: 54 }}>{kp.summary}</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {(kp.relatedLessonIds || []).slice(0, 5).map(n => <span key={n} style={{ fontSize: 11, color: '#2563eb' }}>P{n}</span>)}
                      {typeof kp.questionCount === 'number' && <span style={{ fontSize: 11, color: '#64748b' }}>{kp.questionCount} 题</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      {kp.feishuCardUrl && <button className="mode-btn" onClick={() => openExternal(kp.feishuCardUrl)}>打开知识卡</button>}
                      {mainLecture && (
                        <button className="mode-btn" disabled={!mainLecture.feishuUrl} onClick={() => openExternal(mainLecture.feishuUrl)} style={{ background: '#fff', color: '#0f766e', border: '1px solid #99f6e4' }}>
                          专题讲解
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {knowledgeCards.length === 0 && <EmptyState />}
            </div>
          </section>

          <section>
            <h3 style={{ margin: '2px 0 10px' }}>专题讲解</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {lectures.map(item => (
                <div key={item.id} className="learning-resource-card">
                  <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 800, marginBottom: 6 }}>{item.knowledgePointNames.join(' / ')}</div>
                  <strong style={{ display: 'block', fontSize: 15, marginBottom: 8 }}>{compactTitle(item.title)}</strong>
                  <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5, minHeight: 36 }}>适合一轮复习时系统学习概念、例题和易错点。</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {item.feishuUrl ? (
                      <button className="mode-btn" onClick={() => openExternal(item.feishuUrl)}>打开专题</button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>整理中</span>
                    )}
                    {item.cardUrl && (
                      <button className="mode-btn" onClick={() => openExternal(item.cardUrl)} style={{ background: '#fff', color: '#475569', border: '1px solid #e2e8f0' }}>
                        知识卡
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {lectures.length === 0 && <EmptyState />}
            </div>
          </section>
        </div>
      )}

      {view === 'secondRound' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <ModuleCard title="算法专题" desc="搜索、贪心、二分、动态规划、树图等复赛能力。" action="打开二轮路径" onClick={() => openExternal(SECOND_ROUND_URL)} />
          <ModuleCard title="代码模板" desc="沉淀常用写法，帮助孩子从会想走到会写。" action="整理中" muted />
          <ModuleCard title="真题讲评" desc="按题目拆解思路、代码和复盘方法。" action="整理中" muted />
          <ModuleCard title="错题复盘" desc="把常见错误整理成可反复查看的清单。" action="整理中" muted />
        </div>
      )}

    </div>
  );
}

function EmptyState() {
  return <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>没有匹配的资料。</p>;
}

function ModuleCard({
  title,
  desc,
  action,
  muted,
  onClick,
}: {
  title: string;
  desc: string;
  action: string;
  muted?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="learning-resource-card">
      <strong style={{ display: 'block', fontSize: 15, marginBottom: 6 }}>{title}</strong>
      <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5, minHeight: 36 }}>{desc}</p>
      {onClick ? (
        <button className="mode-btn" onClick={onClick} style={{ marginTop: 10 }}>{action}</button>
      ) : (
        <span style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: muted ? '#94a3b8' : '#475569' }}>{action}</span>
      )}
    </div>
  );
}
