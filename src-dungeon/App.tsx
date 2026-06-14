import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDungeonStore } from './stores/dungeonStore';
import { loadQuestionBank, loadDungeons, loadQuestionMapping } from './utils/questionLoader';
import { getStoredClassCode } from './utils/api';
import type { DungeonDefinition, Question, DungeonProgress } from './types/dungeon';

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
import LoginScreen from './components/screens/LoginScreen';

function AppContent() {
  const store = useDungeonStore();
  const [initDone, setInitDone] = useState(false);

  // Initialize: load data + restore state
  useEffect(() => {
    async function init() {
      try {
        store.setLoading(true);

        // Restore player progress from localStorage
        const hasLocal = store.loadFromLocalStorage();

        // Load dungeons (bundled, fast)
        const dungeons = await loadDungeons();
        store.initDungeons(dungeons);

        // Initialize progress for new players
        if (!hasLocal) {
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
          const cc = getStoredClassCode();
          if (cc) {
            useDungeonStore.getState().initPlayer({
              deviceHash: crypto.randomUUID?.() || 'dh-' + Date.now(),
              classCode: cc,
            });
          }
          store.initProgress(defaultProgress);
        }

        // Load questions in background
        loadQuestionBank().then(bank => {
          store.setQuestionBank(bank);
        }).catch(() => {});

        loadQuestionMapping().then(mapping => {
          store.setQuestionMapping(mapping);
        }).catch(() => {});

        setInitDone(true);
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
      <Route path="/battle/:dungeonId/:stageId" element={<BattleScreen />} />
      <Route path="/battle/:dungeonId" element={<BattleScreen />} />
      <Route path="/reward/:dungeonId" element={<RewardScreen />} />
      <Route path="/leaderboard" element={<LeaderboardScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="/healing" element={<HealingScreen />} />
      <Route path="/login" element={<LoginScreen />} />
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
