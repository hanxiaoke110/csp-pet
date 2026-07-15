import { useParams, useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { getRankName } from '../../utils/gameLogic';

export default function RewardScreen() {
  const { dungeonId } = useParams<{ dungeonId: string }>();
  const navigate = useNavigate();
  const battle = useDungeonStore(s => s.lastBattleResult);
  const player = useDungeonStore(s => s.player);
  const dungeons = useDungeonStore(s => s.dungeons);
  const setView = useDungeonStore(s => s.setView);

  const dungeon = dungeons.find(d => d.id === dungeonId);

  // 无结算快照，或快照与当前 dungeonId 不符（陈旧快照/回退导航）：提供返回入口，避免卡死或误展示
  if (!battle || battle.dungeonId !== dungeonId) {
    return (
      <div className="loading-screen" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
        <div className="loading-title">⚔️ 没有可结算的战斗</div>
        <button
          className="pixel-btn"
          onClick={() => { navigate(`/dungeon/${dungeonId}`); setView('dungeon-preview'); }}
          style={{ fontSize: '14px' }}
        >
          返回副本 →
        </button>
      </div>
    );
  }

  const won = battle.isWon;
  const expEarned = battle.expEarned;
  const goldEarned = battle.goldEarned;
  const rating = battle.rating;
  const totalAnswered = battle.correctCount + battle.wrongCount;
  const accuracy = totalAnswered > 0
    ? Math.round((battle.correctCount / totalAnswered) * 100)
    : 0;
  const remainingHpRatio = battle.maxHp > 0
    ? Math.round((battle.hp / battle.maxHp) * 100)
    : 0;
  const uniqueSkillCount = battle.usedSkillIds.length;
  const roundCount = battle.roundCount;
  const rankName = getRankName(player.school, player.rankTier);

  const handleContinue = () => {
    // 结算与进度更新已在 finalizeBattle（战斗结束时）完成，这里清空快照并导航。
    useDungeonStore.setState({ lastBattleResult: null });
    navigate(`/dungeon/${dungeonId}`);
    setView('dungeon-preview');
  };

  const handleReplay = () => {
    useDungeonStore.setState({ lastBattleResult: null });
    const target = battle.isBoss
      ? `/battle/${dungeonId}/boss?replay=1`
      : `/battle/${dungeonId}/${battle.stageId}?replay=1`;
    navigate(target);
    setView(battle.isBoss ? 'boss' : 'battle');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: won ? 'linear-gradient(180deg, #0a2005, #0a0a0a)' : 'linear-gradient(180deg, #200505, #0a0a0a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div className="pixel-card pixel-border-gold" style={{
        maxWidth: '420px', width: '100%', textAlign: 'center',
        animation: 'popIn 0.5s ease',
      }}>
        {/* Result banner */}
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>
          {won ? '🏆' : '💀'}
        </div>
        <h2 style={{
          fontFamily: 'var(--pixel-font)', fontSize: '16px',
          color: won ? 'var(--gold)' : 'var(--hp-red)',
          marginBottom: '8px',
        }}>
          {won ? '战斗胜利！' : '战斗失败...'}
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginBottom: '20px' }}>
          {won
            ? `${dungeon?.guardianName || '守护者'}：『你做得很好，修行之路又进一步！』`
            : 'HP 归零！重新修炼后再来挑战吧。'}
        </p>

        {/* Rewards */}
        {won && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '12px', marginBottom: '16px',
            }}>
              <div className="pixel-card" style={{ borderColor: 'var(--exp-blue)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>EXP 获得</div>
                <div style={{ fontSize: '24px', color: 'var(--exp-blue)', fontWeight: 700 }}>
                  +{expEarned}
                </div>
              </div>
              <div className="pixel-card" style={{ borderColor: 'var(--gold-coin)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>金币获得</div>
                <div style={{ fontSize: '24px', color: 'var(--gold-coin)', fontWeight: 700 }}>
                  +{goldEarned}
                </div>
              </div>
            </div>

            {/* Rating */}
            <div style={{
              fontSize: '12px', padding: '8px', marginBottom: '12px',
              background: rating === 'SS' ? 'rgba(255,136,0,0.2)' : 'rgba(255,255,255,0.05)',
              border: `2px solid ${rating === 'SS' ? 'var(--rarity-mythic)' : 'var(--border-pixel)'}`,
            }}>
              评价：<strong style={{
                color: rating === 'SS' ? 'var(--rarity-mythic)' :
                       rating === 'S' ? 'var(--rarity-legendary)' :
                       rating === 'A' ? 'var(--exp-blue)' : 'var(--text-light)',
                fontFamily: 'var(--pixel-font)', fontSize: '14px',
              }}>{rating}</strong>
            </div>

            {/* Rating breakdown */}
            <div className="rating-breakdown" style={{
              background: 'rgba(0,0,0,0.2)',
              border: '2px solid var(--border-pixel)',
              padding: '12px',
              marginBottom: '16px',
              textAlign: 'left',
              fontSize: '12px',
            }}>
              <p>正确率：{accuracy}%</p>
              <p>剩余 HP：{remainingHpRatio}%</p>
              <p>使用技能种类：{uniqueSkillCount}/4</p>
              <p>战斗回合：{roundCount}</p>
            </div>

            {/* Progress */}
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>
              Lv.{player.playerLevel} · {rankName}
            </div>
            <div className="pixel-progress" style={{ height: '12px' }}>
              <div className="pixel-progress-fill exp" style={{
                width: `${(player.exp / player.expToNext) * 100}%`,
              }} />
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
              EXP: {player.exp}/{player.expToNext}
            </div>
          </div>
        )}

        {/* Continue */}
        <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
          <button
            className={`pixel-btn ${won ? 'primary' : ''}`}
            onClick={won ? handleReplay : handleReplay}
            style={{ width: '100%', fontSize: '14px' }}
          >
            {won ? '再来一次冲评级' : '重新挑战'}
          </button>
          {won && (
            <button
              className="pixel-btn"
              onClick={handleContinue}
              style={{ width: '100%', fontSize: '14px' }}
            >
              继续修行 →
            </button>
          )}
          {!won && (
            <button
              className="pixel-btn"
              onClick={handleContinue}
              style={{ width: '100%', fontSize: '12px' }}
            >
              返回副本
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
