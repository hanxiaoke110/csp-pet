import { useParams, useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { getRankName } from '../../utils/gameLogic';

export default function RewardScreen() {
  const { dungeonId } = useParams<{ dungeonId: string }>();
  const navigate = useNavigate();
  const battle = useDungeonStore(s => s.battle);
  const player = useDungeonStore(s => s.player);
  const dungeons = useDungeonStore(s => s.dungeons);
  const setView = useDungeonStore(s => s.setView);

  const dungeon = dungeons.find(d => d.id === dungeonId);
  const won = battle?.isWon ?? false;
  const expEarned = battle?.expEarned ?? 0;
  const goldEarned = battle?.goldEarned ?? 0;
  const rating = battle?.rating ?? 'D';
  const totalAnswered = (battle?.correctCount ?? 0) + (battle?.wrongCount ?? 0);
  const accuracy = totalAnswered > 0
    ? Math.round((battle.correctCount / totalAnswered) * 100)
    : 0;
  const remainingHpRatio = battle?.maxHp > 0
    ? Math.round((battle.hp / battle.maxHp) * 100)
    : 0;
  const uniqueSkillCount = battle?.usedSkillIds?.length ?? 0;
  const roundCount = battle?.roundCount ?? 0;
  const rankName = getRankName(player.school, player.rankTier);

  const handleContinue = () => {
    const store = useDungeonStore.getState();
    // Save battle data before nullifying
    const battleData = { ...store.battle };
    store.finishBattle();
    if (won) {
      // Update dungeon progress
      const progress = store.dungeonProgress;
      const dp = progress.find(p => p.dungeonId === dungeonId);
      if (dp) {
        const newProgress = progress.map(p => {
          if (p.dungeonId !== dungeonId) return p;
          const isBossBattle = !battleData?.stageId || battleData?.stageId === 'boss';
          if (isBossBattle) {
            return { ...p, bossDefeated: true, bestScore: Math.max(p.bestScore, battleData?.correctCount || 0), bestRating: rating };
          } else {
            const newCompleted = Math.min(p.completedStages + 1, p.totalStages);
            const allStagesDone = newCompleted >= p.totalStages;
            return { ...p, completedStages: newCompleted, status: allStagesDone ? 'cleared' : 'in_progress' };
          }
        });
        useDungeonStore.setState({ dungeonProgress: newProgress });
        useDungeonStore.getState().saveToLocalStorage();
      }
    }
    navigate(`/dungeon/${dungeonId}`);
    setView('dungeon-preview');
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
        <button
          className={`pixel-btn ${won ? 'primary' : ''}`}
          onClick={handleContinue}
          style={{ width: '100%', fontSize: '14px' }}
        >
          {won ? '继续修行 →' : '重新挑战'}
        </button>
      </div>
    </div>
  );
}
