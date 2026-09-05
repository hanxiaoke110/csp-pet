import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { usePetStore } from '../../stores/petStore';
import { useQuizStore } from '../../stores/quizStore';
import { ACHIEVEMENT_REWARDS, createAchievements, countUnlockedForDisplay, type Achievement } from '../../stores/achievements';

const CLAIM_KEY = 'csp_achievement_claimed';

const CATEGORIES: Record<string, { label: string; color: string }> = {
  course:   { label: '📚 学海无涯', color: '#16a34a' },
  quiz:     { label: '🧠 头脑风暴', color: '#2563eb' },
  super:    { label: '⚡ 极限挑战', color: '#7c3aed' },
  pet:      { label: '🐾 灵犀智子', color: '#f59e0b' },
  hidden:   { label: '🌟 隐藏成就', color: '#ec4899' },
};

export default function AchievementsPanel() {
  const ownedPets = usePetStore(s => s.ownedPets);
  const maxCoinBalance = usePetStore(s => s.maxCoinBalance);
  const quizState = useQuizStore();
  const [refreshTick, setRefreshTick] = useState(0);

  // Listen for problem status changes so course achievements refresh immediately
  useEffect(() => {
    const handler = () => setRefreshTick(t => t + 1);
    window.addEventListener('problem-status-changed', handler);
    return () => window.removeEventListener('problem-status-changed', handler);
  }, []);

  // Count feed from localStorage
  let feedCount = 0;
  try { feedCount = parseInt(localStorage.getItem('csp_feed_count') || '0'); } catch {}

  const achievements = useMemo(() => {
    return createAchievements(
      ownedPets.length,
      Math.max(0, ...ownedPets.map(p => p.level || 0)),
      Math.max(0, ...ownedPets.map(p => p.affection || 0)),
      maxCoinBalance,
      feedCount,
      false,
      quizState.superCompletions,
      quizState.superBestScore,
      quizState.superBestTotal,
      quizState.weeklyPerfects,
      quizState.extraChallengeCount,
      quizState.lastReviewCorrect,
      quizState.lastReviewTotal,
      ownedPets,
    );
  }, [ownedPets, maxCoinBalance, feedCount, quizState.superCompletions, quizState.superBestScore, quizState.superBestTotal, quizState.weeklyPerfects, quizState.extraChallengeCount, quizState.lastReviewCorrect, quizState.lastReviewTotal, refreshTick]);

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, Achievement[]> = {};
    for (const a of achievements) {
      if (!map[a.category]) map[a.category] = [];
      map[a.category].push(a);
    }
    return map;
  }, [achievements]);

  // Load claimed set from localStorage
  const [claimed, setClaimed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CLAIM_KEY) || '[]')); } catch { return new Set(); }
  });

  const saveClaimed = (next: Set<string>) => {
    try { localStorage.setItem(CLAIM_KEY, JSON.stringify([...next])); } catch {}
  };

  // 计数与卡片同口径：领取过的成就即使实时条件回退也计入“已解锁”
  const unlockedCount = countUnlockedForDisplay(achievements, claimed);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newUnlock, setNewUnlock] = useState<Achievement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const prevUnlocked = useRef<Set<string> | null>(null);

  const handleClaim = useCallback((achId: string) => {
    const reward = ACHIEVEMENT_REWARDS[achId];
    if (!reward) return;
    let persisted = new Set<string>();
    try { persisted = new Set(JSON.parse(localStorage.getItem(CLAIM_KEY) || '[]')); } catch {}
    if (persisted.has(achId)) return;
    const store = usePetStore.getState();
    store.addCoins(reward.coins);
    if (reward.renameCards) { store.addRenameCards(reward.renameCards); }
    const next = new Set([...claimed, ...persisted]);
    next.add(achId);
    setClaimed(next);
    saveClaimed(next);
    setToast(`🎁 +${reward.coins}g${reward.renameCards ? ' + 改名卡×' + reward.renameCards : ''}`);
    setTimeout(() => setToast(null), 3000);
  }, [claimed]);

  // Detect new unlocks for notification only (no auto-reward)
  useEffect(() => {
    const nowUnlocked = new Set(achievements.filter(a => a.check().unlocked).map(a => a.id));
    if (!prevUnlocked.current) { prevUnlocked.current = nowUnlocked; return; }
    const newlyUnlocked = achievements.find(a =>
      a.check().unlocked
      && !claimed.has(a.id)
      && !prevUnlocked.current!.has(a.id)
    );
    if (newlyUnlocked) {
      setNewUnlock(newlyUnlocked);
      setTimeout(() => setNewUnlock(null), 4000);
    }
    prevUnlocked.current = nowUnlocked;
  }, [achievements, claimed]);

  return (
    <div className="achievements-panel">
      <div className="ach-header">
        <h2>🏆 成就</h2>
        <span className="ach-count">{unlockedCount}/{achievements.length} 已解锁</span>
      </div>

      {Object.entries(CATEGORIES).map(([key, cat]) => {
        const items = grouped[key];
        if (!items || items.length === 0) return null;

        return (
          <div key={key} className="ach-category">
            <div className="ach-cat-header" style={{ borderLeftColor: cat.color }}
              onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}>
              <span className="ach-cat-arrow">{expanded[key] ? '▼' : '▶'}</span>
              <span>{cat.label}</span>
              <span className="ach-cat-count">
                {countUnlockedForDisplay(items, claimed)}/{items.length}
              </span>
            </div>
            {expanded[key] && (
            <div className="ach-grid">
              {items.map(a => {
                const result = a.check();
                const isClaimed = claimed.has(a.id);
                // Once claimed, always treat as unlocked so hidden achievements don't revert to ???
                const unlocked = result.unlocked || isClaimed;
                return (
                  <div key={a.id} className={`ach-card ${unlocked ? 'unlocked' : 'locked'}`}>
                    <div className="ach-icon">{unlocked ? a.icon : '🔒'}</div>
                    <div className="ach-info">
                      <div className="ach-name">{unlocked ? a.name : '???'}</div>
                      <div className="ach-desc">{unlocked || !a.hidden ? a.description : '???'}</div>
                      {result.progress !== undefined && result.total && !unlocked && (
                        <div className="ach-bar">
                          <div className="ach-fill" style={{ width: `${(result.progress / result.total) * 100}%` }} />
                          <span className="ach-bar-text">{result.progress}/{result.total}</span>
                        </div>
                      )}
                      {unlocked && !isClaimed && ACHIEVEMENT_REWARDS[a.id] && (
                        <button className="ach-claim-btn" onClick={() => handleClaim(a.id)}
                          style={{ marginTop: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer',
                            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#fff' }}>
                          🎁 领取 +{ACHIEVEMENT_REWARDS[a.id].coins}g
                        </button>
                      )}
                      {isClaimed && <span className="ach-claimed" style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>✅ 已领取</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        );
      })}

      {newUnlock && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #fef3c7, #fde68a)', color: '#92400e',
          padding: '12px 24px', borderRadius: 14, fontSize: 15, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(245,158,11,0.4)', zIndex: 2000,
          animation: 'toastIn .3s ease-out', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 28 }}>{newUnlock.icon}</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>🏆 成就解锁！</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{newUnlock.name}</div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #10b981, #34d399)', color: '#fff',
          padding: '10px 24px', borderRadius: 14, fontSize: 14, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(16,185,129,0.4)', zIndex: 2000,
          animation: 'toastIn .3s ease-out',
        }}>{toast}</div>
      )}
    </div>
  );
}
