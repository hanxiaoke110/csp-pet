import { useEffect, useState } from 'react';

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

export default function AnnouncementPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const classCode = localStorage.getItem('csp_class_code') || '';
    const params = new URLSearchParams();
    if (classCode) params.set('class_code', classCode);
    fetch(`${API}/api/announcements?${params.toString()}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => setItems(Array.isArray(data) ? data : data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="settings-page">
      <h2>📣 公告</h2>
      <p className="settings-desc">这里会同步全服通知，以及你所绑定老师发布的教学与班级通知。</p>
      {loading && <div className="settings-section">正在获取公告...</div>}
      {!loading && items.length === 0 && <div className="settings-section">暂时没有新的公告。</div>}
      {items.map(item => (
        <article key={item.id} className="settings-section">
          <h3>{item.pinned ? '📌 ' : ''}{item.title}</h3>
          <div style={{ fontSize: 12, color: item.scope === 'teacher' ? '#c2410c' : '#2563eb', fontWeight: 700, marginBottom: 4 }}>
            {item.scope === 'teacher' ? `教师公告 · ${item.teacher_name || '任课老师'}` : '全服公告'}
          </div>
          {item.published_at && <p className="settings-desc">{new Date(item.published_at).toLocaleString('zh-CN')}</p>}
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{item.content}</div>
        </article>
      ))}
    </div>
  );
}
