import { useState } from 'react';
import { renderCodeText } from '../../utils/markdown';
import KnowledgePointHelp from '../shared/KnowledgePointHelp';

export interface SubItem {
  label: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface Props {
  title: string;           // e.g. "📖 程序阅读 · CSP-J 2019 · 3小问"
  code?: string | null;
  image?: string | null;   // 程序代码截图/流程图（reading/fillBlank 可能以图片形式给出代码）
  codeImage?: string | null;
  question: string;
  subItems: SubItem[];
  questionId: string;
  onSubmit: (correctCount: number, total: number, results: SubItemResult[]) => void;
  onBack: () => void;
}

export interface SubItemResult {
  index: number;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
}

// 题目图片渲染，加载失败时降级提示
function MultiPartImage({ src }: { src?: string | null }) {
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

function normalizeTrueFalseOption(value?: string): string {
  return String(value || '')
    .trim()
    .replace(/^[A-DＡ-Ｄ]\s*[.．、:：]\s*/i, '')
    .replace(/^[√✓✔×✕✖]\s*/, '')
    .trim();
}

export function isTrueFalseItem(item: SubItem): boolean {
  // label 已明确标记为判断题时，强制使用二选一。兼容远程数据
  // 多传空 C/D、选项带 A/B 前缀或对错符号的情况。
  if (/^判断(?:题)?\s*\d*\s*[:：]/.test(item.label.trim())) return true;
  const meaningful = item.options.map(normalizeTrueFalseOption).filter(Boolean);
  return meaningful.length === 2 && meaningful[0] === '正确' && meaningful[1] === '错误';
}

function getEffectiveCorrectIndex(item: SubItem): number {
  return isTrueFalseItem(item) && item.correctIndex > 1 ? 1 : item.correctIndex;
}

export default function ExamMultiPart({ title, code, image, codeImage, question, subItems, questionId, onSubmit, onBack }: Props) {
  const [answers, setAnswers] = useState<number[]>(Array(subItems.length).fill(-1));
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = answers.every(a => a >= 0);

  const handleSubmit = () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    let correct = 0;
    const results: SubItemResult[] = [];
    for (let i = 0; i < subItems.length; i++) {
      const correctIndex = getEffectiveCorrectIndex(subItems[i]);
      const isCorrect = answers[i] === correctIndex;
      if (isCorrect) correct++;
      results.push({ index: i, selectedIndex: answers[i], correctIndex, correct: isCorrect });
    }
    onSubmit(correct, subItems.length, results);
  };

  const passThreshold = subItems.length >= 5 ? 3 : 2;
  const correctCount = submitted
    ? subItems.reduce((sum, item, i) => sum + (answers[i] === getEffectiveCorrectIndex(item) ? 1 : 0), 0)
    : 0;

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

      {(image || codeImage) && (
        <div className="quiz-question-card" style={{ marginTop: 0 }}>
          <MultiPartImage src={image || codeImage} />
        </div>
      )}

      <div className="quiz-question-card" style={{ marginTop: 0 }}>
        <div className="quiz-q-body" dangerouslySetInnerHTML={renderCodeText(question)} />
        <h4 style={{ marginTop: 16, marginBottom: 12 }}>请作答（共 {subItems.length} 小问，答对 ≥{passThreshold} 问算完成）</h4>

        <div className="super-answers" style={{ maxHeight: 'none', overflowY: 'visible' }}>
          {subItems.map((item, i) => (
            <div key={i} className="super-answer-row" style={{
              background: submitted
                ? (answers[i] === getEffectiveCorrectIndex(item) ? '#f0fdf4' : '#fef2f2')
                : 'transparent',
              borderRadius: 8, padding: 8, marginBottom: 4,
            }}>
              <span className="super-q-num">{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, marginBottom: 6, fontWeight: 500 }}>{item.label}</div>
                <div className="super-options">
                  {(isTrueFalseItem(item) ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map((opt, oi) => {
                    let className = 'super-opt';
                    const correctIndex = getEffectiveCorrectIndex(item);
                    if (submitted) {
                      if (oi === correctIndex) className += ' selected';
                      else if (answers[i] === oi && oi !== correctIndex) className += ' wrong';
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
                        <span>{opt}.</span>{' '}
                        <span dangerouslySetInnerHTML={renderCodeText(
                          isTrueFalseItem(item) ? normalizeTrueFalseOption(item.options[oi]) : (item.options[oi] || ''),
                        )} />
                      </label>
                    );
                  })}
                </div>
                {submitted && answers[i] !== getEffectiveCorrectIndex(item) && item.explanation && (
                  <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }} dangerouslySetInnerHTML={renderCodeText(item.explanation)} />
                )}
              </div>
            </div>
          ))}
        </div>

        {submitted && (
          <KnowledgePointHelp
            questionId={questionId}
            isCorrect={correctCount >= passThreshold}
          />
        )}
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
