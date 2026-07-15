import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { getRankName } from '../../utils/gameLogic';
import type { DungeonDefinition, DungeonProgress } from '../../types/dungeon';

export default function DungeonMap() {
  const navigate = useNavigate();
  const player = useDungeonStore(s => s.player);
  const dungeons = useDungeonStore(s => s.dungeons);
  const progress = useDungeonStore(s => s.dungeonProgress);
  const setView = useDungeonStore(s => s.setView);
  const isUnlocked = useDungeonStore(s => s.isDungeonUnlocked);
  const weeklyChallenges = useDungeonStore(s => s.weeklyChallenges);
  const buyRewardChallenge = useDungeonStore(s => s.buyRewardChallenge);

  const rankName = getRankName(player.school, player.rankTier);

  const getDungeonStatus = (dungeonId: string): DungeonProgress | undefined => {
    return progress.find(p => p.dungeonId === dungeonId);
  };

  const handleEnterDungeon = (dungeon: DungeonDefinition) => {
    if (!isUnlocked(dungeon.id)) return;
    setView('dungeon-preview');
    navigate(`/dungeon/${dungeon.id}`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a2005 0%, #0a1500 30%, #0a0a0a 100%)',
      padding: '16px',
    }}>
      {/* Status bar */}
      <div className="status-bar" style={{ marginBottom: '16px' }}>
        <div className="status-item">
          <span className="status-label">流派</span>
          <span className="status-value gold-text">{rankName}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Lv</span>
          <span className="status-value">{player.playerLevel}</span>
        </div>
        <div className="status-item" style={{ flex: 1 }}>
          <span className="status-label">EXP</span>
          <div className="pixel-progress" style={{ width: '120px', height: '10px' }}>
            <div className="pixel-progress-fill exp" style={{
              width: `${(player.exp / player.expToNext) * 100}%`
            }} />
          </div>
        </div>
        <div className="status-item">
          <span className="status-label">💰</span>
          <span className="status-value gold-text">{player.gold}</span>
        </div>
        <button
          className="pixel-btn"
          style={{ fontSize: '10px', padding: '4px 10px' }}
          title={`本周奖励次数 ${weeklyChallenges.used}/${weeklyChallenges.limit}`}
          onClick={() => {
            const ok = buyRewardChallenge();
            if (!ok) window.alert('金币不足，需要 120 金币。');
          }}
        >
          🎟️ +1奖励 120金
        </button>
        <div className="status-item">
          <span className="status-label">⚡</span>
          <span className="status-value" style={{ color: player.currentStreak >= 5 ? 'var(--crit-yellow)' : 'var(--text-light)' }}>
            {player.currentStreak}连击
          </span>
        </div>
        <button className="pixel-btn" style={{ fontSize: '10px', padding: '4px 10px' }}
          onClick={() => { setView('profile'); navigate('/profile'); }}>
          👤
        </button>
      </div>

      {/* Map title */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h2 style={{
          fontFamily: 'var(--pixel-font)', fontSize: '14px', color: 'var(--gold)',
          textShadow: '0 0 10px rgba(255,215,0,0.2)',
        }}>
          🗺️ 潜龙秘境 · 世界地图
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '6px' }}>
          已征服：{progress.filter(p => p.status === 'cleared').length}/8 副本
        </p>
      </div>

      {/* Dungeon grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        {dungeons.map((dungeon) => {
          const dp = getDungeonStatus(dungeon.id);
          const unlocked = isUnlocked(dungeon.id);
          const cleared = dp?.status === 'cleared';
          const locked = !unlocked;

          return (
            <div
              key={dungeon.id}
              className={`pixel-card ${!locked ? '' : ''}`}
              onClick={() => handleEnterDungeon(dungeon)}
              style={{
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.5 : 1,
                borderColor: locked ? 'var(--border-pixel)' : cleared ? dungeon.color : 'var(--gold-dark)',
                borderWidth: cleared ? '3px' : 'var(--pixel-border)',
                transition: 'all 0.2s',
                position: 'relative',
                background: locked ? 'var(--bg-card)' : `linear-gradient(135deg, var(--bg-card), ${dungeon.color}22)`,
              }}
            >
              {/* Status badge */}
              <div style={{
                position: 'absolute', top: '8px', right: '8px',
                fontSize: '10px', padding: '2px 8px',
                background: cleared ? `${dungeon.color}33` : locked ? '#333' : 'var(--gold-dark)',
                color: cleared ? dungeon.color : locked ? '#666' : 'var(--gold)',
                border: `1px solid ${cleared ? dungeon.color : locked ? '#444' : 'var(--gold-dark)'}`,
              }}>
                {locked ? '🔒 封印' : cleared ? '✅ 已通关' : '⚔️ 挑战中'}
              </div>

              {/* Dungeon info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '32px' }}>{dungeon.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: locked ? 'var(--text-dim)' : dungeon.color }}>
                    {dungeon.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{dungeon.subtitle}</div>
                </div>
              </div>

              {/* Progress */}
              {dp && !locked && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    <span>关卡 {dp.completedStages}/{dp.totalStages}</span>
                    {dp.bossDefeated ? <span style={{ color: dungeon.color }}>Boss 已击败</span> : <span>Boss 未挑战</span>}
                  </div>
                  <div className="pixel-progress" style={{ height: '8px' }}>
                    <div className="pixel-progress-fill exp" style={{
                      width: `${(dp.completedStages / Math.max(dp.totalStages, 1)) * 100}%`,
                      background: dungeon.color,
                    }} />
                  </div>
                </div>
              )}

              {/* Requirement */}
              {dungeon.requiredDungeon && (
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '8px' }}>
                  前置：需通关「{(dungeons.find(d => d.id === dungeon.requiredDungeon) || {}).name || '?'}」
                </div>
              )}

              {/* Level requirement */}
              {dungeon.unlockLevel > 1 && (
                <div style={{ fontSize: '10px', color: player.playerLevel < dungeon.unlockLevel ? 'var(--hp-red)' : 'var(--text-dim)', marginTop: '4px' }}>
                  需要等级 {dungeon.unlockLevel} {player.playerLevel < dungeon.unlockLevel ? '(未达到)' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div style={{
        display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px',
      }}>
        <button className="pixel-btn" onClick={() => { setView('leaderboard'); navigate('/leaderboard'); }}>
          🏆 排行榜
        </button>
        <button className="pixel-btn" onClick={() => { setView('profile'); navigate('/profile'); }}>
          👤 个人档案
        </button>
      </div>
    </div>
  );
}
