import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { getStageQuestions, getBossQuestions } from '../../utils/questionLoader';
import { getRankName } from '../../utils/gameLogic';
import { reportAnswer } from '../../utils/api';
import FableCard from '../shared/FableCard';
import fables from '../../data/fables.json';
import type { Question, DungeonDefinition } from '../../types/dungeon';

export default function BattleScreen() {
  const { dungeonId, stageId } = useParams<{ dungeonId: string; stageId: string }>();
  const navigate = useNavigate();

  const store = useDungeonStore();
  const player = store.player;
  const battle = store.battle;
  const dungeons = store.dungeons;
  const questionBank = store.questionBank;
  const questionMapping = store.questionMapping;
  const isBoss = !stageId || stageId === 'boss';

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showEffect, setShowEffect] = useState<'correct' | 'wrong' | 'critical' | null>(null);
  const [shakeClass, setShakeClass] = useState('');
  const [activeFable, setActiveFable] = useState<typeof fables[0] | null>(null);

  const dungeon = dungeons.find(d => d.id === dungeonId) as DungeonDefinition | undefined;
  const isUnlocked = useDungeonStore(s => s.isDungeonUnlocked);
  const currentQuestion = battle?.questions?.[battle.currentQuestionIndex] as Question | undefined;

  // Guard: redirect if dungeon is locked
  useEffect(() => {
    if (dungeonId && !isUnlocked(dungeonId)) {
      navigate('/map');
    }
  }, [dungeonId]);
  const questionNum = battle ? battle.currentQuestionIndex + 1 : 0;
  const totalQuestions = battle?.questions?.length || 0;

  // Initialize battle
  useEffect(() => {
    if (!dungeonId || battle) return;
    if (questionBank.length === 0 || Object.keys(questionMapping).length === 0) return;

    const questions = isBoss
      ? getBossQuestions(questionBank, questionMapping, dungeonId, 10)
      : getStageQuestions(questionBank, questionMapping, dungeonId, stageId || '', 5);

    if (questions.length === 0) {
      // Fallback: get any questions
      const shuffled = [...questionBank].sort(() => Math.random() - 0.5).slice(0, 5);
      store.startBattle(dungeonId, stageId || 'boss', shuffled, isBoss);
    } else {
      store.startBattle(dungeonId, stageId || 'boss', questions, isBoss);
    }
  }, [dungeonId, stageId, questionBank.length, Object.keys(questionMapping).length]);

  // Handle answer submission
  const handleAnswer = useCallback((optionIndex: number) => {
    if (submitted || !battle || battle.isFinished) return;
    setSelectedOption(optionIndex);
    setSubmitted(true);

    const result = store.answerQuestion(optionIndex);
    const startTime = Date.now();

    // Report to server (fire and forget)
    if (currentQuestion) {
      reportAnswer(currentQuestion.id, dungeonId || '', result.correct, 0).catch(() => {});
    }

    // Visual effects
    if (result.correct) {
      const isCrit = Math.random() < 0.1;
      setShowEffect(isCrit ? 'critical' : 'correct');
      setShakeClass('');
    } else {
      setShowEffect('wrong');
      setShakeClass('shake');
      setTimeout(() => setShakeClass(''), 300);

      // Track weak point & find fable
      const kp = currentQuestion.knowledgePoint;
      store.addWeakPoint(kp);
      store.addToMistakeNotebook(currentQuestion.id);
      const matched = fables.find(f =>
        f.knowledgePoints.some(fkp => kp.includes(fkp) || fkp.includes(kp))
      );
      if (matched) setActiveFable(matched);
    }

    // Auto-advance after delay
    setTimeout(() => {
      if (result.finished) {
        store.saveToLocalStorage();
        // Check badges
        const newBadges = store.checkAndAwardBadges();
        if (newBadges.length > 0) store.saveToLocalStorage();

        if (result.won) {
          navigate(isBoss ? `/reward/${dungeonId}` : `/reward/${dungeonId}?stage=${stageId}`);
          store.setView('reward');
        } else {
          // Lost - go back to dungeon
          navigate(`/dungeon/${dungeonId}`);
          store.setView('dungeon-preview');
        }
      } else {
        setSelectedOption(null);
        setSubmitted(false);
        setShowEffect(null);
        setActiveFable(null);
      }
    }, result.correct ? 800 : 1500);

    store.saveToLocalStorage();
  }, [submitted, battle, currentQuestion, dungeonId, stageId]);

  // Loading state
  if (!battle || !currentQuestion) {
    return (
      <div className="loading-screen">
        <div className="loading-title">⚔️ 准备战斗...</div>
        <div className="loading-bar-container">
          <div className="loading-bar-fill" />
        </div>
      </div>
    );
  }

  const correctIndex = currentQuestion.correctIndex ?? 0;
  const isReadingType = currentQuestion.type === 'reading' || currentQuestion.type === 'fillBlank';
  const rankName = getRankName(player.school, player.rankTier);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0a0a, #1a0a0a, #0a0a0a)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Battle status bar */}
      <div className="status-bar" style={{ borderBottomColor: isBoss ? 'var(--hp-red)' : 'var(--border-pixel)' }}>
        <div className="status-item">
          <span className="status-label">{dungeon?.icon} {dungeon?.name}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Q</span>
          <span className="status-value">{questionNum}/{totalQuestions}</span>
        </div>
        <div className="status-item" style={{ flex: 1 }}>
          <span className="status-label">HP</span>
          <div className="pixel-progress" style={{ width: '100px', height: '10px' }}>
            <div className="pixel-progress-fill hp" style={{
              width: `${(battle.hp / battle.maxHp) * 100}%`,
              background: battle.hp <= 1 ? 'var(--hp-red)' : 'var(--hp-green)',
            }} />
          </div>
          <span className="status-value hp-text">{battle.hp}/{battle.maxHp}</span>
        </div>
        <div className="status-item">
          <span className="status-label">连击</span>
          <span className="status-value" style={{
            color: battle.comboCount >= 5 ? 'var(--crit-yellow)' : 'var(--text-light)',
            animation: battle.comboCount >= 5 ? 'criticalPulse 0.5s ease' : 'none',
          }}>
            {battle.comboCount}
          </span>
        </div>
      </div>

      {/* Battle area */}
      <div style={{ flex: 1, padding: '20px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        {/* NPC dialog for first question */}
        {questionNum === 1 && dungeon && (
          <div className="dialog-box" style={{ marginBottom: '20px', animation: 'fadeIn 0.5s ease' }}>
            <div className="dialog-speaker">
              {isBoss ? dungeon.bossName : dungeon.guardianName}
            </div>
            <div className="dialog-text">
              {isBoss ? dungeon.bossDescription : dungeon.guardianLine}
            </div>
          </div>
        )}

        {/* Question card */}
        <div className={`pixel-card ${shakeClass}`} style={{
          borderColor: showEffect === 'correct' ? 'var(--hp-green)' :
                       showEffect === 'critical' ? 'var(--crit-yellow)' :
                       showEffect === 'wrong' ? 'var(--hp-red)' : 'var(--border-pixel)',
          transition: 'border-color 0.2s',
          animation: showEffect ? 'fadeIn 0.3s ease' : undefined,
        }}>
          {/* Question header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginBottom: '12px',
            fontSize: '11px', color: 'var(--text-dim)',
          }}>
            <span>{currentQuestion.year}年 CSP-{currentQuestion.group}</span>
            <span>{currentQuestion.knowledgePoint} · 难度 {currentQuestion.difficulty}</span>
          </div>

          {/* Question text */}
          <div style={{
            fontSize: '15px', lineHeight: 1.8, marginBottom: '16px',
            color: 'var(--text-light)',
          }}>
            <div dangerouslySetInnerHTML={{
              __html: currentQuestion.question
                .replace(/\n/g, '<br/>')
                .replace(/`([^`]+)`/g, '<code style="background:#1a1a2e;padding:2px 6px;border:1px solid #333;font-family:monospace;color:#00ff41;">$1</code>')
            }} />
          </div>

          {/* Code block */}
          {currentQuestion.code && (
            <pre style={{
              background: '#0a0a14', border: '2px solid #333', padding: '12px',
              fontSize: '13px', lineHeight: 1.5, overflow: 'auto',
              color: '#00ff41', fontFamily: 'monospace', marginBottom: '16px',
            }}>
              {currentQuestion.code}
            </pre>
          )}

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(currentQuestion.options || []).map((option, idx) => {
              const optionLabel = String.fromCharCode(65 + idx); // A, B, C, D
              let optionClass = 'pixel-btn option-btn';
              if (submitted) {
                if (idx === correctIndex) optionClass += ' option-correct';
                else if (idx === selectedOption) optionClass += ' option-wrong';
                else optionClass += ' option-dimmed';
              } else if (idx === selectedOption) {
                optionClass += ' option-selected';
              }

              return (
                <button
                  key={idx}
                  className={optionClass}
                  onClick={() => handleAnswer(idx)}
                  disabled={submitted}
                  style={{
                    textAlign: 'left', padding: '12px 16px',
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--pixel-font)', fontSize: '12px',
                    color: submitted && idx === correctIndex ? 'var(--hp-green)' :
                           submitted && idx === selectedOption && idx !== correctIndex ? 'var(--hp-red)' :
                           'var(--text-dim)',
                    minWidth: '20px',
                  }}>
                    {optionLabel}.
                  </span>
                  <span style={{ flex: 1, fontSize: '14px' }}>
                    {option.replace(/^[A-D][.、]\s*/, '')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Fable card on wrong answer */}
          {submitted && activeFable && selectedOption !== currentQuestion.correctIndex && (
            <FableCard
              fable={activeFable}
              onClose={() => setActiveFable(null)}
            />
          )}

          {/* Explanation after answer */}
          {submitted && currentQuestion.explanation && (
            <div style={{
              marginTop: '16px', padding: '12px',
              background: selectedOption === correctIndex ? 'rgba(0,255,65,0.08)' : 'rgba(255,51,51,0.08)',
              border: `2px solid ${selectedOption === correctIndex ? 'var(--hp-green)' : 'var(--hp-red)'}`,
              fontSize: '13px', lineHeight: 1.6,
            }}>
              <strong style={{ color: selectedOption === correctIndex ? 'var(--hp-green)' : 'var(--hp-red)' }}>
                {selectedOption === correctIndex ? '✅ 回答正确！' : '❌ 回答错误'}
              </strong>
              <div style={{ marginTop: '6px', color: 'var(--text-dim)' }}>
                {currentQuestion.explanation}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .option-btn {
          width: 100%;
          border: 2px solid #333 !important;
          transition: all 0.15s;
        }
        .option-btn:hover:not(:disabled) {
          border-color: var(--gold) !important;
          background: #1a1a3e;
        }
        .option-selected {
          border-color: var(--gold) !important;
          background: #1a1a3e;
        }
        .option-correct {
          border-color: var(--hp-green) !important;
          background: rgba(0,255,65,0.1) !important;
        }
        .option-wrong {
          border-color: var(--hp-red) !important;
          background: rgba(255,51,51,0.1) !important;
        }
        .option-dimmed {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
