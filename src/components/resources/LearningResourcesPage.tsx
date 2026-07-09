import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import ResourceCard from './ResourceCard';
import { useClassAccess, ClassAccessRequired } from '../access/ClassAccessGate';
import type { LearningResource, LearningResourcesData, ResourceType } from './types';

// 远程资料索引地址。为空表示当前不启用远程索引，直接使用本地兜底。
// 未来可填 Cloudflare / Gitee / 飞书公开 JSON；启用后会优先远程，失败回退本地。
// 注意：远程外链必须走 Tauri HTTP 插件（tauriFetch），绕过 WebView CORS / 混合内容限制。
const REMOTE_RESOURCE_INDEX_URL = '';

const TYPE_FILTERS: { key: ResourceType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'lecture', label: '📘 讲义卡' },
  { key: 'fable', label: '🐉 寓言卡' },
  { key: 'practice', label: '✏️ 配套练习' },
  { key: 'review', label: '🔎 复盘材料' },
];

// 数据格式校验：必须有 resources 数组，避免异常 JSON 导致崩溃
function isValidResourcesData(json: any): json is LearningResourcesData {
  return !!json && typeof json === 'object' && Array.isArray(json.resources);
}

async function fetchLocalIndex(): Promise<LearningResourcesData> {
  const resp = await fetch('/course-data/learning-resources.json');
  if (!resp.ok) throw new Error(`本地索引 HTTP ${resp.status}`);
  const json = await resp.json();
  if (!isValidResourcesData(json)) throw new Error('本地索引格式异常');
  return json;
}

async function fetchRemoteIndex(): Promise<LearningResourcesData> {
  const resp = await tauriFetch(REMOTE_RESOURCE_INDEX_URL, { connectTimeout: 15_000 });
  if (!resp.ok) throw new Error(`远程索引 HTTP ${resp.status}`);
  const json = await resp.json();
  if (!isValidResourcesData(json)) throw new Error('远程索引格式异常');
  return json;
}

export default function LearningResourcesPage() {
  const navigate = useNavigate();
  const { ensure } = useClassAccess();
  const [data, setData] = useState<LearningResourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResourceType | 'all'>('all');
  const [gate, setGate] = useState<{ message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let json: LearningResourcesData | null = null;
        // 远程索引优先：URL 非空时先尝试远程，失败回退本地（不白屏）
        if (REMOTE_RESOURCE_INDEX_URL) {
          try {
            json = await fetchRemoteIndex();
          } catch (e) {
            console.warn('[学习资料] 远程索引加载失败，回退本地索引：', e);
            json = null;
          }
        }
        // 远程未启用或失败 -> 使用本地兜底
        if (!json) {
          json = await fetchLocalIndex();
        }
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const resources = useMemo(() => {
    // hidden 不展示；兼容旧 enabled=false
    const visible = (data?.resources || []).filter(r => r.status !== 'hidden' && r.enabled !== false);
    const filtered = filter === 'all' ? visible : visible.filter(r => r.type === filter);
    // 按 lessonNo 升序排序，无 lessonNo 的排在后面（稳定）
    return [...filtered].sort((a, b) => {
      const la = typeof a.lessonNo === 'number' ? a.lessonNo : Number.MAX_SAFE_INTEGER;
      const lb = typeof b.lessonNo === 'number' ? b.lessonNo : Number.MAX_SAFE_INTEGER;
      if (la !== lb) return la - lb;
      return (a.id || '').localeCompare(b.id || '');
    });
  }, [data, filter]);

  const handleOpen = async (r: LearningResource) => {
    if (!r.url) return;
    // coming_soon 资源仍允许点击打开 URL（飞书占位页后续直接更新）
    if (!r.requiresClassCode) {
      try { await openUrl(r.url); } catch { /* 用户取消或环境不支持 */ }
      return;
    }
    // 需要班级码：先校验，失败展示统一门禁与真实原因
    const res = await ensure();
    if (res.ok) {
      try { await openUrl(r.url); } catch { /* 忽略 */ }
    } else {
      setGate({ message: res.message || '班级码校验未通过，请先绑定。' });
    }
  };

  if (gate) {
    return (
      <ClassAccessRequired
        title="需要绑定班级码"
        description="这份资料属于班级专属内容，需要先绑定老师提供的班级码后才能打开。"
        message={gate.message}
        onBind={() => navigate('/settings')}
        onBack={() => setGate(null)}
      />
    );
  }

  if (loading) {
    return <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>加载学习资料…</div>;
  }

  if (error) {
    return (
      <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
        <p style={{ color: '#ef4444' }}>学习资料加载失败：{error}</p>
        <button className="mode-btn" onClick={() => navigate('/courses')}>返回课程</button>
      </div>
    );
  }

  return (
    <div className="quiz-practice">
      <h2 style={{ marginBottom: 4 }}>📖 学习资料</h2>
      <p style={{ color: '#64748b', marginBottom: 16, fontSize: 14 }}>
        讲义卡 / 寓言卡 / 配套练习 / 复盘材料。标有 🔒 的资料需要绑定班级码后打开，点击会用系统浏览器打开外链。
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {TYPE_FILTERS.map(f => (
          <button
            key={f.key}
            className="mode-btn"
            style={{
              padding: '6px 14px',
              fontSize: 13,
              background: filter === f.key ? '#f59e0b' : '#fff',
              color: filter === f.key ? '#fff' : '#475569',
              border: '1px solid #e2e8f0',
            }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {resources.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暂无学习资料。</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {resources.map(r => (
            <ResourceCard key={r.id} resource={r} onOpen={handleOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
