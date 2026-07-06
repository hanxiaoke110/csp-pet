import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import fables from '../../data/fables.json';
import FableCard from '../shared/FableCard';
import type { Question } from '../../types/dungeon';

export default function HealingScreen() {
  const navigate = useNavigate();
  const store = useDungeonStore();
  const healing = store.healing;
  const questionBank = store.questionBank;
  const questionMapping = store.questionMapping;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [healed, setHealed] = useState(false);
  const [showFable, setShowFable] = useState(false);

  // Get matching fable
  const kpFable = healing
    ? fables.find(f => f.knowledgePoints.some(fkp =>
        healing.knowledgePoint.includes(fkp) || fkp.includes(healing.knowledgePoint)
      ))
    : null;

  // Load questions for the weak knowledge point
  useEffect(() => {
    if (!healing) {
      navigate('/map');
      return;
    }
    if (questionBank.length > 0 && Object.keys(questionMapping).length > 0) {
      // Find questions matching the weak KP across all dungeons
      const matchingIds: string[] = [];
      for (const [, stages] of Object.entries(questionMapping)) {
        for (const stageIds of Object.values(stages)) {
          for (const qid of stageIds as string[]) {
            const q = questionBank.find(bq => bq.id === qid);
            if (q && (q.knowledgePoint.includes(healing.knowledgePoint) ||
                healing.knowledgePoint.includes(q.knowledgePoint))) {
              matchingIds.push(qid);
            }
          }
        }
      }
      // Get full questions, shuffle, take 5
      const matchedQs = matchingIds
        .map(id => questionBank.find(q => q.id === id))
        .filter(Boolean) as Question[];
      const shuffled = [...matchedQs].sort(() => Math.random() - 0.5).slice(0, 5);
      setQuestions(shuffled.length > 0 ? shuffled : questionBank.slice(0, 3));
    }
  }, [healing, questionBank.length, questionMapping]);

  if (!healing) return null;

  const currentQuestion = questions[currentIdx];

  const handleAnswer = (optionIndex: number) => {
    if (submitted || !currentQuestion) return;
    setSelectedOption(optionIndex);
    setSubmitted(true);

    const correct = optionIndex === (currentQuestion.correctIndex ?? 0);
    const isHealed = store.recordHealingAnswer(correct);

    if (!correct) setShowFable(true);

    setTimeout(() => {
      if (isHealed) {
        setHealed(true);
        setTimeout(() => {
          store.clearHealing();
          try { navigate(-1); } catch { navigate('/map'); }
        }, 2000);
      } else if (currentIdx < questions.length - 1) {
        setCurrentIdx(i => i + 1);
        setSelectedOption(null);
        setSubmitted(false);
        setShowFable(false);
      } else {
        // Out of questions, reload
        setCurrentIdx(0);
        setSelectedOption(null);
        setSubmitted(false);
        setShowFable(false);
      }
    }, correct ? 600 : 1800);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a1505, #0a0a0a)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Healing status bar */}
      <div className="status-bar" style={{
        borderBottomColor: 'var(--hp-green)',
        background: 'rgba(0,255,65,0.05)',
      }}>
        <div className="status-item">
          <span style={{ fontSize: '16px' }}>🩹</span>
          <span className="status-label">疗伤修炼</span>
        </div>
        <div className="status-item" style={{ flex: 1 }}>
          <span className="status-label">净化灵力</span>
          <div className="pixel-progress" style={{ width: '120px', height: '10px' }}>
            <div className="pixel-progress-fill hp" style={{
              width: `${(healing.currentCorrect / healing.requiredCorrect) * 100}%`,
            }} />
          </div>
          <span className="status-value hp-text">{healing.currentCorrect}/{healing.requiredCorrect}</span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
          知识点：{healing.knowledgePoint}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '20px', maxWidth: '700px', margin: '0 auto', width: '100%' }}>
        {/* Healed! */}
        {healed && (
          <div className="pixel-card pixel-border-gold" style={{
            textAlign: 'center', animation: 'popIn 0.5s ease', marginTop: '40px',
          }}>
            <div style={{ fontSize: '48px' }}>✨</div>
            <h2 style={{ fontFamily: 'var(--pixel-font)', fontSize: '14px', color: 'var(--gold)' }}>
              灵力净化完成！
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '8px' }}>
              「{healing.knowledgePoint}」已从弱点中清除
            </p>
            <p style={{ color: 'var(--hp-green)', fontSize: '11px', marginTop: '4px' }}>
              +30 EXP · +20 金币 · 正在返回副本...
            </p>
          </div>
        )}

        {!healed && currentQuestion && (
          <>
            {/* Instruction */}
            <div className="dialog-box" style={{ marginBottom: '16px' }}>
              <div className="dialog-speaker">守关者</div>
              <div className="dialog-text">
                你对「{healing.knowledgePoint}」的理解还不够稳固。连续答对 {healing.requiredCorrect} 题即可净化这份灵力，否则重新计数。
              </div>
            </div>

            {/* Question */}
            <div className="pixel-card" style={{
              borderColor: showFable ? 'var(--hp-red)' : 'var(--border-pixel)',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                疗伤题 {currentIdx + 1}/{questions.length} · {currentQuestion.knowledgePoint}
              </div>
              <div style={{ fontSize: '14px', lineHeight: 1.8, marginBottom: '16px' }}>
                {currentQuestion.question}
              </div>
              {currentQuestion.code && (
                <pre style={{
                  background: '#0a0a14', border: '2px solid #333', padding: '12px',
                  fontSize: '12px', color: '#00ff41', fontFamily: 'monospace', marginBottom: '12px',
                  overflow: 'auto',
                }}>
                  {currentQuestion.code}
                </pre>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(currentQuestion.options || []).map((opt, idx) => {
                  const label = String.fromCharCode(65 + idx);
                  let cls = 'pixel-btn';
                  if (submitted) {
                    if (idx === (currentQuestion.correctIndex ?? 0)) cls += ' option-correct';
                    else if (idx === selectedOption) cls += ' option-wrong';
                  } else if (idx === selectedOption) {
                    cls += ' option-selected';
                  }
                  return (
                    <button key={idx} className={cls}
                      onClick={() => handleAnswer(idx)} disabled={submitted}
                      style={{ textAlign: 'left', padding: '10px 14px', fontSize: '13px' }}>
                      <span style={{ fontFamily: 'var(--pixel-font)', fontSize: '11px', marginRight: '8px' }}>{label}.</span>
                      {opt.replace(/^[A-D][.、]\s*/, '')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Show fable on wrong */}
            {showFable && kpFable && (
              <FableCard fable={kpFable} />
            )}

            {submitted && currentQuestion.explanation && (
              <div style={{
                marginTop: '12px', padding: '10px', fontSize: '12px',
                background: selectedOption === (currentQuestion.correctIndex ?? 0)
                  ? 'rgba(0,255,65,0.08)' : 'rgba(255,51,51,0.08)',
                border: `2px solid ${selectedOption === (currentQuestion.correctIndex ?? 0) ? 'var(--hp-green)' : 'var(--hp-red)'}`,
              }}>
                <strong>{selectedOption === (currentQuestion.correctIndex ?? 0) ? '✅' : '❌'}</strong>{' '}
                {currentQuestion.explanation}
              </div>
            )}
          </>
        )}

        {!healed && !currentQuestion && (
          <div className="loading-screen" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div className="loading-title">🩹 准备疗伤题...</div>
            <button
              className="pixel-btn"
              onClick={() => { store.clearHealing(); navigate('/map'); }}
              style={{ fontSize: '14px' }}
            >
              返回地图 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
