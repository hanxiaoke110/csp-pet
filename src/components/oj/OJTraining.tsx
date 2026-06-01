import { useState, useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

interface OJProblem {
  id: number;
  title: string;
  luoguId: string;
  knowledgePoint: string;
  difficulty: number;
  tags: string[];
  source: string;
  url: string;
  codemaoUrl: string | null;
}

const DIFFICULTY_LABELS = ['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];
const STORAGE_KEY = 'csp_oj_status';

function loadStatus(): Record<number, 'none' | 'done' | 'passed'> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveStatus(s: Record<number, 'none' | 'done' | 'passed'>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export default function OJTraining() {
  const [problems, setProblems] = useState<OJProblem[]>([]);
  const [statusMap, setStatusMap] = useState<Record<number, 'none' | 'done' | 'passed'>>({});
  const [filterKp, setFilterKp] = useState('全部');
  const [filterStatus, setFilterStatus] = useState('全部');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [platform, setPlatform] = useState<'codemao' | 'luogu'>('codemao');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/course-data/oj-problems.json')
      .then(r => r.json())
      .then(data => { setProblems(data); setLoading(false); })
      .catch(() => setLoading(false));
    setStatusMap(loadStatus());
  }, []);

  const setStatus = (id: number, s: 'none' | 'done' | 'passed') => {
    const next = { ...statusMap, [id]: s };
    setStatusMap(next); saveStatus(next);
  };

  // Filter
  const kps = ['全部', ...new Set(problems.map(p => p.knowledgePoint))];
  let filtered = problems;
  if (filterKp !== '全部') filtered = filtered.filter(p => p.knowledgePoint === filterKp);
  if (filterStatus === '未做') filtered = filtered.filter(p => !statusMap[p.id] || statusMap[p.id] === 'none');
  if (filterStatus === '已做') filtered = filtered.filter(p => statusMap[p.id] === 'done');
  if (filterStatus === '已通过') filtered = filtered.filter(p => statusMap[p.id] === 'passed');

  // Group
  const groups: Record<string, OJProblem[]> = {};
  for (const p of filtered) {
    if (!groups[p.knowledgePoint]) groups[p.knowledgePoint] = [];
    groups[p.knowledgePoint].push(p);
  }

  const totals = { total: problems.length, done: 0, passed: 0 };
  for (const p of problems) {
    if (statusMap[p.id] === 'done' || statusMap[p.id] === 'passed') totals.done++;
    if (statusMap[p.id] === 'passed') totals.passed++;
  }

  if (loading) return <div className="oj-training"><div className="loading-spinner" /><p>加载题目中...</p></div>;

  return (
    <div className="oj-training">
      <h2>💻 OJ 题训练</h2>
      <p className="oj-subtitle">精选 CSP-J 核心考点题目，跳转到洛谷 / 编程猫在线练习</p>

      <div className="oj-stats">
        <div className="oj-stat"><span className="oj-stat-val">{totals.total}</span><span className="oj-stat-label">总题数</span></div>
        <div className="oj-stat"><span className="oj-stat-val">{totals.done}</span><span className="oj-stat-label">已做</span></div>
        <div className="oj-stat"><span className="oj-stat-val">{totals.passed}</span><span className="oj-stat-label">已通过</span></div>
        <div className="oj-stat"><span className="oj-stat-val">{totals.total > 0 ? Math.round(totals.passed / totals.total * 100) : 0}%</span><span className="oj-stat-label">通过率</span></div>
      </div>

      <div className="oj-tabs">
        <button className={`oj-tab ${platform === 'codemao' ? 'active' : ''}`} onClick={() => setPlatform('codemao')}>🐱 编程猫</button>
        <button className={`oj-tab ${platform === 'luogu' ? 'active' : ''}`} onClick={() => setPlatform('luogu')}>🔗 洛谷</button>
      </div>

      {platform === 'codemao' && <CodeMaoTab />}

      {platform === 'luogu' && <>
      <div className="oj-filters">
        <select value={filterKp} onChange={e => { setFilterKp(e.target.value); setExpandedGroups(new Set()); }}>
          {kps.map(kp => <option key={kp} value={kp}>{kp}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="全部">全部状态</option>
          <option value="未做">未做</option>
          <option value="已做">已做</option>
          <option value="已通过">已通过</option>
        </select>
      </div>

      {Object.entries(groups).sort(([a], [b]) => {
        const order = ['基础语法','枚举算法','模拟算法','字符串','排序算法','查找','递归','贪心算法','搜索','动态规划','栈','数学'];
        return order.indexOf(a) - order.indexOf(b);
      }).map(([kp, plist]) => {
        const kpPassed = plist.filter(p => statusMap[p.id] === 'passed').length;
        const isOpen = expandedGroups.has(kp);
        return (
          <div key={kp} className="oj-group">
            <div className="oj-group-header" onClick={() => {
              const next = new Set(expandedGroups);
              isOpen ? next.delete(kp) : next.add(kp);
              setExpandedGroups(next);
            }}>
              <span className="oj-group-arrow">{isOpen ? '▼' : '▶'}</span>
              <span className="oj-group-name">📚 {kp}</span>
              <span className="oj-group-count">{plist.length} 题 · 已通过 {kpPassed}</span>
              <div className="oj-group-bar"><div className="oj-group-fill" style={{ width: `${plist.length > 0 ? (kpPassed / plist.length * 100) : 0}%` }} /></div>
            </div>
            {isOpen && (
              <div className="oj-problems">
                {plist.sort((a, b) => a.difficulty - b.difficulty).map(p => {
                  const st = statusMap[p.id] || 'none';
                  return (
                    <div key={p.id} className={`oj-problem ${st}`}>
                      <div className="oj-p-left">
                        <span className="oj-p-status">{st === 'passed' ? '✅' : st === 'done' ? '📝' : '⬜'}</span>
                        <div>
                          <div className="oj-p-title">{p.title}</div>
                          <div className="oj-p-meta">
                            <span className="oj-p-diff">{DIFFICULTY_LABELS[p.difficulty] || '⭐'}</span>
                            <span className="oj-p-source">{p.source} {p.luoguId}</span>
                            {p.tags.map(t => <span key={t} className="oj-p-tag">{t}</span>)}
                          </div>
                        </div>
                      </div>
                      <div className="oj-p-actions">
                        {p.url && <button onClick={() => openUrl(p.url)} className="oj-btn oj-btn-link">🔗 {p.source}</button>}
                        {p.codemaoUrl && <button onClick={() => openUrl(p.codemaoUrl!)} className="oj-btn oj-btn-link">🐱 编程猫</button>}
                        {st === 'none' && (
                          <button className="oj-btn oj-btn-done" onClick={() => setStatus(p.id, 'done')}>标记已做</button>
                        )}
                        {st === 'done' && (
                          <button className="oj-btn oj-btn-pass" onClick={() => setStatus(p.id, 'passed')}>标记通过</button>
                        )}
                        {st === 'passed' && (
                          <button className="oj-btn oj-btn-passed" disabled>✅ 已通过</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      </>}
    </div>
  );
}

// ─── 编程猫题单 ───
const CODEMAO_SETS = [
  { title: '编程基础之输入输出', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=273&from=3' },
  { title: '编程基础之变量定义、赋值及转换', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=274&from=3' },
  { title: '编程基础之逻辑表达式与条件分支', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=275&from=3' },
  { title: '编程基础之算术表达式与顺序执行', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=276&from=3' },
  { title: '语法毕业之练习生', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=199&from=3' },
  { title: '语法毕业之强无敌', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=198&from=3' },
  { title: '枚举算法-培优C-练习题单', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=179&from=3' },
  { title: '前缀和、差分算法-培优C-练习题单', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=212&from=3' },
  { title: '贪心算法-培优C-练习题单', url: 'https://oj.codemao.cn/oj/problemset/detail?sid=195&from=3' },
];

function CodeMaoTab() {
  const [doneSets, setDoneSets] = useState<Set<number>>(new Set());

  useEffect(() => {
    try { setDoneSets(new Set(JSON.parse(localStorage.getItem('csp_cm_done') || '[]'))); } catch {}
  }, []);

  const toggle = (i: number) => {
    const next = new Set(doneSets);
    doneSets.has(i) ? next.delete(i) : next.add(i);
    setDoneSets(next);
    localStorage.setItem('csp_cm_done', JSON.stringify([...next]));
  };

  return (
    <div className="codemao-sets">
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
        点击下方题单链接，直达编程猫对应练习模块。建议按顺序完成，打牢基础。
      </p>
      {CODEMAO_SETS.map((ps, i) => (
        <div key={i} className={`cm-set ${doneSets.has(i) ? 'done' : ''}`}>
          <span className="cm-set-num">{i + 1}</span>
          <span className="cm-set-title">{ps.title}</span>
          <button className={`oj-btn ${doneSets.has(i) ? 'oj-btn-passed' : 'oj-btn-done'}`}
            onClick={() => toggle(i)}>
            {doneSets.has(i) ? '✅ 已完成' : '标记完成'}
          </button>
          <button onClick={() => openUrl(ps.url)} className="oj-btn oj-btn-link">🔗 前往练习</button>
        </div>
      ))}
    </div>
  );
}
