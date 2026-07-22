import { BrowserRouter, Routes, Route, Navigate, useNavigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { MemoryRouter } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import CourseList from './components/courses/CourseList';
import AIChat from './components/ai/AIChat';
import QuizPractice from './components/quiz/QuizPractice';
import PetPanel from './components/pet/PetPanel';
import AchievementsPanel from './components/achievements/AchievementsPanel';
import OJTraining from './components/oj/OJTraining';
import ExamTraining from './components/exam/ExamTraining';
import SettingsPage from './components/settings/SettingsPage';
import AdminPage from './components/admin/AdminPage';
import LearningResourcesPage from './components/resources/LearningResourcesPage';
import DungeonEmbed from '../src-dungeon/DungeonEmbed';
import { APP_ROUTE_CHANGE_EVENT } from '../src-dungeon/utils/routeBridge';
import { refreshQuestionBankV2 } from './question-bank/repository';
import { safeListen } from './lib/tauriEvents';
import { useCourseStore } from './stores/courseStore';
import { useHatchStore } from './stores/hatchStore';
import { usePetStore } from './stores/petStore';
import { useQuizStore } from './stores/quizStore';
import { useAIStore } from './stores/aiStore';
import { migrateLocalStorageToSqlite } from './lib/migration';
import { loadProblemStatuses } from './lib/problemStatusCache';
import type { Lesson, Stage, LessonsData } from './types/course';
import './App.css';

// Handle pet window actions (inside Router so we can use navigate)
function PetActionHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(safeListen('pet-action', (e: any) => {
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
    }));

    // Notify pet window of our visibility
    const handleVisibility = () => {
      emit('main-window-state', { visible: true }).catch(() => {});
    };
    const handleHidden = () => {
      emit('main-window-state', { visible: false }).catch(() => {});
    };

    // Initial: main window is visible
    emit('main-window-state', { visible: true }).catch(() => {});

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleVisibility();
      else handleHidden();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('blur', handleHidden);

    return () => {
      cleanups.forEach(fn => fn());
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

function ChangelogModal() {
  const VER = '1.7.12';
  const [show, setShow] = useState(() => localStorage.getItem('csp_changelog_seen') !== VER);
  if (!show) return null;
  const dismiss = () => { localStorage.setItem('csp_changelog_seen', VER); setShow(false); };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:5000 }} onClick={dismiss}>
      <div style={{ background:'#fff', borderRadius:20, padding:'32px 28px', textAlign:'center', maxWidth:360, boxShadow:'0 8px 40px rgba(0,0,0,0.2)', animation:'popIn .3s ease', position:'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={dismiss} style={{ position:'absolute', top:12, right:16, background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#94a3b8' }}>✕</button>
        <div style={{ fontSize:40, marginBottom:8 }}>🎉</div>
        <h2 style={{ fontSize:18, marginBottom:12, color:'#f59e0b' }}>v{VER} 更新内容</h2>
        <div style={{ fontSize:13, color:'#334155', lineHeight:2.2, textAlign:'left', padding:'0 20px', marginBottom:20 }}>
          <div>✅ 日常、超级挑战、真题与试炼场统一使用已核验题库</div>
          <div>📄 CSP-J/S 选择题按原卷恢复并内置离线快照</div>
          <div>⚡ 超级挑战完整显示每个小问题干和选项</div>
          <div>🛡️ 图表缺失、OCR 异常和未核验程序题自动隔离</div>
          <div>🔄 新题库支持校验哈希、缓存回退与后续热更新</div>
        </div>
        <button onClick={dismiss} style={{
          padding:'10px 32px', fontSize:14, fontWeight:700, background:'linear-gradient(135deg, #f59e0b, #fbbf24)',
          color:'#fff', border:'none', borderRadius:12, cursor:'pointer', boxShadow:'0 4px 12px rgba(245,158,11,0.3)',
        }}>知道了</button>
      </div>
    </div>
  );
}
// 主应用布局：侧边栏 + 路由出口 + 里程碑提示（地牢页面不经过此布局，全屏沉浸）
function AppLayout() {
  const [toast, setToast] = useState<string | null>(null);

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

  return (
    <>
      <PetActionHandler />
      <WelcomeModal />
      <ChangelogModal />
      <AppShell>
        <Outlet />
        {toast && <div className="milestone-toast">{toast}</div>}
      </AppShell>
    </>
  );
}

function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 顶层路由切换：进/出地牢时整体在 BrowserRouter 与 MemoryRouter 间二选一，避免 Router 嵌套。
  // 必须放在所有 early return 之前，保持 hooks 调用顺序稳定。
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener(APP_ROUTE_CHANGE_EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(APP_ROUTE_CHANGE_EVENT, update);
    };
  }, []);
  const loadConfig = useAIStore(s => s.loadConfig);
  const petLoaded = usePetStore(s => s.load);

  // Sync pet data to pet window and listen for clicks from pet window
  useEffect(() => {
    let hungerTimer: ReturnType<typeof setInterval>;
    const init = async () => {
      // Each step is wrapped independently — failure in one doesn't block the rest
      // 1. One-time migration: localStorage → SQLite (failure → fall back to localStorage)
      try { await migrateLocalStorageToSqlite(); } catch (e) { console.error('[init] migration failed:', e); }
      // 2. Preload problem status cache
      try { await loadProblemStatuses(); } catch (e) { console.error('[init] problemStatuses failed:', e); }
      // 3. Load all stores from SQLite (parallel). Each store has internal localStorage fallback.
      try {
        await Promise.all([
          petLoaded(),
          useHatchStore.getState().load(),
          useQuizStore.getState().load(),
        ]);
      } catch (e) { console.error('[init] store load failed:', e); }
      // 4. Apply offline hunger (before first save)
      try { usePetStore.getState().applyOfflineHunger(); } catch {}
      // 5. Sync to pet window
      usePetStore.getState().save();
      // 6. Start hunger timer: tick every 15 minutes while app is open
      hungerTimer = setInterval(() => {
        usePetStore.getState().tickHunger();
      }, 900000); // 15 min
      // 7. Weekly passive coins for Lv10+ pets
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
      const cleanupPetClick = safeListen('pet-click', () => {
        usePetStore.getState().save();
      });
      const cleanupPetSync = safeListen('pet-request-sync', () => {
        usePetStore.getState().save();
      });
      setTimeout(() => usePetStore.getState().save(), 500);
      return () => {
        cleanupPetClick();
        cleanupPetSync();
      };
    };
    // 15s safety timeout: force loading to finish even if init hangs
    const safetyTimer = setTimeout(() => {
      console.warn('[init] safety timeout — forcing load complete');
    }, 15000);
    let cleanupListeners: (() => void) | undefined;
    let disposed = false;
    init().then(cleanup => {
      if (disposed) cleanup?.();
      else cleanupListeners = cleanup;
    }).finally(() => clearTimeout(safetyTimer));
    return () => {
      disposed = true;
      if (hungerTimer) clearInterval(hungerTimer);
      cleanupListeners?.();
    };
  }, []);

  // Milestone toast listener — moved to AppLayout (only active in main app, not dungeon)

  useEffect(() => {
    loadConfig();
    useAIStore.getState().loadSessions();
    loadCourseData();
    // 窗口尺寸/位置由 tauri-plugin-window-state 在启动阶段同步恢复，无需前端介入
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
                  localStorage.setItem('csp_quiz_bank_version', String(remoteVer.version));
                } catch {}
              }
            }
          }
        }
      } catch { /* network error, use local */ }

      // Teacher-reviewed corrections are stored as a cloud overlay. Check its tiny
      // revision endpoint on every launch and download the merged bank only when needed.
      try {
        const reviewVersionResp = await tauriFetch('https://api.cspstudy.top/api/question-bank/version', { connectTimeout: 10_000 });
        if (reviewVersionResp.ok) {
          const reviewVersion = await reviewVersionResp.json();
          const mergedVersion = `${Number(reviewVersion.baseVersion) || 0}:${Number(reviewVersion.revision) || 0}`;
          if (mergedVersion !== localStorage.getItem('csp_reviewed_quiz_bank_version')) {
            const mergedBankResp = await tauriFetch('https://api.cspstudy.top/api/question-bank/data', { connectTimeout: 20_000 });
            if (mergedBankResp.ok) {
              const mergedBank = await mergedBankResp.json();
              if (mergedBank && typeof mergedBank === 'object' && !Array.isArray(mergedBank)) {
                localStorage.setItem('csp_quiz_bank', JSON.stringify(mergedBank));
                localStorage.setItem('csp_reviewed_quiz_bank_version', mergedVersion);
              }
            }
          }
        }
      } catch { /* keep the Gitee or bundled question bank */ }

      // V2 uses a tiny manifest check and downloads immutable snapshots only when
      // their revision changes. A failed refresh never blocks bundled offline use.
      refreshQuestionBankV2().catch(() => {});

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

  // 智子试炼场：全屏 MemoryRouter，与 BrowserRouter 平级不嵌套
  if (routePath.startsWith('/dungeon')) {
    return (
      <MemoryRouter>
        <DungeonEmbed />
      </MemoryRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* 主应用：侧边栏 + 内容区 */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/courses" replace />} />
          <Route path="/courses" element={<CourseList />} />
          <Route path="/ai-coach" element={<AIChat />} />
          <Route path="/quiz" element={<QuizPractice />} />
          <Route path="/pet" element={<PetPanel />} />
          <Route path="/achievements" element={<AchievementsPanel />} />
          <Route path="/exam" element={<ExamTraining />} />
          <Route path="/oj-training" element={<OJTraining />} />
          <Route path="/resources" element={<LearningResourcesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          {/* 兜底：未知路径回课程页 */}
          <Route path="*" element={<Navigate to="/courses" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
