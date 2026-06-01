import { useMemo, useState, useEffect, useRef } from 'react';
import { usePetStore } from '../../stores/petStore';
import { createAchievements, type Achievement } from '../../stores/achievements';

const CATEGORIES: Record<string, { label: string; color: string }> = {
  course:   { label: '📚 学海无涯', color: '#16a34a' },
  quiz:     { label: '🧠 头脑风暴', color: '#2563eb' },
  super:    { label: '⚡ 极限挑战', color: '#7c3aed' },
  pet:      { label: '🐾 灵犀智子', color: '#f59e0b' },
  hidden:   { label: '🌟 隐藏成就', color: '#ec4899' },
};

export default function AchievementsPanel() {
  const ownedPets = usePetStore(s => s.ownedPets);
  const activePet = usePetStore(s => s.getActivePet());
  const coins = usePetStore(s => s.coins);

  // Count feed from localStorage
  let feedCount = 0;
  try { feedCount = parseInt(localStorage.getItem('csp_feed_count') || '0'); } catch {}

  // Read super challenge stats from localStorage
  let superCompletions = 0;
  let superBestScore = 0;
  try {
    const qs = JSON.parse(localStorage.getItem('csp_quiz_state') || '{}');
    superCompletions = qs.superCompletions || 0;
    superBestScore = qs.superBestScore || 0;
  } catch {}

  const achievements = useMemo(() => {
    const elements = new Set(ownedPets.map(p => p.element));
    const hasAllElements = elements.has('earth') && elements.has('fire') && elements.has('wind') && elements.has('water');

    return createAchievements(
      ownedPets.length,
      activePet?.level || 0,
      activePet?.affection || 0,
      coins,
      feedCount,
      hasAllElements,
      superCompletions,
      superBestScore,
    );
  }, [ownedPets, activePet, coins, feedCount, superCompletions, superBestScore]);

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, Achievement[]> = {};
    for (const a of achievements) {
      if (!map[a.category]) map[a.category] = [];
      map[a.category].push(a);
    }
    return map;
  }, [achievements]);

  const unlockedCount = achievements.filter(a => a.check().unlocked).length;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newUnlock, setNewUnlock] = useState<Achievement | null>(null);
  const prevUnlocked = useRef<Set<string> | null>(null);

  // Detect new unlocks, give reward, and show notification (skip initial mount)
  useEffect(() => {
    const nowUnlocked = new Set(achievements.filter(a => a.check().unlocked).map(a => a.id));
    if (!prevUnlocked.current) {
      prevUnlocked.current = nowUnlocked;
      return;
    }
    const newlyUnlocked = achievements.find(a => a.check().unlocked && !prevUnlocked.current!.has(a.id));
    if (newlyUnlocked) {
      setNewUnlock(newlyUnlocked);
      setTimeout(() => setNewUnlock(null), 4000);
      // Achievement reward: 10g
      usePetStore.getState().addCoins(10);
    }
    prevUnlocked.current = nowUnlocked;
  }, [achievements]);

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
                {items.filter(a => a.check().unlocked).length}/{items.length}
              </span>
            </div>
            {expanded[key] && (
            <div className="ach-grid">
              {items.map(a => {
                const result = a.check();
                const unlocked = result.unlocked;
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
    </div>
  );
}
