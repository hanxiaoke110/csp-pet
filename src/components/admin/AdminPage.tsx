import { useState, useEffect, useCallback } from 'react';

const API = 'https://api.cspstudy.top';

interface AdminWish {
  id: number; content: string; display_name: string;
  real_name: string; phone: string; votes: number;
  status: string; created_at: string; device_hash: string;
}

export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem('csp_admin_token') || '');
  const [tokenInput, setTokenInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [wishes, setWishes] = useState<AdminWish[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const login = () => {
    if (!tokenInput.trim()) { setMsg('请输入管理密码'); return; }
    setToken(tokenInput.trim());
    sessionStorage.setItem('csp_admin_token', tokenInput.trim());
    setAuthed(true);
    setMsg('');
  };

  const loadWishes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API}/admin/wishes`, {
        headers: { 'X-Admin-Token': token },
      });
      if (resp.status === 401) {
        setAuthed(false); sessionStorage.removeItem('csp_admin_token');
        setToken(''); setMsg('密码错误或未授权');
        setLoading(false); return;
      }
      const data = await resp.json();
      if (Array.isArray(data)) setWishes(data);
      else setMsg(data.error || '加载失败');
    } catch { setMsg('网络错误'); }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) {
      // Verify token first
      fetch(`${API}/admin/wishes`, { headers: { 'X-Admin-Token': token } })
        .then(resp => {
          if (resp.ok) { setAuthed(true); loadWishes(); }
          else { setAuthed(false); setMsg('密码错误，请重新输入'); }
        })
        .catch(() => setMsg('网络错误'));
    }
  }, []);

  const deleteWish = async (id: number) => {
    if (!confirm('确定删除这条许愿？')) return;
    try {
      const resp = await fetch(`${API}/admin/wishes/${id}`, {
        method: 'DELETE', headers: { 'X-Admin-Token': token },
      });
      if (resp.ok) {
        setWishes(prev => prev.filter(w => w.id !== id));
        setMsg('✅ 已删除');
      } else {
        const data = await resp.json();
        setMsg(data.error || '删除失败');
      }
    } catch { setMsg('网络错误'); }
    setTimeout(() => setMsg(''), 3000);
  };

  const timeFormat = (d: string) => {
    const date = new Date(d + 'Z');
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // ── Login screen ──
  if (!authed) {
    return (
      <div style={{ maxWidth: 400, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
        <h2 style={{ fontSize: 20, marginBottom: 8, color: '#1e293b' }}>老师管理端</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>请输入管理密码查看许愿墙数据</p>
        <input
          type="password"
          value={tokenInput}
          onChange={e => setTokenInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') login(); }}
          placeholder="管理密码"
          className="pw-input"
          style={{ width: '100%', marginBottom: 12 }}
          autoFocus
        />
        <button onClick={login} className="mode-btn" style={{ width: '100%' }}>
          登录
        </button>
        {msg && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca',
          }}>{msg}</div>
        )}
      </div>
    );
  }

  // ── Admin dashboard ──
  const activeWishes = wishes.filter(w => w.status === 'active');
  const deletedWishes = wishes.filter(w => w.status === 'deleted');

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, margin: 0 }}>📋 许愿墙管理</h2>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
            共 {activeWishes.length} 条有效 · {deletedWishes.length} 条已删除
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="mode-btn mode-btn-back" onClick={loadWishes} style={{ padding: '6px 14px', fontSize: 12 }}>
            🔄 刷新
          </button>
          <button className="mode-btn mode-btn-back" onClick={() => {
            setAuthed(false); setToken(''); sessionStorage.removeItem('csp_admin_token');
          }} style={{ padding: '6px 14px', fontSize: 12 }}>
            退出
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: msg.includes('✅') ? '#f0fdf4' : '#fef2f2',
          color: msg.includes('✅') ? '#16a34a' : '#ef4444',
          border: `1px solid ${msg.includes('✅') ? '#bbf7d0' : '#fecaca'}`,
        }}>{msg}</div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="loading-spinner" />
        </div>
      )}

      {!loading && activeWishes.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          暂无许愿数据
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {activeWishes.map(w => (
          <div key={w.id} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 8,
              background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#64748b',
            }}>⬆{w.votes}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{w.content}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                昵称：{w.display_name || '匿名'}
                {w.real_name && <span style={{ color: '#FF8C00', fontWeight: 600, marginLeft: 12 }}>👤 {w.real_name}</span>}
                {w.phone && <span style={{ color: '#2563eb', fontWeight: 600, marginLeft: 8 }}>📱 {w.phone}</span>}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {timeFormat(w.created_at)} · 设备：{w.device_hash.slice(0, 8)}...
              </div>
            </div>
            <button onClick={() => deleteWish(w.id)} style={{
              flexShrink: 0, padding: '6px 14px', fontSize: 12, fontWeight: 600,
              background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca',
              borderRadius: 8, cursor: 'pointer',
            }}>
              🗑 删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
