import { ReactNode, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuizStore } from '../../stores/quizStore';
import { usePetStore } from '../../stores/petStore';
import RedeemCode from '../courses/RedeemCode';

interface Props { children: ReactNode; }

const TIPS = [
  { do: '做 5 道选择题', avoid: '不喂灵犀智子', lucky: '🟫 地系智子' },
  { do: '完成一道 OJ 题目', avoid: '跳过课程验证', lucky: '🔴 火系智子' },
  { do: '和 AI 教练讨论一道题', avoid: '熬夜学到太晚', lucky: '🟢 风系智子' },
  { do: '复习昨天的错题', avoid: '连续学 2 小时不休息', lucky: '🔵 水系智子' },
  { do: '把错题彻底搞懂', avoid: '只做题不总结', lucky: '📚 C++ 基础语法' },
  { do: '完成每周任务', avoid: '忘记每日签到', lucky: '🧠 动态规划' },
  { do: '喂一次灵犀智子', avoid: '让智子饿肚子', lucky: '🍖 豪华食物' },
  { do: '整理错题笔记', avoid: '拖延到明天', lucky: '⭐ 稀有智子' },
];

function DailyCheckin() {
  const [checked, setChecked] = useState(false);
  const [streak, setStreak] = useState(0);
  const [tip, setTip] = useState(TIPS[0]);
  const addCoins = usePetStore(s => s.addCoins);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem('csp_checkin') || '{}');
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (data.date === today) {
        setChecked(true);
        setStreak(data.streak || 0);
        setTip(data.tip || TIPS[new Date().getDate() % TIPS.length]);
      } else {
        setStreak(data.date === yesterday ? (data.streak || 0) : 0);
      }
    } catch {}
  }, []);

  const doCheckin = () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let newStreak = streak + 1;
    try {
      const data = JSON.parse(localStorage.getItem('csp_checkin') || '{}');
      if (data.date !== yesterday) newStreak = 1;
    } catch {}

    const bonus = newStreak % 30 === 0 ? 100 : newStreak % 7 === 0 ? 20 : 10;
    const dayTip = TIPS[new Date().getDate() % TIPS.length];
    addCoins(bonus);
    setChecked(true); setStreak(newStreak); setTip(dayTip);
    localStorage.setItem('csp_checkin', JSON.stringify({ date: today, streak: newStreak, tip: dayTip }));

    const toast = document.createElement('div');
    toast.textContent = `🔥 连续 ${newStreak} 天！+${bonus}g`;
    toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#fff;padding:8px 20px;border-radius:20px;font-weight:700;z-index:9999;animation:toastIn .3s ease';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  return (
    <div className="checkin-bar">
      {checked ? (
        <div className="checkin-card">
          <div className="checkin-streak">🔥 连续 {streak} 天</div>
          <div className="checkin-tips">
            <div className="checkin-tip do">✅ 宜：{tip.do}</div>
            <div className="checkin-tip avoid">⚠️ 忌：{tip.avoid}</div>
            <div className="checkin-tip lucky">🍀 {tip.lucky}</div>
          </div>
        </div>
      ) : (
        <button className="checkin-btn" onClick={doCheckin}>🎁 今日签到 +10g</button>
      )}
    </div>
  );
}

export default function AppShell({ children }: Props) {
  const errors = useQuizStore(s => s.errors);
  const errorCount = errors.length;
  const canSuper = useQuizStore(s => s.canDoSuperChallenge());
  const [showRedeem, setShowRedeem] = useState(false);

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">CSP 学习助手</div>

        <DailyCheckin />

        <NavLink to="/courses" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          📚 课程
        </NavLink>
        <NavLink to="/ai-coach" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          🧑‍🏫 AI 教练
        </NavLink>
        <NavLink to="/quiz" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          📝 选择题
        </NavLink>
        <NavLink to="/pet" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          🐾 灵犀智子
        </NavLink>
        <NavLink to="/achievements" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          🏆 成就
        </NavLink>
        <NavLink to="/oj-training" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          💻 OJ 训练
        </NavLink>

        <div className="sidebar-section">挑战</div>

        <NavLink to="/quiz" className={`nav-item nav-sub ${canSuper ? 'nav-super-available' : 'nav-super-done'}`}>
          ⚡ 超级挑战
          <span className={`nav-tag ${canSuper ? 'tag-available' : 'tag-done'}`}>
            {canSuper ? '可挑战' : '已完成'}
          </span>
        </NavLink>

        {errorCount > 0 && (
          <NavLink to="/quiz" className="nav-item nav-sub nav-review">
            📋 月度复盘
            <span className="nav-count">{errorCount}题</span>
          </NavLink>
        )}

        <div className="sidebar-spacer" />

        <button className="nav-item" style={{ background: 'none', cursor: 'pointer', fontSize: 14, border: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
          onClick={() => setShowRedeem(true)}>
          🎁 神秘代码
        </button>

        <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          ⚙️ 设置
        </NavLink>
      </nav>
      <main className="main-content">
        {children}
      </main>
      {showRedeem && <RedeemCode onClose={() => setShowRedeem(false)} />}
    </div>
  );
}
