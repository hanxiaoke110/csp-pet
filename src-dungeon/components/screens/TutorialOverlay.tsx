import { useState } from 'react';

const STEPS = [
  { text: '点击技能，选择你想复习的知识点', target: '.skill-bar' },
  { text: '回答对应的编程题', target: '.question-panel' },
  { text: '答对就能释放技能，答错会变弱哦', target: '.battle-arena' },
];

export function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-box">
        <h3>新手引导 ({step + 1}/{STEPS.length})</h3>
        <p>{STEPS[step].text}</p>
        <div className="tutorial-actions">
          {step < STEPS.length - 1 ? (
            <button className="pixel-btn primary" onClick={() => setStep(step + 1)}>
              下一步
            </button>
          ) : (
            <button className="pixel-btn primary" onClick={onClose}>
              开始战斗
            </button>
          )}
          <button className="pixel-btn" onClick={onClose}>
            跳过
          </button>
        </div>
      </div>

      <style>{`
        .tutorial-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .tutorial-box {
          background: var(--bg-card);
          border: 4px solid var(--gold);
          padding: 24px;
          max-width: 360px;
          width: 100%;
          text-align: center;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
        }
        .tutorial-box h3 {
          font-family: var(--pixel-font);
          font-size: 12px;
          color: var(--gold);
          margin-bottom: 16px;
        }
        .tutorial-box p {
          font-size: 15px;
          line-height: 1.6;
          color: var(--text-light);
          margin-bottom: 20px;
        }
        .tutorial-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        .tutorial-actions button {
          flex: 1;
          min-width: 0;
        }
      `}</style>
    </div>
  );
}
