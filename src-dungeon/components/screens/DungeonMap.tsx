import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { usePetStore } from '../../../src/stores/petStore';
import { getRankName } from '../../utils/gameLogic';
import type { DungeonDefinition, DungeonProgress } from '../../types/dungeon';
import { CURRENT_DUNGEON_SEASON_NAME } from '../../data/season';

export default function DungeonMap() {
  const coins = usePetStore(s => s.coins);
  const navigate = useNavigate();
  const player = useDungeonStore(s => s.player);
  const dungeons = useDungeonStore(s => s.dungeons);
  const progress = useDungeonStore(s => s.dungeonProgress);
  const setView = useDungeonStore(s => s.setView);
  const isUnlocked = useDungeonStore(s => s.isDungeonUnlocked);
  const weeklyChallenges = useDungeonStore(s => s.weeklyChallenges);
  const buyRewardChallenge = useDungeonStore(s => s.buyRewardChallenge);
  const trialInventory = useDungeonStore(s => s.trialInventory);

  const rankName = getRankName(player.school, player.rankTier);
  const rewardChallengesRemaining = Math.max(0, weeklyChallenges.limit - weeklyChallenges.used);

  const getDungeonStatus = (dungeonId: string): DungeonProgress | undefined => {
    return progress.find(p => p.dungeonId === dungeonId);
  };

  const handleEnterDungeon = (dungeon: DungeonDefinition) => {
    if (!isUnlocked(dungeon.id)) return;
    setView('dungeon-preview');
    navigate(`/dungeon/${dungeon.id}`);
  };

  return (
    <div className="dungeon-page-bg dungeon-map-page" style={{
      minHeight: '100vh',
      backgroundImage: 'linear-gradient(180deg, rgba(5, 15, 20, 0.40) 0%, rgba(4, 12, 14, 0.66) 50%, rgba(3, 7, 9, 0.92) 100%), url("/dungeon-art-v3/season-2-key-art.webp")',
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
          <span className="status-value gold-text">{coins}</span>
        </div>
        <div className="reward-pass">
          <div className="reward-pass-status" title="本周仍可获得完整结算奖励的挑战次数">
            <span>🎟️ 本周奖励</span>
            <strong>{rewardChallengesRemaining}/{weeklyChallenges.limit}</strong>
          </div>
          <button
            className="pixel-btn reward-pass-buy"
            title="消耗 120 个通用金币，增加 1 次本周有奖挑战资格"
            onClick={() => {
            if (!window.confirm('消耗 120 个通用金币，增加 1 次本周有奖挑战资格？')) return;
              const ok = buyRewardChallenge();
              window.alert(ok ? '已增加 1 次本周有奖挑战资格。' : '通用金币不足，需要 120 金币。');
            }}
          >
            +1 次 · 120 金币
          </button>
        </div>
        <div className="status-item">
          <span className="status-label">⚡</span>
          <span className="status-value" style={{ color: player.currentStreak >= 5 ? 'var(--crit-yellow)' : 'var(--text-light)' }}>
            {player.currentStreak}连击
          </span>
        </div>
        <button className="pixel-btn" style={{ fontSize: '10px', padding: '4px 10px', borderColor: trialInventory.equippedAvatarFrame === 'frame-crystal' ? '#2dd4bf' : undefined, boxShadow: trialInventory.equippedAvatarFrame === 'frame-crystal' ? '0 0 0 2px rgba(45,212,191,0.2)' : undefined }}
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
          潜龙秘境 · {CURRENT_DUNGEON_SEASON_NAME}
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '6px' }}>
          第二赛季 · 已征服 {progress.filter(p => p.status === 'cleared').length}/8 副本
        </p>
        {trialInventory.equippedTitle === 'title-data-scout' && (
          <div style={{ display: 'inline-block', marginTop: '6px', padding: '3px 8px', border: '1px solid #2dd4bf', color: '#99f6e4', fontSize: '10px' }}>数据侦察员</div>
        )}
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
            <button
              key={dungeon.id}
              type="button"
              className={`pixel-card dungeon-map-card ${locked ? 'is-locked' : ''}`}
              onClick={() => handleEnterDungeon(dungeon)}
              style={{
                width: '100%', textAlign: 'left', color: 'inherit', font: 'inherit',
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.5 : 1,
                borderColor: locked ? 'var(--border-pixel)' : cleared ? dungeon.color : 'var(--gold-dark)',
                borderWidth: cleared ? '3px' : 'var(--pixel-border)',
                transition: 'all 0.2s',
                position: 'relative',
                overflow: 'hidden',
                padding: 0,
                background: 'rgba(10, 18, 27, 0.96)',
              }}
            >
              <div
                className="dungeon-map-card-art"
                style={{
                  backgroundImage: `linear-gradient(180deg, rgba(6, 14, 18, 0.05), rgba(10, 16, 20, 0.70)), url("${dungeon.bgImage}")`,
                }}
              >
                {dungeon.bossImage && (
                  <img
                    className="dungeon-map-card-boss"
                    src={dungeon.bossImage}
                    alt={`${dungeon.bossName} Boss`}
                    loading="lazy"
                  />
                )}
              </div>

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

              <div className="dungeon-map-card-content">
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
            </button>
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
        <button className="pixel-btn" onClick={() => navigate('/supplies')}>
          🧪 试炼补给
        </button>
      </div>
    </div>
  );
}
