import { useState, useEffect, useCallback } from 'react';
import { encrypt, getDeviceId, getTicketCount, useTicket } from '../../utils/crypto';
import { usePetStore } from '../../stores/petStore';

const API = 'https://api.cspstudy.top';

interface Wish {
  id: number; content: string; display_name: string;
  votes: number; created_at: string;
}

// ── Styling ──
const cardBg = 'rgba(255,255,255,0.04)';
const cardBorder = 'rgba(167,139,250,0.12)';
const accent = '#7c3aed';
const accentGlow = '0 0 20px rgba(124,58,237,0.3)';

export default function WishWall() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [sort, setSort] = useState<'hot' | 'new'>('hot');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [dispName, setDispName] = useState('');
  const [realName, setRealName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [tickets, setTickets] = useState(0);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const ownedPets = usePetStore(s => s.ownedPets);
  const hasLv10 = ownedPets.some(p => p.level >= 10);

  const loadWishes = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/wishes?sort=${sort}&limit=50`);
      const data = await resp.json();
      if (Array.isArray(data)) setWishes(data);
    } catch { /* network error */ }
    setLoading(false);
  }, [sort]);

  useEffect(() => { loadWishes(); }, [loadWishes]);
  useEffect(() => { setTickets(getTicketCount()); }, []);

  const handleSubmit = async () => {
    const cnt = content.trim(); const dn = dispName.trim(); const rn = realName.trim();
    if (cnt.length < 2 || cnt.length > 60) { setMsg('许愿内容需 2-60 字'); return; }
    if (dn.length < 1 || dn.length > 20) { setMsg('昵称需 1-20 字'); return; }
    setSubmitting(true); setMsg('');
    try {
      const enc = rn ? await encrypt(rn) : '';
      const resp = await fetch(`${API}/api/wishes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cnt, display_name: dn, real_name_enc: enc, device_hash: getDeviceId() }),
      });
      const data = await resp.json();
      if (data.error) { setMsg(data.error); }
      else { setMsg('✅ 许愿成功！'); setContent(''); setDispName(''); setRealName(''); setShowForm(false); loadWishes(); }
    } catch { setMsg('网络错误，请重试'); }
    setSubmitting(false);
  };

  const handleVote = async (wishId: number) => {
    if (!useTicket()) { setMsg('🎫 许愿票不足，前往商城购买'); return; }
    setVotingId(wishId); setTickets(getTicketCount());
    try {
      const resp = await fetch(`${API}/api/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wish_id: wishId, device_hash: getDeviceId() }),
      });
      const data = await resp.json();
      if (data.error) setMsg(data.error); else loadWishes();
    } catch { setMsg('网络错误'); }
    setVotingId(null);
    setTimeout(() => setMsg(''), 3000);
  };

  const timeAgo = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d + 'Z').getTime()) / 60000);
    if (m < 60) return `${m}分钟前`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}小时前` : `${Math.floor(h / 24)}天前`;
  };

  const topWishes = sort === 'hot' ? wishes.slice(0, 3) : [];
  const restWishes = sort === 'hot' ? wishes.slice(3) : wishes;

  return (
    <div style={{ padding: '0 4px', maxHeight: 'calc(100vh - 200px)', overflow: 'auto', color: '#e2e8f0' }}>
      {/* ── Top Bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { k: 'hot', icon: '🔥', label: '热门' },
            { k: 'new', icon: '🆕', label: '最新' },
          ] as const).map(({ k, icon, label }) => (
            <button key={k} onClick={() => setSort(k)} style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: 'pointer',
              border: 'none', transition: 'all .2s',
              background: sort === k ? accent : 'rgba(255,255,255,0.06)',
              color: sort === k ? '#fff' : '#94a3b8',
              boxShadow: sort === k ? accentGlow : 'none',
            }}>{icon} {label}</button>
          ))}
        </div>
        <div style={{
          background: tickets > 0 ? `linear-gradient(135deg, ${accent}33, #a78bfa33)` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${tickets > 0 ? accent+'66' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700,
          color: tickets > 0 ? accent : '#64748b',
        }}>🎫 {tickets} 票</div>
      </div>

      {/* ── Message ── */}
      {msg && (
        <div style={{
          marginBottom: 10, padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
          background: msg.includes('✅') ? '#064e3b33' : '#7f1d1d33',
          border: `1px solid ${msg.includes('✅') ? '#064e3b66' : '#7f1d1d66'}`,
          color: msg.includes('✅') ? '#34d399' : '#f87171',
          animation: 'fadeIn .3s ease',
        }}>{msg}</div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: `3px solid ${accent}33`, borderTopColor: accent,
            animation: 'spin .8s linear infinite',
          }} />
        </div>
      )}

      {/* ── Top 3 Hot Wishes ── */}
      {!loading && topWishes.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {topWishes.map((w, i) => {
            const rankEmoji = ['🥇', '🥈', '🥉'][i];
            const rankGrad = [
              'linear-gradient(135deg, #92400e33, #f59e0b33)',
              'linear-gradient(135deg, #47556933, #94a3b833)',
              'linear-gradient(135deg, #78350f33, #d9770633)',
            ][i];
            return (
              <div key={w.id} style={{
                background: rankGrad, border: `1px solid ${cardBorder}`,
                borderRadius: 12, padding: '10px 14px', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{rankEmoji}</div>
                <WishContent w={w} timeAgo={timeAgo} votingId={votingId}
                  handleVote={handleVote} accent={accent} />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Rest Wishes ── */}
      {restWishes.map(w => (
        <div key={w.id} style={{
          background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 12,
          padding: '10px 14px', marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all .2s',
          ...(hoveredId === w.id ? { borderColor: accent+'66', boxShadow: '0 0 12px rgba(124,58,237,0.1)' } : {}),
        }} onMouseEnter={() => setHoveredId(w.id)} onMouseLeave={() => setHoveredId(null)}>
          <WishContent w={w} timeAgo={timeAgo} votingId={votingId}
            handleVote={handleVote} accent={accent} />
        </div>
      ))}

      {/* ── Empty ── */}
      {!loading && wishes.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b', fontSize: 13 }}>
          <div style={{ fontSize: 40, opacity: .3, marginBottom: 8 }}>💡</div>
          还没有许愿，来做第一个吧
        </div>
      )}

      {/* ── Submit Button ── */}
      {hasLv10 && (
        <button onClick={() => setShowForm(true)} style={{
          width: '100%', marginTop: 14, padding: '12px',
          background: `linear-gradient(135deg, ${accent}, #a78bfa)`,
          color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', boxShadow: accentGlow, transition: 'transform .15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >✨ 提交许愿</button>
      )}

      {/* ── Submit Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#1a1030', borderRadius: 20, padding: 28, width: 380, maxWidth: '90vw',
            border: `1px solid ${accent}33`, boxShadow: '0 8px 40px rgba(0,0,0,.5)',
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
              💡 提交许愿
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400, marginLeft: 'auto' }}>Lv.10</span>
            </h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>许愿内容（2-60字）</label>
              <input value={content} onChange={e => setContent(e.target.value)} placeholder="一只戴着墨镜的柴犬"
                style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: 'rgba(255,255,255,.04)',
                  border: `1px solid ${cardBorder}`, borderRadius: 10, fontSize: 13, color: '#e2e8f0', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>昵称（其他同学看到）</label>
              <input value={dispName} onChange={e => setDispName(e.target.value)} placeholder="小明"
                style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: 'rgba(255,255,255,.04)',
                  border: `1px solid ${cardBorder}`, borderRadius: 10, fontSize: 13, color: '#e2e8f0', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>真实姓名（仅老师看到，可选）</label>
              <input value={realName} onChange={e => setRealName(e.target.value)} placeholder="张三"
                style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: 'rgba(255,255,255,.04)',
                  border: `1px solid ${cardBorder}`, borderRadius: 10, fontSize: 13, color: '#e2e8f0', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={{
                flex: 1, padding: 10, background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 10,
                color: '#94a3b8', fontSize: 13, cursor: 'pointer',
              }}>取消</button>
              <button onClick={handleSubmit} disabled={submitting} style={{
                flex: 1, padding: 10,
                background: submitting ? '#475569' : `linear-gradient(135deg, ${accent}, #a78bfa)`,
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>{submitting ? '提交中...' : '确认提交'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable Wish Card Content ──
function WishContent({ w, timeAgo, votingId, handleVote, accent }: {
  w: Wish; timeAgo: (d: string) => string; votingId: number | null;
  handleVote: (id: number) => void; accent: string;
}) {
  return (
    <>
      <button onClick={() => handleVote(w.id)} style={{
        flexShrink: 0, width: 44, height: 44, borderRadius: 12, border: `1px solid ${accent}33`,
        background: votingId === w.id ? `${accent}22` : 'rgba(255,255,255,.03)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', transition: 'all .2s', color: accent, fontWeight: 700,
      }}>
        <span style={{ fontSize: 15 }}>⬆</span>
        <span style={{ fontSize: 11, marginTop: -1 }}>{w.votes}</span>
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', wordBreak: 'break-all' }}>{w.content}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
          来自 <span style={{ color: '#94a3b8' }}>{w.display_name || '匿名'}</span> · {timeAgo(w.created_at)}
        </div>
      </div>
    </>
  );
}
