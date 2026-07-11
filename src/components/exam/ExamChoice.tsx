import { useState } from 'react';
import { renderCodeText } from '../../utils/markdown';
import KnowledgePointHelp from '../shared/KnowledgePointHelp';

interface ChoiceQuestion {
  id: string;
  year: number;
  group: string;
  type: 'choice';
  knowledgePoint: string;
  difficulty: number;
  question: string;
  code?: string | null;
  image?: string | null;
  codeImage?: string | null;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Props {
  question: ChoiceQuestion;
  questionNum: string;       // e.g. "第 2/3 题"
  onAnswer: (id: string, correct: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

// 题目图片（image/codeImage）渲染，加载失败时降级提示，不让页面报错
function QuestionImage({ src }: { src?: string | null }) {
  const [errored, setErrored] = useState(false);
  if (!src) return null;
  const resolved = /^https?:\/\//.test(src) ? src : (src.startsWith('/') ? src : '/' + src.replace(/^\/+/, ''));
  if (errored) {
    return (
      <div className="quiz-image-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 8, flexDirection: 'column', gap: 6, maxWidth: 620, boxSizing: 'border-box', padding: 12 }}>
        <span>🖼️ 图片加载失败，请稍后重试</span>
        <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{resolved}</span>
      </div>
    );
  }
  return (
    <div className="quiz-image-wrap">
      <img className="quiz-image" src={resolved} alt="" loading="lazy" onError={() => setErrored(true)} />
    </div>
  );
}

export default function ExamChoice({ question: q, questionNum, onAnswer, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (selected === null || submitted) return;
    setSubmitted(true);
    onAnswer(q.id, selected === q.correctIndex);
  };

  return (
    <div className="quiz-practice">
      <div className="quiz-question-header">
        <span className="quiz-mode-label">📝 CSP 选择题</span>
        <span className="quiz-progress">{questionNum}</span>
        <span className="quiz-kp">{q.knowledgePoint} · {q.year}</span>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: '#64748b', marginLeft: 'auto' }}>
          ← 返回
        </button>
      </div>

      <div className="quiz-question-card">
        {q.code && (
          <pre className="code-block"><code>{q.code}</code></pre>
        )}
        <QuestionImage src={q.image || q.codeImage} />
        <div className="quiz-q-body" dangerouslySetInnerHTML={renderCodeText(q.question)} />

        <div className="quiz-options">
          {q.options.map((opt, i) => {
            let cls = 'quiz-opt';
            if (submitted) {
              if (i === q.correctIndex) cls += ' correct';
              else if (i === selected && i !== q.correctIndex) cls += ' wrong';
            } else if (selected === i) {
              cls += ' selected';
            }
            return (
              <label key={i} className={cls} onClick={() => !submitted && setSelected(i)}>
                <span className="quiz-radio">{String.fromCharCode(65 + i)}</span>
                <span className="quiz-opt-text" dangerouslySetInnerHTML={renderCodeText(opt)} />
              </label>
            );
          })}
        </div>

        {submitted && (
          <div className={`quiz-feedback ${selected === q.correctIndex ? 'correct' : 'wrong'}`}>
            <strong>{selected === q.correctIndex ? '✅ 回答正确！' : '❌ 回答错误'}</strong>
            {q.explanation && <p dangerouslySetInnerHTML={renderCodeText(q.explanation)} />}
            {selected !== q.correctIndex && (
              <p className="correct-answer">正确答案是 {String.fromCharCode(65 + q.correctIndex)}</p>
            )}
            <KnowledgePointHelp
              questionId={q.id}
              isCorrect={selected === q.correctIndex}
            />
          </div>
        )}
      </div>

      <div className="quiz-actions">
        {!submitted ? (
          <button className="quiz-submit-btn" disabled={selected === null} onClick={handleSubmit}>
            提交答案
          </button>
        ) : (
          <button className="quiz-submit-btn" onClick={onNext}>
            下一题 →
          </button>
        )}
      </div>
    </div>
  );
}
