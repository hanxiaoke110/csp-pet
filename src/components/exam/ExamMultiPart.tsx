import { useState } from 'react';
import { renderCodeText } from '../../utils/markdown';

export interface SubItem {
  label: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface Props {
  title: string;           // e.g. "📖 程序阅读 · CSP-J 2019 · 3小问"
  code?: string | null;
  question: string;
  subItems: SubItem[];
  onSubmit: (correctCount: number, total: number) => void;
  onBack: () => void;
}

export default function ExamMultiPart({ title, code, question, subItems, onSubmit, onBack }: Props) {
  const [answers, setAnswers] = useState<number[]>(Array(subItems.length).fill(-1));
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = answers.every(a => a >= 0);

  const handleSubmit = () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    let correct = 0;
    for (let i = 0; i < subItems.length; i++) {
      if (answers[i] === subItems[i].correctIndex) correct++;
    }
    onSubmit(correct, subItems.length);
  };

  const passThreshold = subItems.length >= 5 ? 3 : 2;

  return (
    <div className="quiz-practice">
      <div className="quiz-question-header">
        <span className="quiz-mode-label">⚡ CSP 真题</span>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
          ← 返回
        </button>
      </div>

      <div className="quiz-question-card">
        <div className="quiz-q-body">
          <span style={{ color: '#64748b', fontSize: 13 }}>{title}</span>
        </div>
      </div>

      {code && (
        <div className="quiz-question-card" style={{ marginTop: 0 }}>
          <pre className="code-block"><code>{code}</code></pre>
        </div>
      )}

      <div className="quiz-question-card" style={{ marginTop: 0 }}>
        <div className="quiz-q-body" dangerouslySetInnerHTML={renderCodeText(question)} />
        <h4 style={{ marginTop: 16, marginBottom: 12 }}>请作答（共 {subItems.length} 小问，答对 ≥{passThreshold} 问算完成）</h4>

        <div className="super-answers" style={{ maxHeight: 'none', overflowY: 'visible' }}>
          {subItems.map((item, i) => (
            <div key={i} className="super-answer-row" style={{
              background: submitted
                ? (answers[i] === item.correctIndex ? '#f0fdf4' : '#fef2f2')
                : 'transparent',
              borderRadius: 8, padding: 8, marginBottom: 4,
            }}>
              <span className="super-q-num">{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, marginBottom: 6, fontWeight: 500 }}>{item.label}</div>
                <div className="super-options">
                  {['A', 'B', 'C', 'D'].map((opt, oi) => {
                    let className = 'super-opt';
                    if (submitted) {
                      if (oi === item.correctIndex) className += ' selected';
                      else if (answers[i] === oi && oi !== item.correctIndex) className += ' wrong';
                    } else if (answers[i] === oi) {
                      className += ' selected';
                    }
                    return (
                      <label
                        key={opt}
                        className={className}
                        onClick={() => {
                          if (submitted) return;
                          const a = [...answers]; a[i] = oi; setAnswers(a);
                        }}
                      >
                        {opt}. {item.options[oi]}
                      </label>
                    );
                  })}
                </div>
                {submitted && answers[i] !== item.correctIndex && item.explanation && (
                  <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{item.explanation}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="quiz-actions">
        {!submitted ? (
          <button className="quiz-submit-btn" disabled={!allAnswered} onClick={handleSubmit}>
            提交答案
          </button>
        ) : (
          <button className="quiz-submit-btn" onClick={onBack}>
            返回选题
          </button>
        )}
      </div>
    </div>
  );
}
