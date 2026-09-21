import { BrowserRouter, Routes, Route, Navigate, useNavigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { petCopy } from './components/pet/PetCopy';
import { invoke } from '@tauri-apps/api/core';
import { MemoryRouter } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import QuizPractice from './components/quiz/QuizPractice';
import PetPanel from './components/pet/PetPanel';
import MyPage from './components/profile/MyPage';
import CollectorCardsPage from './components/cards/CollectorCardsPage';
import OJTraining from './components/oj/OJTraining';
import ExamTraining from './components/exam/ExamTraining';
import SettingsPage from './components/settings/SettingsPage';
import WindowSkinsPage from './components/skins/WindowSkinsPage';
import AdminPage from './components/admin/AdminPage';
import LearningResourcesPage from './components/resources/LearningResourcesPage';
import AnnouncementPage from './components/announcements/AnnouncementPage';
import DungeonEmbed from '../src-dungeon/DungeonEmbed';
import { APP_ROUTE_CHANGE_EVENT } from '../src-dungeon/utils/routeBridge';
import { refreshQuestionBankV2 } from './question-bank/repository';
import { safeListen } from './lib/tauriEvents';
import { useHatchStore } from './stores/hatchStore';
import { usePetStore } from './stores/petStore';
import { useQuizStore } from './stores/quizStore';
import { useCollectorCardStore } from './stores/collectorCardStore';
import { migrateLocalStorageToSqlite } from './lib/migration';
import { loadProblemStatuses } from './lib/problemStatusCache';
import { ensureDailyAutomaticBackup } from './lib/backup';
import { nextCheckin } from './utils/checkin';
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

function doCheckinFromPet() {
  try {
    const checkin = nextCheckin();
    if (checkin.alreadyChecked) {
      emit('pet-bubble', { text: petCopy.checkinAlready() }).catch(() => {});
      return;
    }
    const streak = checkin.streak;
    let bonus = 50;
    if (streak % 8 === 0) {
      bonus = 200;
      usePetStore.setState(s => ({ renameCards: s.renameCards + 1 }));
    }
    else if (streak % 4 === 0) { bonus = 100; }
    usePetStore.getState().addCoins(bonus);
    localStorage.setItem('csp_checkin', JSON.stringify({ week: checkin.week, streak }));
    emit('pet-bubble', { text: petCopy.checkinSuccess(streak, bonus) }).catch(() => {});
    setTimeout(() => usePetStore.getState().save(), 100);
  } catch {
    emit('pet-bubble', { text: petCopy.checkinFallback() }).catch(() => {});
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
        <img
          src="/app-icon.png"
          alt="CSP 学习助手"
          style={{ width: 76, height: 76, objectFit: 'contain', marginBottom: 8 }}
        />
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
  const VER = '1.7.48';
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
          <div>🧭 学习区精简为选择题、真题、OJ 与学习资料</div>
          <div>📜 已完成的旧课程成就升级为永久“绝版荣誉”</div>
          <div>✨ 课程关联装扮改用新挑战解锁，老玩家权益保留</div>
          <div>🧹 移除课程与 AI 教练缓存，启动更轻、更稳定</div>
          <div>💾 金币、智子、收藏、迷宫与备份数据全部兼容</div>
        </div>
        <button onClick={dismiss} style={{
          padding:'10px 32px', fontSize:14, fontWeight:700, background:'linear-gradient(135deg, #f59e0b, #fbbf24)',
          color:'#fff', border:'none', borderRadius:12, cursor:'pointer', boxShadow:'0 4px 12px rgba(245,158,11,0.3)',
        }}>知道了</button>
      </div>
    </div>
  );
}
// 主应用布局：侧边栏 + 路由出口（地牢页面不经过此布局，全屏沉浸）
function AppLayout() {
  return (
    <>
      <PetActionHandler />
      <WelcomeModal />
      <ChangelogModal />
      <AppShell>
        <Outlet />
      </AppShell>
    </>
  );
}

function App() {
  const [loading, setLoading] = useState(true);
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
  const petLoaded = usePetStore(s => s.load);
  const collectorCardsLoaded = useCollectorCardStore(s => s.load);

  // Sync pet data to pet window and listen for clicks from pet window
  useEffect(() => {
    let hungerTimer: ReturnType<typeof setInterval>;
    const init = async () => {
      let petDataLoaded = false;
      // Each step is wrapped independently — failure in one doesn't block the rest
      // 1. One-time migration: localStorage → SQLite (failure → fall back to localStorage)
      try { await migrateLocalStorageToSqlite(); } catch (e) { console.error('[init] migration failed:', e); }
      // 2. Preload problem status cache
      try { await loadProblemStatuses(); } catch (e) { console.error('[init] problemStatuses failed:', e); }
      // Retired course catalogs are disposable download caches, not student progress.
      // Clear only those large caches; completed records, rewards and legacy honors stay intact.
      try {
        localStorage.removeItem('csp_imported_lessons');
        localStorage.removeItem('csp_data_version');
        localStorage.removeItem('csp_course_data_source');
      } catch {}
      // 3. Load all stores from SQLite (parallel). Each store has internal localStorage fallback.
      try {
        const [loaded] = await Promise.all([
          petLoaded(),
          useHatchStore.getState().load(),
          useQuizStore.getState().load(),
          collectorCardsLoaded(),
        ]);
        petDataLoaded = loaded;
      } catch (e) { console.error('[init] store load failed:', e); }
      // 4. Apply offline hunger (before first save)
      if (petDataLoaded) {
        try { usePetStore.getState().applyOfflineHunger(); } catch {}
      }
      // 4.5 Auto feeder: catch up if hunger is already below the threshold at startup
      if (petDataLoaded) {
        try { usePetStore.getState().runAutoFeeder(); } catch {}
      }
      // 5. Sync to pet window
      if (petDataLoaded) {
        usePetStore.getState().save();
        void ensureDailyAutomaticBackup().catch(error => {
          console.error('[backup] daily automatic backup failed:', error);
        });
      }
      // 独立桌宠窗口的启动恢复延后到主界面加载完成后再做（见下方 effect），
      // 避免启动阶段创建第二个 WebView2 环境与主界面初始化竞争。
      // 6. Start hunger timer: tick every 15 minutes while app is open
      hungerTimer = setInterval(() => {
        usePetStore.getState().tickHunger();
      }, 900000); // 15 min
      const cleanupPetClick = safeListen('pet-click', () => {
        const state = usePetStore.getState();
        if (petDataLoaded || state.ownedPets.length > 0) state.save();
      });
      const cleanupPetSync = safeListen('pet-request-sync', () => {
        const state = usePetStore.getState();
        if (petDataLoaded || state.ownedPets.length > 0) state.save();
      });
      if (petDataLoaded) setTimeout(() => usePetStore.getState().save(), 500);
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

  // 单窗多宠架构（v1.7.31）：桌面伙伴不再需要启动恢复——它们与主智子同在
  // 一个 pet 窗口里渲染，pet-data-sync 事件驱动，无独立窗口可恢复。

  useEffect(() => {
    refreshQuestionBankV2().catch(() => {});
    setLoading(false);
    // 窗口尺寸/位置由 tauri-plugin-window-state 在启动阶段同步恢复，无需前端介入
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>正在加载学习数据…</p>
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
          <Route path="/" element={<Navigate to="/quiz" replace />} />
          <Route path="/courses" element={<Navigate to="/quiz" replace />} />
          <Route path="/ai-coach" element={<Navigate to="/quiz" replace />} />
          <Route path="/quiz" element={<QuizPractice />} />
          <Route path="/pet" element={<PetPanel />} />
          <Route path="/me" element={<MyPage />} />
          <Route path="/achievements" element={<Navigate to="/me" replace />} />
          <Route path="/collector-cards" element={<CollectorCardsPage />} />
          <Route path="/exam" element={<ExamTraining />} />
          <Route path="/oj-training" element={<OJTraining />} />
          <Route path="/resources" element={<LearningResourcesPage />} />
          <Route path="/announcements" element={<AnnouncementPage />} />
          <Route path="/window-skins" element={<WindowSkinsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          {/* 兜底：未知路径回选择题页 */}
          <Route path="*" element={<Navigate to="/quiz" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
