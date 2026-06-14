import { useParams, useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import type { DungeonDefinition } from '../../types/dungeon';

export default function DungeonEntrance() {
  const { dungeonId } = useParams<{ dungeonId: string }>();
  const navigate = useNavigate();
  const dungeons = useDungeonStore(s => s.dungeons);
  const progress = useDungeonStore(s => s.dungeonProgress);
  const isUnlocked = useDungeonStore(s => s.isDungeonUnlocked);
  const setView = useDungeonStore(s => s.setView);

  const dungeon = dungeons.find(d => d.id === dungeonId) as DungeonDefinition | undefined;
  const dp = progress.find(p => p.dungeonId === dungeonId);

  if (!dungeon) {
    return (
      <div className="loading-screen">
        <div className="loading-title">副本不存在</div>
        <button className="pixel-btn" onClick={() => navigate('/map')}>返回地图</button>
      </div>
    );
  }

  if (!isUnlocked(dungeon.id)) {
    return (
      <div className="loading-screen">
        <div className="loading-title">🔒 副本封印中</div>
        <p style={{ color: 'var(--text-dim)' }}>
          {dungeon.requiredDungeon
            ? `需先通关「${dungeons.find(d => d.id === dungeon.requiredDungeon)?.name || '?'}」`
            : '等级不足'}
        </p>
        <button className="pixel-btn" onClick={() => navigate('/map')}>返回地图</button>
      </div>
    );
  }

  const nextStageIndex = dp?.completedStages || 0;
  const nextStage = nextStageIndex < dungeon.stages.length ? dungeon.stages[nextStageIndex] : null;

  const handleStartStage = (stageId: string) => {
    setView('battle');
    navigate(`/battle/${dungeonId}/${stageId}`);
  };

  const handleStartBoss = () => {
    setView('battle');
    navigate(`/battle/${dungeonId}/boss`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(180deg, ${dungeon.color}11, #0a0a0a)`,
      padding: '20px',
    }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        {/* Back */}
        <button className="pixel-btn" onClick={() => navigate('/map')} style={{ marginBottom: '16px', fontSize: '12px' }}>
          ← 返回地图
        </button>

        {/* Dungeon header */}
        <div className="pixel-card pixel-border-gold" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '40px' }}>{dungeon.icon}</span>
            <div>
              <h2 style={{ fontFamily: 'var(--pixel-font)', fontSize: '16px', color: dungeon.color }}>
                {dungeon.name}
              </h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginTop: '4px' }}>
                {dungeon.subtitle}
              </p>
            </div>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '12px', lineHeight: 1.6 }}>
            {dungeon.description}
          </p>

          {/* Progress */}
          {dp && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                进度：{dp.completedStages}/{dp.totalStages} 关卡
                {dp.bossDefeated ? ' · Boss ✅' : ''}
              </div>
              <div className="pixel-progress" style={{ height: '10px' }}>
                <div className="pixel-progress-fill exp" style={{
                  width: `${(dp.completedStages / Math.max(dp.totalStages, 1)) * 100}%`,
                  background: dungeon.color,
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Guardian NPC */}
        <div className="dialog-box" style={{ marginBottom: '20px' }}>
          <div className="dialog-speaker">{dungeon.guardianName}</div>
          <div className="dialog-text">{dungeon.guardianLine}</div>
        </div>

        {/* Stages */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: 'var(--text-light)', fontSize: '14px', marginBottom: '12px' }}>🗺️ 关卡列表</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {dungeon.stages.map((stage, idx) => {
              const isCompleted = idx < (dp?.completedStages || 0);
              const isCurrent = idx === (dp?.completedStages || 0);
              const isFuture = idx > (dp?.completedStages || 0);

              return (
                <div
                  key={stage.id}
                  className="pixel-card"
                  style={{
                    borderColor: isCompleted ? 'var(--hp-green)' : isCurrent ? dungeon.color : 'var(--border-pixel)',
                    opacity: isFuture ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      {isCompleted ? '✅' : isCurrent ? '⚔️' : '🔒'} 第{idx + 1}关
                    </span>
                    <span style={{ marginLeft: '8px', fontWeight: 600, fontSize: '14px' }}>
                      {stage.name}
                    </span>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                      {stage.description} · {stage.requiredCorrect}题过关 · HP:{stage.hp}
                    </div>
                  </div>
                  {isCurrent && (
                    <button className="pixel-btn primary" style={{ fontSize: '11px', padding: '6px 12px' }}
                      onClick={() => handleStartStage(stage.id)}>
                      进入 →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Boss */}
        <div className="pixel-card" style={{
          borderColor: dp?.bossDefeated ? 'var(--hp-green)' : (nextStage ? 'var(--border-pixel)' : 'var(--hp-red)'),
          borderWidth: '3px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--hp-red)' }}>
                👹 Boss战：{dungeon.bossName}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                {dungeon.bossDescription.slice(0, 60)}... · {dungeon.bossQuestionCount}题 · 通过率{dungeon.bossPassScore}%
              </div>
            </div>
            {dp?.bossDefeated ? (
              <span style={{ color: 'var(--hp-green)', fontWeight: 700 }}>✅ 已击败</span>
            ) : nextStage ? (
              <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>需先通关所有关卡</span>
            ) : (
              <button className="pixel-btn danger" style={{ fontSize: '11px', padding: '6px 12px' }}
                onClick={handleStartBoss}>
                ⚔️ 挑战 Boss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
