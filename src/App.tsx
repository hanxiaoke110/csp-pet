import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import AppShell from './components/layout/AppShell';
import CourseList from './components/courses/CourseList';
import AIChat from './components/ai/AIChat';
import QuizPractice from './components/quiz/QuizPractice';
import PetPanel from './components/pet/PetPanel';
import AchievementsPanel from './components/achievements/AchievementsPanel';
import OJTraining from './components/oj/OJTraining';
import SettingsPage from './components/settings/SettingsPage';
import AdminPage from './components/admin/AdminPage';
import { useCourseStore } from './stores/courseStore';
import { useHatchStore } from './stores/hatchStore';
import { usePetStore } from './stores/petStore';
import { useQuizStore } from './stores/quizStore';
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
        case 'switch-pet': {
          const petId = (e.payload as any).petId;
          if (petId) usePetStore.getState().setActivePet(petId);
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

function getWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  return `${d.getFullYear()}-W${Math.ceil((dayOfYear + jan1.getDay() + 1) / 7)}`;
}

function doCheckinFromPet() {
  try {
    const thisWeek = getWeekKey();
    const data = JSON.parse(localStorage.getItem('csp_checkin') || '{}');
    if (data.week === thisWeek) {
      emit('pet-bubble', { text: '本周已经签到过啦~ 🎁' }).catch(() => {});
      return;
    }
    let streak = (data.streak || 0) + 1;
    let bonus = 50;
    if (streak % 8 === 0) { bonus = 200; usePetStore.getState().renameCards += 1; }
    else if (streak % 4 === 0) { bonus = 100; }
    usePetStore.getState().addCoins(bonus);
    localStorage.setItem('csp_checkin', JSON.stringify({ week: thisWeek, streak }));
    emit('pet-bubble', { text: `🔥 连续 ${streak} 周！+${bonus}g` }).catch(() => {});
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
    // Restore hatching eggs (they're persisted to localStorage)
    useHatchStore.getState().load();
    // Restore quiz progress (errors, stats, etc.)
    useQuizStore.getState().load();
    // Weekly passive coins for Lv10+ pets
    try {
      const store = usePetStore.getState();
      const activePet = store.ownedPets.find(p => p.petId === store.activePetId);
      if (activePet && activePet.level >= 10) {
        const lastGrant = localStorage.getItem('csp_last_passive_coin');
        const now = Date.now();
        if (!lastGrant || (now - parseInt(lastGrant)) >= 7 * 86400000) {
          store.addCoins(20);
          localStorage.setItem('csp_last_passive_coin', String(now));
        }
      }
    } catch {}
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

    // Restore saved window size
    const saved = localStorage.getItem('csp_window_size');
    if (saved) {
      try {
        const { width, height } = JSON.parse(saved);
        if (width > 400 && height > 300) {
          getCurrentWindow().setSize(new LogicalSize(width, height));
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Save window size on resize (debounced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unlisten = getCurrentWindow().onResized(({ payload: size }) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.setItem('csp_window_size', JSON.stringify({ width: size.width, height: size.height }));
      }, 500);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  async function loadCourseData() {
    try {
      let stages: Stage[] = [];
      let lessons: Lesson[] = [];

      // 1. Try remote update first (use Tauri HTTP plugin to bypass CORS)
      const REMOTE_BASE = 'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data';
      try {
        const verResp = await tauriFetch(`${REMOTE_BASE}/version.json`, { connectTimeout: 15_000 });
        if (verResp.ok) {
          const remoteVer = await verResp.json();
          const localVer = parseInt(localStorage.getItem('csp_data_version') || '0');
          if (remoteVer.version > localVer) {
            const [stagesResp, lessonsResp, quizResp] = await Promise.all([
              tauriFetch(`${REMOTE_BASE}/stages.json`, { connectTimeout: 15_000 }),
              tauriFetch(`${REMOTE_BASE}/lessons.json`, { connectTimeout: 15_000 }),
              tauriFetch(`${REMOTE_BASE}/unified-quiz-bank.json`, { connectTimeout: 15_000 }),
            ]);
            if (stagesResp.ok && lessonsResp.ok) {
              const remoteStages = await stagesResp.json();
              const remoteLessonsData = await lessonsResp.json();
              let flatLessons = [];
              if (Array.isArray(remoteLessonsData)) {
                flatLessons = remoteLessonsData;
              } else if (remoteLessonsData.lessons) {
                flatLessons = remoteLessonsData.lessons;
              } else {
                for (const stage of (remoteLessonsData.stages || [])) {
                  for (const l of (stage.lessons || [])) {
                    flatLessons.push(l);
                  }
                }
              }
              localStorage.setItem('csp_imported_lessons', JSON.stringify({ stages: remoteStages, lessons: flatLessons }));
              localStorage.setItem('csp_data_version', String(remoteVer.version));
              // Save quiz bank if available
              if (quizResp.ok) {
                try {
                  const quizData = await quizResp.json();
                  localStorage.setItem('csp_quiz_bank', JSON.stringify(quizData));
                } catch {}
              }
            }
          }
        }
      } catch { /* network error, use local */ }

      // 2. Check for imported course data
      const imported = localStorage.getItem('csp_imported_lessons');
      if (imported) {
        try {
          const parsed = JSON.parse(imported);
          if (parsed.stages && parsed.lessons) {
            stages = parsed.stages;
            lessons = parsed.lessons;
          }
        } catch { /* fall through to bundled */ }
      }

      // 3. Fallback to bundled data
      if (lessons.length === 0) {
        const [stagesResp, lessonsResp] = await Promise.all([
          fetch('/course-data/stages.json'),
          fetch('/course-data/lessons.json'),
        ]);

        if (!stagesResp.ok || !lessonsResp.ok) {
          throw new Error('课程数据加载失败');
        }

        stages = await stagesResp.json();
        const lessonsData: Lesson[] | LessonsData = await lessonsResp.json();

        if (Array.isArray(lessonsData)) {
          lessons = lessonsData;
        } else if (lessonsData.lessons) {
          lessons = lessonsData.lessons;
        } else {
          for (const stage of (lessonsData.stages || [])) {
            for (const l of (stage.lessons || [])) {
              lessons.push(l);
            }
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
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        {toast && <div className="milestone-toast">{toast}</div>}
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
