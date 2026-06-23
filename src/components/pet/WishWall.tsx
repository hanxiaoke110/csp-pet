import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDeviceId, getTicketCount, useTicket } from '../../utils/crypto';
import { usePetStore } from '../../stores/petStore';
import { useQuizStore } from '../../stores/quizStore';

const API = 'https://api.cspstudy.top';

interface Wish {
  id: number; content: string; display_name: string;
  votes: number; created_at: string; status?: string;
}

export default function WishWall() {
  const navigate = useNavigate();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [view, setView] = useState<'rules' | 'hot' | 'new' | 'feedback'>('hot');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [tickets, setTickets] = useState(0);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [monthlySubmitted, setMonthlySubmitted] = useState(0);
  const [activeWishes, setActiveWishes] = useState(0);
  const activeLimit = 3;
  // Feedback form
  const [fbType, setFbType] = useState('bug');
  const [fbTitle, setFbTitle] = useState('');
  const [fbDesc, setFbDesc] = useState('');
  const fbHints: Record<string, { title: string; desc: string }> = {
    bug: { title: '比如：选择题答案显示不出来', desc: '告诉老师：在哪一页、点了什么按钮、出现了什么问题？越详细老师越容易帮你解决~' },
    feature: { title: '比如：希望增加倒计时功能', desc: '你想要什么新功能？为什么需要它？这个功能能帮你做什么？' },
    other: { title: '比如：希望字体更大一些', desc: '任何你想对老师说的话，对学习的想法或建议都可以写在这里~' },
  };

  const hasClassCode = !!(localStorage.getItem('csp_class_code'));

  const ownedPets = usePetStore(s => s.ownedPets);
  const hasLv6 = ownedPets.some(p => p.level >= 6);
  const weeklyTaskDone = useQuizStore(s => s.weeklyTaskDone);
  const weekQuizDone = weeklyTaskDone >= 5;
  const canSubmit = hasLv6 && weekQuizDone && monthlySubmitted < 3 && activeWishes < activeLimit;

  // Simple cache to avoid re-fetching on tab switch
  const cacheRef = useRef<{ hot: Wish[] | null; new: Wish[] | null; time: number }>({ hot: null, new: null, time: 0 });
  const maxLevel = ownedPets.length > 0 ? Math.max(...ownedPets.map(p => p.level)) : 0;

  const loadWishes = useCallback(async () => {
    if (view === 'rules' || view === 'feedback') return;
    // Use cache if data is less than 30s old
    const cached = cacheRef.current[view];
    if (cached && Date.now() - cacheRef.current.time < 30000) {
      setWishes(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const classCode = localStorage.getItem('csp_class_code') || '';
      if (!classCode) { setWishes([]); setLoading(false); return; }
      const resp = await fetch(`${API}/api/wishes?sort=${view}&limit=50&class_code=${encodeURIComponent(classCode)}`);
      const data = await resp.json();
      if (data.error) {
        setWishes([]);
        if (data.error.includes('班级') || data.error.includes('移出')) {
          localStorage.removeItem('csp_class_code');
          localStorage.removeItem('csp_class_info');
        }
        setMsg(data.error);
      } else if (Array.isArray(data)) {
        setWishes(data);
        cacheRef.current[view] = data;
        cacheRef.current.time = Date.now();
      }
    } catch { /* network error */ }
    setLoading(false);
  }, [view]);

  useEffect(() => { loadWishes(); }, [loadWishes]);

  useEffect(() => {
    setTickets(getTicketCount());
    const handler = () => setTickets(getTicketCount());
    window.addEventListener('tickets-updated', handler);
    return () => window.removeEventListener('tickets-updated', handler);
  }, []);

  // Fetch monthly submission count
  useEffect(() => {
    fetch(`${API}/api/wishes/my-stats?device_hash=${getDeviceId()}`)
      .then(r => r.json()).then(d => {
        setMonthlySubmitted(d.monthlySubmitted || 0);
        setActiveWishes(d.activeWishes || 0);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    const cnt = content.trim();
    if (cnt.length < 2 || cnt.length > 60) { setMsg('许愿内容需 2-60 字'); return; }

    const classCode = localStorage.getItem('csp_class_code') || '';
    const dispName = localStorage.getItem('csp_display_name') || '';
    const realName = localStorage.getItem('csp_student_name') || '';
    const phone = localStorage.getItem('csp_student_phone') || '';

    if (!classCode) { setMsg('请先在设置中绑定班级码'); return; }
    if (!dispName) { setMsg('请先在设置中填写昵称'); return; }

    setSubmitting(true); setMsg('');
    try {
      const resp = await fetch(`${API}/api/wishes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: cnt, display_name: dispName,
          real_name: realName, phone: phone,
          device_hash: getDeviceId(), class_code: classCode,
        }),
      });
      const data = await resp.json();
      if (data.error) {
        if (data.error.includes('班级已关闭') || data.error.includes('移出班级')) {
          localStorage.removeItem('csp_class_code');
          localStorage.removeItem('csp_class_info');
        }
        setMsg(data.error);
      }
      else {
        setMsg('✅ 许愿成功！');
        setContent(''); setShowForm(false);
        // Refresh stats
        fetch(`${API}/api/wishes/my-stats?device_hash=${getDeviceId()}`).then(r => r.json()).then(d => {
          setMonthlySubmitted(d.monthlySubmitted || 0);
          setActiveWishes(d.activeWishes || 0);
        }).catch(()=>{});
        cacheRef.current.time = 0; // invalidate cache
        loadWishes();
      }
    } catch { setMsg('网络错误，请重试'); }
    setSubmitting(false);
  };

  const handleVote = async (wishId: number) => {
    const classCode = localStorage.getItem('csp_class_code') || '';
    if (!classCode) { setMsg('请先在设置中绑定班级码'); return; }
    if (getTicketCount() <= 0) { setMsg('🎫 许愿票不足，前往商城购买'); return; }
    setVotingId(wishId);
    try {
      const resp = await fetch(`${API}/api/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wish_id: wishId, device_hash: getDeviceId(), class_code: classCode }),
      });
      const data = await resp.json();
      if (data.error) {
        if (data.error.includes('班级已关闭') || data.error.includes('移出班级')) {
          localStorage.removeItem('csp_class_code');
          localStorage.removeItem('csp_class_info');
        }
        setMsg(data.error);
      } else {
        useTicket(); setTickets(getTicketCount());
        cacheRef.current.time = 0; // invalidate cache
        loadWishes();
        setMsg('✅ 投票成功！');
      }
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

  const topWishes = view === 'hot' ? wishes.slice(0, 3) : [];
  const restWishes = view === 'hot' ? wishes.slice(3) : wishes;

  // Podium rank styles
  const rankStyles = [
    { bg: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '#f59e0b', emoji: '🥇', crown: '#f59e0b' },
    { bg: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', border: '#94a3b8', emoji: '🥈', crown: '#94a3b8' },
    { bg: 'linear-gradient(135deg, #fff7ed, #ffedd5)', border: '#d97706', emoji: '🥉', crown: '#d97706' },
  ];

  return (
    <div style={{ padding: '0 4px 40px', color: '#1e293b' }}>
      {/* ── No Class Code: Lock Screen ── */}
      {!hasClassCode ? (
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
          padding: '40px 24px', textAlign: 'center', animation: 'fadeIn .2s ease',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.6 }}>🔒</div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
            绑定班级码后解锁
          </h3>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.8, marginBottom: 20 }}>
            输入老师提供的班级码即可查看同学们的许愿，参与投票和提交自己的愿望。
          </p>
          <button onClick={() => navigate('/settings')} style={{
            padding: '10px 28px', background: 'linear-gradient(135deg, #FF8C00, #F96D00)',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,140,0,0.25)',
          }}>
            🏫 前往设置绑定班级码
          </button>
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 12 }}>📋 许愿规则预览</h4>
            <div style={{ textAlign: 'left', fontSize: 12, color: '#64748b', lineHeight: 2, maxWidth: 340, margin: '0 auto' }}>
              <div>📝 Lv.6+ 智子 + 完成本周练习才能提交许愿</div>
              <div>🎫 许愿票在商城购买（100g/张，250g/3张）</div>
              <div>🗳️ 每条许愿每人只能投 1 票</div>
              <div>📝 每人最多同时 3 条活跃许愿，老师实现/删除后恢复</div>
              <div>📅 每人每月最多提交 3 条许愿</div>
              <div>🔄 每月自动清理低票许愿</div>
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* ── Sort & Tickets Bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          {([
            { k: 'rules', icon: '📋', label: '许愿规则' },
            { k: 'hot', icon: '🔥', label: '热门' },
            { k: 'new', icon: '🆕', label: '最新' },            { k: 'feedback', icon: '💬', label: '反馈' },
          ] as const).map(({ k, icon, label }) => (
            <button key={k} onClick={() => { setView(k); setMsg(''); }} style={{
              padding: '6px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
              border: 'none', transition: 'all .15s',
              background: view === k ? '#fff' : 'transparent',
              color: view === k ? '#FF8C00' : '#64748b',
              boxShadow: view === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{icon} {label}</button>
          ))}
        </div>
        <div style={{
          background: tickets > 0 ? 'linear-gradient(135deg, #fff7ed, #ffedd5)' : '#f8fafc',
          border: `1px solid ${tickets > 0 ? '#fed7aa' : '#e2e8f0'}`,
          borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 600,
          color: tickets > 0 ? '#FF8C00' : '#94a3b8',
        }}>🎫 {tickets} 票</div>
      </div>

      {/* ── Rules Page ── */}
      {view === 'rules' && (
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
          padding: '24px 20px', animation: 'fadeIn .2s ease',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            📋 许愿规则
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: '📝', title: '提交门槛', desc: '需要 Lv.6+ 灵犀智子 + 完成本周练习。每人最多同时有 3 条活跃许愿，老师实现或删除后恢复次数。每月最多提交 3 条。' },
              { icon: '🎫', title: '许愿票', desc: '在商城购买：100g/张，打包 250g/3张。每周限购 3 张，没用完可以累积。' },
              { icon: '🗳️', title: '投票规则', desc: '每条许愿你只能投 1 票。投票后许愿票会消耗，不可撤销。' },
              { icon: '🔄', title: '月度更新', desc: '每月 1 号自动清理低票许愿（0 票优先淘汰，7 天内新愿望受保护），让榜单保持新鲜。' },
              { icon: '👀', title: '隐私保护', desc: '昵称所有人可见。真实姓名和手机号加密存储，仅老师可见，用于联系获奖同学。' },
              { icon: '📋', title: '内容规范', desc: '许愿内容需 2-60 字。禁止不当言论，系统自动审核，违规内容将被老师删除。' },
            ].map(rule => (
              <div key={rule.title} style={{ display: 'flex', gap: 12 }}>
                <div style={{ fontSize: 24, flexShrink: 0, width: 36, textAlign: 'center' }}>{rule.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 2 }}>{rule.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>{rule.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Message ── */}
      {view !== 'rules' && msg && (
        <div style={{
          marginBottom: 10, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.includes('✅') ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${msg.includes('✅') ? '#bbf7d0' : '#fecaca'}`,
          color: msg.includes('✅') ? '#16a34a' : '#ef4444',
          animation: 'fadeIn .3s ease',
        }}>{msg}</div>
      )}

      {/* ── Loading ── */}
      {view !== 'rules' && view !== 'feedback' && loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="loading-spinner" />
        </div>
      )}

      {/* ── Top 3 Podium ── */}
      {view !== 'rules' && view !== 'feedback' && !loading && topWishes.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {topWishes.map((w, i) => {
            const rs = rankStyles[i];
            return (
              <div key={w.id} style={{
                background: rs.bg, border: `1.5px solid ${rs.border}44`,
                borderRadius: 12, padding: '12px 14px', marginBottom: 6,
              }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{rs.emoji}</div>
                <WishContent w={w} timeAgo={timeAgo} votingId={votingId} handleVote={handleVote} />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Rest Wishes ── */}
      {view !== 'rules' && view !== 'feedback' && restWishes.map(w => (
        <div key={w.id} style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: '12px 14px', marginBottom: 6, transition: 'all .15s',
        }}>
          <WishContent w={w} timeAgo={timeAgo} votingId={votingId} handleVote={handleVote} />
        </div>
      ))}

      {/* ── Empty ── */}
      {view !== 'rules' && view !== 'feedback' && !loading && wishes.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 13 }}>
          <div style={{ fontSize: 40, opacity: .4, marginBottom: 8 }}>💡</div>
          还没有许愿，来做第一个吧！
        </div>
      )}

      {/* ── Submit Button or Eligibility Hint ── */}
      {view !== 'rules' && view !== 'feedback' && (canSubmit ? (
        <button onClick={() => setShowForm(true)} style={{
          width: '100%', marginTop: 14, padding: '14px',
          background: 'linear-gradient(135deg, #FF8C00, #F96D00)',
          color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,140,0,0.3)',
          transition: 'transform .15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >💡 提交许愿</button>
      ) : (
        <div style={{
          marginTop: 14, padding: '16px', borderRadius: 12,
          background: '#fffbeb', border: '1px solid #fde68a',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>🔒</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
            暂未达到许愿门槛
          </div>
          <div style={{ fontSize: 12, color: '#a16207', lineHeight: 1.8 }}>
            {!hasLv6 && (
              <div>⚠️ 需要 Lv.6+ 智子（当前最高 Lv.{maxLevel}）</div>
            )}
            {!weekQuizDone && (
              <div>⚠️ 需要完成本周练习（已做 {weeklyTaskDone}/5 道）</div>
            )}
            {hasLv6 && weekQuizDone && monthlySubmitted >= 3 && (
              <div>📅 本月已提交 {monthlySubmitted}/3 条，下个月再来</div>
            )}
            {hasLv6 && weekQuizDone && monthlySubmitted < 3 && activeWishes >= activeLimit && (
              <div>📝 已有 {activeWishes} 条活跃许愿，等老师实现或删除后再提交</div>
            )}
            {hasLv6 && weekQuizDone && monthlySubmitted < 3 && activeWishes < activeLimit && (
              <div style={{ color: '#16a34a' }}>✅ 达标！本月还可提交 {3 - monthlySubmitted} 条（活跃：{activeWishes}/{activeLimit}）</div>
            )}
          </div>
        </div>
      ))}

      {/* ── Submit Modal ── */}
      {showForm && (
        <div className="gacha-overlay" onClick={() => setShowForm(false)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
            <div className="buy-confirm-header">
              <span>💡 提交许愿</span>
              <button className="ai-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="buy-confirm-body" style={{ alignItems: 'stretch', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>许愿内容（2-60字）</label>
                <input value={content} onChange={e => setContent(e.target.value)}
                  placeholder="一只戴着墨镜的柴犬"
                  style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                    border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13,
                    color: '#1e293b', outline: 'none' }} />
              </div>
              <div style={{
                fontSize: 11, color: '#94a3b8', textAlign: 'center',
                background: '#f8fafc', borderRadius: 8, padding: '8px 12px',
              }}>
                🔒 你的真实姓名和手机号仅老师可见。如需修改，前往设置 → 班级绑定
              </div>
            </div>
            <div className="buy-confirm-actions">
              <button className="mode-btn mode-btn-back" onClick={() => setShowForm(false)}>取消</button>
              <button className="mode-btn" onClick={handleSubmit} disabled={submitting}
                style={{ background: submitting ? '#cbd5e1' : undefined }}>
                {submitting ? '提交中...' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Workshop ── */}
            {/* ── Feedback Form ── */}
      {view === 'feedback' && (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'20px', animation:'fadeIn .2s ease' }}>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#1e293b', marginBottom:4 }}>💬 提交反馈</h3>
          <p style={{ fontSize:12, color:'#94a3b8', marginBottom:16 }}>发现Bug？有好建议？告诉老师吧！</p>
          <div style={{ display:'flex', gap:6, marginBottom:14 }}>
            {[{k:'bug',l:'🐛 Bug反馈'},{k:'feature',l:'✨ 功能需求'},{k:'other',l:'💡 其他建议'}].map(t => (
              <button key={t.k} onClick={()=>setFbType(t.k)} style={{
                flex:1, padding:'8px 0', fontSize:12, fontWeight:600, borderRadius:8, cursor:'pointer', border:'1px solid #e2e8f0',
                background: fbType===t.k ? '#fff7ed' : '#fff', color: fbType===t.k ? '#FF8C00' : '#64748b',
                transition:'all .15s', textAlign:'center',
              }}>{t.l}</button>
            ))}
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#334155', display:'block', marginBottom:4 }}>标题</label>
            <input value={fbTitle} onChange={e=>setFbTitle(e.target.value)} placeholder={fbHints[fbType]?.title}
              style={{ width:'100%', padding:'10px 12px', boxSizing:'border-box', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, color:'#1e293b', outline:'none' }} />
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#334155', display:'block', marginBottom:4 }}>详细描述</label>
            <textarea value={fbDesc} onChange={e=>setFbDesc(e.target.value)} placeholder={fbHints[fbType]?.desc}
              rows={3} style={{ width:'100%', padding:'10px 12px', boxSizing:'border-box', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, color:'#1e293b', outline:'none', resize:'vertical', fontFamily:'inherit' }} />
          </div>
          <button onClick={async ()=>{
            if (!fbTitle.trim()) { setMsg('请填写标题'); return; }
            if (!fbDesc.trim()) { setMsg('请填写描述'); return; }
            setSubmitting(true);
            try {
              const classCode = localStorage.getItem('csp_class_code') || '';
              const dispName = localStorage.getItem('csp_display_name') || '';
              const realName = localStorage.getItem('csp_student_name') || '';
              const resp = await fetch(`${API}/api/feedback`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ type:fbType, title:fbTitle.trim(), description:fbDesc.trim(), submitter:'student', class_code:classCode, display_name:dispName, real_name:realName }),
              });
              const data = await resp.json();
              if (data.error) setMsg(data.error);
              else { setMsg('✅ 反馈已提交，老师会看到！'); setFbTitle(''); setFbDesc(''); setTimeout(() => setMsg(''), 3000); }
            } catch { setMsg('网络错误'); }
            setSubmitting(false);
          }} disabled={submitting} style={{
            width:'100%', padding:'12px', borderRadius:10, border:'none', cursor:'pointer',
            background: submitting ? '#cbd5e1' : 'linear-gradient(135deg, #FF8C00, #F96D00)',
            color:'#fff', fontSize:14, fontWeight:700, boxShadow:'0 4px 12px rgba(255,140,0,0.2)',
          }}>
            {submitting ? '提交中...' : '📩 提交反馈'}
          </button>
        </div>
      )}
      </>
    )}
    </div>
  );
}

// ── Reusable Wish Card Content ──
function WishContent({ w, timeAgo, votingId, handleVote }: {
  w: Wish; timeAgo: (d: string) => string; votingId: number | null;
  handleVote: (id: number) => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', wordBreak: 'break-all', marginBottom: 6 }}>
        {w.status === 'completed' && <span style={{ fontSize:11, background:'#fef3c7', color:'#d97706', padding:'1px 6px', borderRadius:4, fontWeight:700, marginRight:6 }}>✅ 已实现</span>}
        {w.content}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          来自 <span style={{ color: '#64748b' }}>{w.display_name || '匿名'}</span> · {timeAgo(w.created_at)}
        </span>
        <button onClick={() => handleVote(w.id)} disabled={votingId === w.id} style={{
          padding: '6px 16px', fontSize: 12, fontWeight: 700, borderRadius: 16,
          border: '1px solid #FF8C00', cursor: votingId === w.id ? 'not-allowed' : 'pointer',
          background: votingId === w.id ? '#fff7ed' : 'linear-gradient(135deg, #FF8C00, #F96D00)',
          color: votingId === w.id ? '#FF8C00' : '#fff',
          opacity: votingId === w.id ? 0.6 : 1,
          transition: 'all .15s', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          🔥 投票 <span style={{ fontSize: 11, opacity: 0.9 }}>({w.votes})</span>
        </button>
      </div>
    </div>
  );
}
