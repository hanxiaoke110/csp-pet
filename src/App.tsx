import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import AppShell from './components/layout/AppShell';
import CourseList from './components/courses/CourseList';
import AIChat from './components/ai/AIChat';
import QuizPractice from './components/quiz/QuizPractice';
import PetPanel from './components/pet/PetPanel';
import AchievementsPanel from './components/achievements/AchievementsPanel';
import OJTraining from './components/oj/OJTraining';
import SettingsPage from './components/settings/SettingsPage';
import { useCourseStore } from './stores/courseStore';
import { usePetStore } from './stores/petStore';
import { useAIStore } from './stores/aiStore';
import type { Lesson, Stage, LessonsData } from './types/course';
import './App.css';

// Handle pet window actions (inside Router so we can use navigate)
function PetActionHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    listen('pet-action', (e: any) => {
      const { action, target } = e.payload;
      switch (action) {
        case 'open-window': {
          invoke('bring_to_front').catch(() => {});
          break;
        }
        case 'navigate': {
          invoke('bring_to_front').catch(() => {});
          navigate(target);
          // Dispatch custom event for tab switching
          if (target.includes('tab=shop')) {
            setTimeout(() => window.dispatchEvent(new CustomEvent('switch-pet-tab', { detail: 'shop' })), 100);
          }
          break;
        }
        case 'checkin': {
          doCheckinFromPet();
          break;
        }
      }
    }).then(fn => cleanups.push(fn));

    // Notify pet window of our visibility
    const handleVisibility = () => {
      emit('main-window-state', { visible: true }).catch(() => {});
    };
    const handleHidden = () => {
      emit('main-window-state', { visible: false }).catch(() => {});
    };

    // Initial: main window is visible
    emit('main-window-state', { visible: true }).catch(() => {});

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleVisibility();
      else handleHidden();
    });
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('blur', handleHidden);

    return () => {
      cleanups.forEach(fn => fn());
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('blur', handleHidden);
    };
  }, [navigate]);

  return null;
}

function doCheckinFromPet() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = JSON.parse(localStorage.getItem('csp_checkin') || '{}');
    if (data.date === today) {
      emit('pet-bubble', { text: '今天已经签到过啦~ 🎁' }).catch(() => {});
      return;
    }
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let streak = data.date === yesterday ? (data.streak || 0) : 0;
    streak++;
    const bonus = streak % 30 === 0 ? 100 : streak % 7 === 0 ? 20 : 10;
    usePetStore.getState().addCoins(bonus);
    localStorage.setItem('csp_checkin', JSON.stringify({ date: today, streak, tip: data.tip }));
    emit('pet-bubble', { text: `🔥 连续 ${streak} 天！+${bonus}g` }).catch(() => {});
    // Sync pet data so coins are updated
    setTimeout(() => usePetStore.getState().save(), 100);
  } catch {
    emit('pet-bubble', { text: '签到成功！🎁' }).catch(() => {});
  }
}

// First-time welcome modal
function WelcomeModal() {
  const hasPet = usePetStore(s => s.ownedPets.length > 0);
  const [show, setShow] = useState(true);
  const navigate = useNavigate();

  if (hasPet || !show) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '32px 28px',
        textAlign: 'center', maxWidth: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
        animation: 'popIn .3s ease',
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🐣</div>
        <h2 style={{ fontSize: 20, marginBottom: 4, color: '#f59e0b' }}>欢迎来到 CSP 学习助手！</h2>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.8, marginBottom: 20 }}>
          领取你的第一只灵犀智子，<br />
          让它陪你一起学习 C++ 吧！
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => { setShow(false); navigate('/pet'); }} style={{
            padding: '10px 24px', fontSize: 15, fontWeight: 700,
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            color: '#fff', border: 'none', borderRadius: 12,
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
          }}>
            🎒 去领养灵犀智子
          </button>
          <button onClick={() => setShow(false)} style={{
            padding: '8px', fontSize: 12, color: '#94a3b8',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>
            稍后再说
          </button>
        </div>
      </div>
    </div>
  );
}
function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const loadConfig = useAIStore(s => s.loadConfig);
  const petLoaded = usePetStore(s => s.load);

  // Sync pet data to pet window and listen for clicks from pet window
  useEffect(() => {
    petLoaded();
    listen('pet-click', () => {
      usePetStore.getState().save();
    }).catch(() => {});
    listen('pet-request-sync', () => {
      usePetStore.getState().save();
    }).catch(() => {});
    setTimeout(() => usePetStore.getState().save(), 500);
  }, []);

  // Milestone toast listener
  useEffect(() => {
    const handler = (e: Event) => {
      const { count } = (e as CustomEvent).detail;
      const badges: Record<number, string> = { 5: '🌟 学习新星', 20: '💪 坚持不懈', 50: '🔥 小有成就', 100: '👑 百题大王' };
      const badge = badges[count] || '';
      setToast(`${badge}！已完成 ${count} 道题的验证！`);
      setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener('csp-milestone', handler);
    return () => window.removeEventListener('csp-milestone', handler);
  }, []);

  useEffect(() => {
    loadConfig();
    loadCourseData();
  }, []);

  async function loadCourseData() {
    try {
      const [stagesResp, lessonsResp] = await Promise.all([
        fetch('/course-data/stages.json'),
        fetch('/course-data/lessons.json'),
      ]);

      if (!stagesResp.ok || !lessonsResp.ok) {
        throw new Error('课程数据加载失败');
      }

      const stages: Stage[] = await stagesResp.json();
      const lessonsData: Lesson[] | LessonsData = await lessonsResp.json();

      let lessons: Lesson[];
      if (Array.isArray(lessonsData)) {
        lessons = lessonsData;
      } else if (lessonsData.lessons) {
        lessons = lessonsData.lessons;
      } else {
        lessons = [];
        for (const stage of (lessonsData.stages || [])) {
          for (const l of (stage.lessons || [])) {
            lessons.push(l);
          }
        }
      }

      useCourseStore.getState().setData(stages, lessons);

      try {
        const saved = localStorage.getItem('csp_unlocked_lessons');
        if (saved) {
          const ids: string[] = JSON.parse(saved);
          ids.forEach(id => useCourseStore.getState().unlockLesson(id));
        }
      } catch { /* ignore */ }

      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>正在加载课程数据…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <h2>加载失败</h2>
        <p>{error}</p>
        <button onClick={() => { setLoading(true); setError(null); loadCourseData(); }}>
          重试
        </button>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <PetActionHandler />
      <WelcomeModal />
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/courses" replace />} />
          <Route path="/courses" element={<CourseList />} />
          <Route path="/ai-coach" element={<AIChat />} />
          <Route path="/quiz" element={<QuizPractice />} />
          <Route path="/pet" element={<PetPanel />} />
          <Route path="/achievements" element={<AchievementsPanel />} />
          <Route path="/oj-training" element={<OJTraining />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        {toast && <div className="milestone-toast">{toast}</div>}
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
