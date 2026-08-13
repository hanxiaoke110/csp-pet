import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDungeonStore } from './stores/dungeonStore';
import { loadQuestionBank, loadDungeons, loadQuestionMapping } from './utils/questionLoader';
import { getStoredClassCode, getStoredHash } from './utils/api';
import { readDesktopBinding } from './utils/autoRegister';
import type { DungeonProgress } from './types/dungeon';
import { CURRENT_DUNGEON_SEASON_ID } from './data/season';

// Screen imports (will be created in later phases)
import TitleScreen from './components/screens/TitleScreen';
import RegisterScreen from './components/screens/RegisterScreen';
import DungeonMap from './components/screens/DungeonMap';
import DungeonEntrance from './components/screens/DungeonEntrance';
import BattleScreen from './components/screens/BattleScreen';
import RewardScreen from './components/screens/RewardScreen';
import LeaderboardScreen from './components/screens/LeaderboardScreen';
import ProfileScreen from './components/screens/ProfileScreen';
import HealingScreen from './components/screens/HealingScreen';
import TrialSupplyScreen from './components/screens/TrialSupplyScreen';

// 战斗路由门禁：题库未就绪时不进战斗，避免“选技能永远弹‘题库准备中’、打不过去”。
function BattleRoute({ children }: { children: ReactNode }) {
  const questionBank = useDungeonStore(s => s.questionBank);
  const [retrying, setRetrying] = useState(false);
  const load = useCallback(async () => {
    setRetrying(true);
    try {
      const bank = await loadQuestionBank();
      if (bank.length > 0) useDungeonStore.getState().setQuestionBank(bank);
    } catch { /* 保持空库，由重试按钮继续 */ }
    setRetrying(false);
  }, []);
  useEffect(() => {
    if (questionBank.length === 0) void load();
  }, [questionBank.length, load]);

  if (questionBank.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-title">题库准备中，请稍候...</div>
        <button className="pixel-btn" disabled={retrying} onClick={() => void load()} style={{ marginTop: 16 }}>
          {retrying ? '加载中...' : '重试'}
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

export function AppContent() {
  const store = useDungeonStore();

  // Initialize: load data + restore state
  useEffect(() => {
    async function init() {
      try {
        store.setLoading(true);

        // Restore player progress from localStorage
        const hasLocal = store.loadFromLocalStorage();
        const needsSeasonMigration = hasLocal
          && useDungeonStore.getState().player.season !== CURRENT_DUNGEON_SEASON_ID;

        // 通关榜修复推送：本地已通关/已击败 Boss 的副本，若服务端没记上（早期版本
        // 未上报、reportBattle 失败、离线通关、重打不发奖不推进状态），通关榜会少算。
        // 每次启动把这些副本进度推一次；服务端 sync 按 bossDefeated/满关升级为
        // cleared（只升不降，v1.7.32+ 服务端支持）。
        if (hasLocal && !needsSeasonMigration) {
          const clearedDps = useDungeonStore.getState().dungeonProgress
            .filter(dp => dp.status === 'cleared' || dp.bossDefeated);
          if (clearedDps.length > 0) {
            import('./utils/api').then(({ syncProgress }) => {
              syncProgress({
                dungeon_progress: clearedDps.map(dp => ({
                  dungeonId: dp.dungeonId, status: dp.status, completedStages: dp.completedStages,
                  totalStages: dp.totalStages, bossDefeated: dp.bossDefeated,
                  bestScore: dp.bestScore, bestRating: dp.bestRating,
                })),
              }).catch(() => {});
            }).catch(() => {});
          }
        }

        // 换班级码检测：本地 dungeon_player.classCode 与桌面当前 csp_class_code 不一致时，
        // 更新本地 classCode（进度/金币/段位全保留，数据按 device_hash 继承），并异步 sync 到服务端。
        // 不调 register（已 active 会 409）；sync 端点已支持 class_code 白名单 + 班级码合法性校验 + teacher_id 同步。
        if (hasLocal) {
          const localCc = useDungeonStore.getState().player.classCode;
          const desktopCc = getStoredClassCode();
          if (desktopCc && localCc && localCc !== desktopCc) {
            useDungeonStore.getState().setClassCode(desktopCc);
            useDungeonStore.getState().saveToLocalStorage();
            import('./utils/api').then(({ syncProgress }) => {
              syncProgress({ class_code: desktopCc }).catch(() => {});
            }).catch(() => {});
          }
        }

        // Load dungeons (bundled, fast)
        const dungeons = await loadDungeons();
        store.initDungeons(dungeons);
        // New seasons reset trial-only progress and rankings while preserving pets, coins,
        // purchases, skins and trial inventory in their existing stores.
        const seasonMigrated = store.migrateSeason(dungeons);

        // Initialize progress for new players
        if (!hasLocal && !seasonMigrated) {
          const defaultProgress: DungeonProgress[] = dungeons.map(d => ({
            dungeonId: d.id,
            status: (!d.requiredDungeon ? 'unlocked' : 'locked') as DungeonProgress['status'],
            completedStages: 0,
            totalStages: d.stages.length,
            currentStageId: null,
            bossDefeated: false,
            bestScore: 0,
            bestRating: 'D',
          }));
          store.setView('title');
          const binding = readDesktopBinding();
          if (binding) {
            useDungeonStore.getState().initPlayer({
              deviceHash: getStoredHash(),
              classCode: binding.classCode,
              displayName: binding.displayName,
              realName: binding.realName,
              phone: binding.phone,
            });
          } else {
            const cc = getStoredClassCode();
            if (cc) {
              useDungeonStore.getState().initPlayer({
                deviceHash: getStoredHash(),
                classCode: cc,
              });
            }
          }
          store.initProgress(defaultProgress);
        }

        // Load questions in background, with retry:
        // 题库未就绪时战斗技能完全无法出题，失败重试（0s/3s/8s）降低空库概率。
        const loadBankWithRetry = async (attempt = 0) => {
          try {
            const bank = await loadQuestionBank();
            if (bank.length > 0) {
              store.setQuestionBank(bank);
              return;
            }
          } catch { /* fallthrough to retry */ }
          if (attempt < 2) {
            window.setTimeout(() => { void loadBankWithRetry(attempt + 1); }, attempt === 0 ? 3000 : 8000);
          }
        };
        void loadBankWithRetry();

        loadQuestionMapping().then(mapping => {
          store.setQuestionMapping(mapping);
        }).catch(() => {});

        store.setLoading(false);
      } catch (err) {
        store.setError(err instanceof Error ? err.message : '加载失败');
        store.setLoading(false);
      }
    }
    init();
  }, []);

  if (store.loading) {
    return (
      <div className="loading-screen">
        <div className="loading-title">🐉 潜龙秘境加载中...</div>
        <div className="loading-bar-container">
          <div className="loading-bar-fill" />
        </div>
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="loading-screen">
        <div className="loading-title">⚡ 秘境入口不稳定</div>
        <p>{store.error}</p>
        <button className="pixel-btn" onClick={() => window.location.reload()}>
          重新连接
        </button>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<TitleScreen />} />
      <Route path="/register" element={<RegisterScreen />} />
      <Route path="/map" element={<DungeonMap />} />
      <Route path="/dungeon/:dungeonId" element={<DungeonEntrance />} />
      <Route path="/battle/:dungeonId/:stageId" element={<BattleRoute><BattleScreen /></BattleRoute>} />
      <Route path="/battle/:dungeonId" element={<BattleRoute><BattleScreen /></BattleRoute>} />
      <Route path="/reward/:dungeonId" element={<RewardScreen />} />
      <Route path="/leaderboard" element={<LeaderboardScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="/healing" element={<HealingScreen />} />
      <Route path="/supplies" element={<TrialSupplyScreen />} />
      {/* /login 已废弃：桌面端复用班级绑定身份，无换设备登录场景。文件保留备用。 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
