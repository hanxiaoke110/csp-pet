import { useEffect, useMemo, useState } from 'react';

type Announcement = {
  id: number | string;
  title: string;
  content: string;
  scope?: 'global' | 'teacher';
  teacher_name?: string;
  pinned?: number | boolean;
  published_at?: string;
};
const API = 'https://api.cspstudy.top';

function formatDate(raw?: string): string {
  if (!raw) return '';
  const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AnnouncementPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  // 默认只展开最新一条，其余折叠，避免公告堆成一长串
  const [openIds, setOpenIds] = useState<Set<string | number>>(new Set());

  useEffect(() => {
    const classCode = localStorage.getItem('csp_class_code') || '';
    const params = new URLSearchParams();
    if (classCode) params.set('class_code', classCode);
    fetch(`${API}/api/announcements?${params.toString()}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => {
        const list: Announcement[] = Array.isArray(data) ? data : data.items || [];
        setItems(list);
        if (list.length > 0) setOpenIds(new Set([list[0].id]));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const allOpen = useMemo(() => items.length > 0 && items.every(i => openIds.has(i.id)), [items, openIds]);

  const toggle = (id: string | number) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setOpenIds(allOpen ? new Set() : new Set(items.map(i => i.id)));
  };

  return (
    <div className="settings-page">
      <h2>📣 公告</h2>
      <p className="settings-desc">这里会同步全服通知，以及你所绑定老师发布的教学与班级通知。</p>

      {loading && <div className="settings-section">正在获取公告...</div>}
      {!loading && items.length === 0 && <div className="settings-section">暂时没有新的公告。</div>}

      {!loading && items.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button onClick={toggleAll} style={{
            padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
            background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>
            {allOpen ? '全部收起 ▲' : '全部展开 ▼'}
          </button>
        </div>
      )}

      {items.map(item => {
        const open = openIds.has(item.id);
        return (
          <article key={item.id} className="settings-section" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              onClick={() => toggle(item.id)}
              aria-expanded={open}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '12px 14px', border: 'none', background: open ? '#f8fafc' : '#fff',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                fontSize: 10, color: '#94a3b8', flexShrink: 0,
                transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none',
              }}>▶</span>
              <span style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: item.scope === 'teacher' ? '#fff7ed' : '#eff6ff',
                color: item.scope === 'teacher' ? '#c2410c' : '#1d4ed8',
              }}>
                {item.scope === 'teacher' ? '教师' : '全服'}
              </span>
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 700, color: '#1e293b',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.pinned ? '📌 ' : ''}{item.title}
              </span>
              <span style={{ flexShrink: 0, fontSize: 11, color: '#94a3b8' }}>{formatDate(item.published_at)}</span>
            </button>
            {open && (
              <div style={{ padding: '4px 16px 14px 40px', borderTop: '1px solid #f1f5f9' }}>
                {item.scope === 'teacher' && (
                  <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 600, margin: '8px 0 2px' }}>
                    发布人：{item.teacher_name || '任课老师'}
                  </div>
                )}
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, fontSize: 13, color: '#334155', marginTop: 8 }}>
                  {item.content}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
