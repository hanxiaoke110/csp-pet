import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import ClassroomResources from './ClassroomResources';
import { loadLearningCatalog } from './learningCatalog';
import type { LearningCatalogData, LearningCatalogLesson } from './types';

type ViewKey = 'classroom' | 'rescue' | 'review';
type StageFilter = 'all' | 'C1 入门阶段' | 'C2 基础阶段' | 'C3 进阶阶段' | 'C4 提高阶段';

interface KnowledgePoint {
  id: string; name: string; stage: string; batch?: string; summary?: string; feishuCardUrl?: string;
  existingQuizKps?: string[]; relatedLessonIds?: number[]; questionCount?: number;
}
interface KnowledgePointsData { updated?: string; totalNavigationUrl?: string; items: KnowledgePoint[]; }
interface KnowledgeLecture {
  id: string; title: string; sourceFile: string; knowledgePointIds: string[]; knowledgePointNames: string[];
  stage: string; batch: string; feishuUrl: string; cardUrl: string;
}
interface KnowledgeLecturesData { updated: string; lectures: KnowledgeLecture[]; }

const VIEWS: { key: ViewKey; label: string; hint: string }[] = [
  { key: 'classroom', label: '课堂资料', hint: '按 C1–C4 阶段查看每课资料' },
  { key: 'rescue', label: '知识点救援', hint: '做题后按知识点快速查漏' },
  { key: 'review', label: '专题复习', hint: '一轮专题与二轮能力路径' },
];
const RESCUE_URL = 'https://scncdgmg7m6w.feishu.cn/docx/GxWbddqOno4LcVxKD7LcqalrnTb';
const SECOND_ROUND_URL = 'https://scncdgmg7m6w.feishu.cn/docx/UHIOdn8jOo4Lqkx98AScdsmqnre';
const STAGES: { key: StageFilter; label: string }[] = [
  { key: 'all', label: '全部阶段' }, { key: 'C1 入门阶段', label: 'C1 入门' },
  { key: 'C2 基础阶段', label: 'C2 基础' }, { key: 'C3 进阶阶段', label: 'C3 进阶' },
  { key: 'C4 提高阶段', label: 'C4 提高' },
];
const STAGE_LABELS: Record<string, StageFilter> = {
  C1: 'C1 入门阶段', C2: 'C2 基础阶段', C3: 'C3 进阶阶段', C4: 'C4 提高阶段',
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}
function includesQuery(parts: Array<string | number | undefined>, query: string): boolean {
  return !query || parts.filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase());
}
function compactTitle(title: string): string {
  return title.replace(/^专题详解｜/, '').replace(/^知识卡｜/, '');
}

export default function LearningResourcesPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<LearningCatalogData | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [kpData, setKpData] = useState<KnowledgePointsData | null>(null);
  const [lectureData, setLectureData] = useState<KnowledgeLecturesData | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>('classroom');
  const [stage, setStage] = useState<StageFilter>('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const hasClassCode = Boolean(localStorage.getItem('csp_class_code'));

  useEffect(() => {
    let cancelled = false;
    loadLearningCatalog(updated => { if (!cancelled) setCatalog(updated); })
      .then(data => { if (!cancelled) setCatalog(data); })
      .catch(error => { if (!cancelled) setCatalogError(error?.message || '课堂资料目录加载失败'); });
    Promise.all([
      fetchJson<KnowledgePointsData>('/course-data/knowledge-points.json'),
      fetchJson<KnowledgeLecturesData>('/course-data/knowledge-lectures.json'),
    ]).then(([knowledgePoints, lectures]) => {
      if (!cancelled) { setKpData(knowledgePoints); setLectureData(lectures); }
    }).catch(error => { if (!cancelled) setSupportError(error?.message || '知识点资料加载失败'); });
    return () => { cancelled = true; };
  }, []);

  const lectureByKp = useMemo(() => {
    const map = new Map<string, KnowledgeLecture[]>();
    for (const lecture of lectureData?.lectures || []) {
      for (const kpId of lecture.knowledgePointIds || []) map.set(kpId, [...(map.get(kpId) || []), lecture]);
    }
    return map;
  }, [lectureData]);
  const lectures = useMemo(() => (lectureData?.lectures || [])
    .filter(item => stage === 'all' || STAGE_LABELS[item.stage] === stage || item.stage === stage)
    .filter(item => includesQuery([item.title, item.sourceFile, ...item.knowledgePointNames], query)), [lectureData, query, stage]);
  const knowledgeCards = useMemo(() => (kpData?.items || [])
    .filter(item => stage === 'all' || STAGE_LABELS[item.stage] === stage || item.stage === stage)
    .filter(item => includesQuery([item.name, item.summary, item.batch, ...(item.existingQuizKps || [])], query)), [kpData, query, stage]);

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice('链接已复制，可以粘贴到浏览器打开。');
    } catch { window.prompt('请复制下面的链接：', url); }
  };
  const openExternal = async (url?: string) => {
    if (!url) return;
    try { await openUrl(url); setNotice(null); }
    catch {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) await copyLink(url);
    }
  };
  const navigationUrl = catalog?.navigationUrl || kpData?.totalNavigationUrl;
  const isLoading = view === 'classroom' ? !catalog && !catalogError : !kpData && !supportError;

  return (
    <div className="quiz-practice learning-resources" style={{ maxWidth: 1180 }}>
      <div className="learning-resources-header">
        <div>
          <h2 style={{ marginBottom: 6 }}>学习资料</h2>
          <p>课堂资料会自动读取最新目录，不必等待软件更新。完整内容从飞书打开，也可以复制链接到其他设备阅读。</p>
        </div>
        {navigationUrl && <button className="mode-btn" onClick={() => openExternal(navigationUrl)}>打开飞书总导航</button>}
      </div>

      <div className="learning-path-tabs">
        {VIEWS.map(item => (
          <button key={item.key} onClick={() => { setView(item.key); setQuery(''); }} className={view === item.key ? 'learning-path-tab active' : 'learning-path-tab'}>
            <div className="learning-path-title">{item.label}</div><div className="learning-path-hint">{item.hint}</div>
          </button>
        ))}
      </div>

      <div className="learning-search-row">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={view === 'classroom' ? '搜索课次、标题或知识点' : '搜索标题、知识点'} className="search-input" />
        {view !== 'classroom' && <div className="learning-stage-filters">{STAGES.map(item => (
          <button key={item.key} className="mode-btn" onClick={() => setStage(item.key)} data-active={stage === item.key}>{item.label}</button>
        ))}</div>}
      </div>

      {notice && <div className="learning-link-notice" role="status">{notice}</div>}
      {isLoading && <div className="learning-loading">正在加载学习资料…</div>}
      {view === 'classroom' && catalogError && !catalog && <ResourceError message={catalogError} />}
      {view === 'classroom' && catalog && <ClassroomResources
        catalog={catalog} query={query} hasClassCode={hasClassCode}
        onOpen={(lesson: LearningCatalogLesson) => openExternal(lesson.feishuUrl)} onCopy={copyLink}
        onOpenSettings={() => navigate('/settings')}
      />}

      {view !== 'classroom' && supportError && !kpData && <ResourceError message={supportError} />}
      {view === 'rescue' && kpData && <div className="learning-section-stack">
        <ModuleCard title="知识点总览" desc="按知识点快速补救，适合做题后查漏。" action="打开救援索引" onClick={() => openExternal(RESCUE_URL)} />
        <section><h3>知识点总览</h3><div className="learning-card-grid">
          {knowledgeCards.map(kp => {
            const mainLecture = (lectureByKp.get(kp.id) || [])[0];
            return <div key={kp.id} className="learning-resource-card">
              <div className="learning-card-title"><strong>{kp.name}</strong><span>{kp.batch || 'A'}批</span></div>
              <p>{kp.summary}</p><div className="learning-card-meta">
                {(kp.relatedLessonIds || []).slice(0, 5).map(number => <span key={number}>P{number}</span>)}
                {typeof kp.questionCount === 'number' && <span>{kp.questionCount} 题</span>}
              </div><div className="learning-card-actions">
                {kp.feishuCardUrl && <button className="mode-btn" onClick={() => openExternal(kp.feishuCardUrl)}>打开知识卡</button>}
                {mainLecture?.feishuUrl && <button className="mode-btn secondary" onClick={() => openExternal(mainLecture.feishuUrl)}>专题讲解</button>}
              </div>
            </div>;
          })}
          {knowledgeCards.length === 0 && <EmptyState />}
        </div></section>
      </div>}

      {view === 'review' && lectureData && <div className="learning-section-stack">
        <div className="learning-module-grid">
          <ModuleCard title="一轮专题" desc="系统复习概念、例题与易错点。" action="查看下方专题" />
          <ModuleCard title="二轮能力路径" desc="搜索、贪心、二分、动态规划、树图等复赛能力。" action="打开二轮路径" onClick={() => openExternal(SECOND_ROUND_URL)} />
          <ModuleCard title="代码模板" desc="沉淀常用写法，帮助孩子从会想走到会写。" action="整理中" muted />
          <ModuleCard title="真题讲评" desc="按题目拆解思路、代码和复盘方法。" action="整理中" muted />
        </div>
        <section><h3>专题讲解</h3><div className="learning-card-grid">
          {lectures.map(item => <div key={item.id} className="learning-resource-card">
            <div className="learning-card-kicker">{item.knowledgePointNames.join(' / ')}</div>
            <strong>{compactTitle(item.title)}</strong><p>适合复习时系统学习概念、例题和易错点。</p>
            <div className="learning-card-actions">
              {item.feishuUrl ? <button className="mode-btn" onClick={() => openExternal(item.feishuUrl)}>打开专题</button> : <span>整理中</span>}
              {item.cardUrl && <button className="mode-btn secondary" onClick={() => openExternal(item.cardUrl)}>知识卡</button>}
            </div>
          </div>)}
          {lectures.length === 0 && <EmptyState />}
        </div></section>
      </div>}
    </div>
  );
}

function ResourceError({ message }: { message: string }) {
  return <div className="learning-resource-error"><strong>资料暂时加载失败</strong><p>{message}</p><span>请检查网络后重新进入；已缓存的资料不会受影响。</span></div>;
}
function EmptyState() { return <p className="learning-empty-state">没有匹配的资料。</p>; }
function ModuleCard({ title, desc, action, muted, onClick }: { title: string; desc: string; action: string; muted?: boolean; onClick?: () => void }) {
  return <div className="learning-resource-card learning-module-card"><strong>{title}</strong><p>{desc}</p>
    {onClick ? <button className="mode-btn" onClick={onClick}>{action}</button> : <span className={muted ? 'muted' : ''}>{action}</span>}
  </div>;
}
