import { ReactNode, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuizStore } from '../../stores/quizStore';
import { usePetStore } from '../../stores/petStore';
import RedeemCode from '../courses/RedeemCode';
import { navigateToMainApp } from '../../../src-dungeon/utils/routeBridge';
import {
  getWindowSkin,
  WINDOW_SKIN_CHANGE_EVENT,
  type WindowSkin,
} from '../../utils/windowSkin';
import { getWeekKey, loadCheckin, nextCheckin } from '../../utils/checkin';
import {
  BookOpen, Bot, ClipboardList, Gift, Images, Laptop, Library, ListChecks,
  Medal, Megaphone, PawPrint, Settings, Sparkles, Swords, Trophy, Zap,
} from 'lucide-react';

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
      const data = loadCheckin();
      const thisWeek = getWeekKey();
      if (data.week === thisWeek) {
        setChecked(true);
        setStreak(data.streak || 0);
        setTip((data.tip && typeof data.tip === 'object' ? data.tip : TIPS[new Date().getDate() % TIPS.length]) as typeof TIPS[number]);
      }
    } catch {}
  }, []);

  const doCheckin = () => {
    const checkin = nextCheckin();
    if (checkin.alreadyChecked) return;
    const thisWeek = checkin.week;
    const newStreak = checkin.streak;

    let bonus = 50;
    let bonusMsg = '';
    if (newStreak % 8 === 0) {
      bonus = 200;
      bonusMsg = ' + 改名卡 ×1';
      // Award rename card by faking a purchase — simpler: just increment
      usePetStore.setState(s => ({ renameCards: s.renameCards + 1 }));
    } else if (newStreak % 4 === 0) {
      bonus = 100;
    }

    addCoins(bonus);
    const nextTip = TIPS[new Date().getDate() % TIPS.length];
    setChecked(true); setStreak(newStreak); setTip(nextTip);
    localStorage.setItem('csp_checkin', JSON.stringify({ week: thisWeek, streak: newStreak, tip: nextTip }));

    const toast = document.createElement('div');
    toast.textContent = `🔥 连续 ${newStreak} 周！+${bonus}g${bonusMsg}`;
    toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#fff;padding:8px 20px;border-radius:20px;font-weight:700;z-index:9999;animation:toastIn .3s ease';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  return (
    <div className="checkin-bar">
      {checked ? (
        <div className="checkin-card">
          <div className="checkin-streak">🔥 连续 {streak} 周</div>
          <div className="checkin-tips">
            <div className="checkin-tip do">✅ 宜：{tip.do}</div>
            <div className="checkin-tip avoid">⚠️ 忌：{tip.avoid}</div>
            <div className="checkin-tip lucky">🍀 {tip.lucky}</div>
          </div>
        </div>
      ) : (
        <button className="checkin-btn" onClick={doCheckin}>🎁 本周签到 +50g</button>
      )}
    </div>
  );
}

export default function AppShell({ children }: Props) {
  const errors = useQuizStore(s => s.errors);
  const errorCount = errors.length;
  const canSuper = useQuizStore(s => s.canDoSuperChallenge());
  const [showRedeem, setShowRedeem] = useState(false);
  const [windowSkin, setWindowSkin] = useState<WindowSkin>(getWindowSkin);

  useEffect(() => {
    const handleSkinChange = (event: Event) => {
      setWindowSkin((event as CustomEvent<WindowSkin>).detail);
    };
    window.addEventListener(WINDOW_SKIN_CHANGE_EVENT, handleSkinChange);
    return () => window.removeEventListener(WINDOW_SKIN_CHANGE_EVENT, handleSkinChange);
  }, []);

  return (
    <div className="app-shell" data-window-skin={windowSkin}>
      <nav className="sidebar">
        <div className="sidebar-logo"><Sparkles /> <span>CSP 学习助手</span></div>

        <DailyCheckin />

        <div className="sidebar-section">学习</div>
        <NavLink to="/courses" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <BookOpen /> <span>课程</span>
        </NavLink>
        <NavLink to="/ai-coach" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Bot /> <span>AI 教练</span>
        </NavLink>
        <NavLink to="/quiz" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <ListChecks /> <span>选择题</span>
        </NavLink>
        <NavLink to="/exam" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Medal /> <span>CSP 真题</span>
        </NavLink>
        <NavLink to="/oj-training" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Laptop /> <span>OJ 训练</span>
        </NavLink>
        <NavLink to="/resources" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Library /> <span>学习资料</span>
        </NavLink>

        <div className="sidebar-section">成长</div>
        <NavLink to="/pet" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <PawPrint /> <span>灵犀智子</span>
        </NavLink>
        <NavLink to="/achievements" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Trophy /> <span>成就</span>
        </NavLink>
        {/* 智子试炼场：全屏地牢，需整体切换到 MemoryRouter，用 pushState 触发顶层路由二选一 */}
        <button
          className="nav-item"
          onClick={() => navigateToMainApp('/dungeon')}
        >
          <Swords /> <span>智子试炼场</span>
        </button>

        <div className="sidebar-section">挑战</div>

        <NavLink to="/quiz" className={`nav-item nav-sub ${canSuper ? 'nav-super-available' : 'nav-super-done'}`}>
          <Zap /> <span>超级挑战</span>
          <span className={`nav-tag ${canSuper ? 'tag-available' : 'tag-done'}`}>
            {canSuper ? '可挑战' : '已完成'}
          </span>
        </NavLink>

        {errorCount > 0 && (
          <NavLink to="/quiz" className="nav-item nav-sub nav-review">
            <ClipboardList /> <span>月度复盘</span>
            <span className="nav-count">{errorCount}题</span>
          </NavLink>
        )}

        <div className="sidebar-section sidebar-system-section">系统</div>

        <NavLink to="/announcements" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Megaphone /> <span>公告</span>
        </NavLink>

        <button className="nav-item"
          onClick={() => setShowRedeem(true)}>
          <Gift /> <span>神秘代码</span>
        </button>

        <NavLink to="/window-skins" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Images /> <span>窗口皮肤</span>
        </NavLink>

        <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Settings /> <span>设置</span>
        </NavLink>
      </nav>
      <main className="main-content">
        {children}
      </main>
      {showRedeem && <RedeemCode onClose={() => setShowRedeem(false)} />}
    </div>
  );
}
