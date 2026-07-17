import { useState, useEffect } from 'react';
import type { Problem } from '../../types/course';
import { TYPE_CONFIG, type SectionType } from './ProblemViewer';
import { renderCodeText } from '../../utils/markdown';
import { loadVersionedRemoteJson } from '../../utils/versionedRemoteJson';

interface Props {
  problem: Problem;
  sectionType: SectionType;
  onClose: () => void;
  onResult: (passed: boolean) => void;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

// Pre-generated quiz bank — loaded once from course-data/quiz-bank.json
let quizBank: Record<string, QuizQuestion> | null = null;
let quizBankLoading = false;
let quizBankPromise: Promise<void> | null = null;

function isQuizBankData(data: unknown): data is Record<string, QuizQuestion> {
  return Boolean(data && typeof data === 'object' && !Array.isArray(data));
}

async function loadQuizBank(): Promise<Record<string, QuizQuestion>> {
  if (quizBank) return quizBank;
  if (quizBankLoading) { await quizBankPromise; return quizBank || {}; }
  quizBankLoading = true;
  quizBankPromise = loadVersionedRemoteJson<Record<string, QuizQuestion>>({
    cacheKey: 'csp_quiz_bank',
    versionKey: 'csp_quiz_bank_version',
    versionFile: 'version.json',
    dataFile: 'unified-quiz-bank.json',
    bundledUrl: '/course-data/unified-quiz-bank.json',
    validate: isQuizBankData,
  })
    .then(data => { quizBank = data; })
    .catch(() => { quizBank = {}; })
    .finally(() => { quizBankLoading = false; });
  await quizBankPromise;
  return quizBank || {};
}

function generateFallback(problem: Problem): QuizQuestion {
  const mistakes = problem.commonMistakes || [];
  if (mistakes.length >= 2) {
    const correct = mistakes[Math.floor(Math.random() * mistakes.length)];
    const others = mistakes.filter(m => m.mistake !== correct.mistake).slice(0, 3);
    while (others.length < 3) others.push({ mistake: '代码缩进不规范导致逻辑错误', fix: '' });
    const all = [correct, ...others].map(m => m.mistake);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return {
      question: '下面哪项是解这道题时最容易犯的错误？',
      options: ['A. ' + all[0], 'B. ' + all[1], 'C. ' + all[2], 'D. ' + all[3]],
      correctIndex: all.indexOf(correct.mistake),
    };
  }
  return {
    question: '这道题主要考察的知识是？',
    options: ['A. 理解题目逻辑并用正确语法实现', 'B. 记住代码模板直接套用', 'C. 不需要理解，照着写就行', 'D. 随便尝试总能试出来'],
    correctIndex: 0,
  };
}

export default function QuizModal({ problem, sectionType, onClose, onResult }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const cfg = TYPE_CONFIG[sectionType];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bank = await loadQuizBank();
      if (cancelled) return;
      const cached = bank[`course-${problem.id}`] || bank[problem.id];
      setQuiz(cached || generateFallback(problem));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [problem.id]);

  const passed = selected === quiz?.correctIndex;

  const handleSubmit = () => {
    if (selected === null) return;
    setSubmitted(true);
    setTimeout(() => onResult(passed), 1800);
  };

  const renderText = renderCodeText;

  if (loading || !quiz) {
    return (
      <div className="quiz-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="quiz-modal">
          <div className="quiz-loading">
            <div className="loading-spinner" />
            <p>加载验证题…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="quiz-modal">
        {!submitted ? (
          <>
            <div className="quiz-header">
              <span>{cfg.required ? '🔴 必做验证 · CSP选择题' : '🟡 选做验证 · CSP选择题'}</span>
              <button className="quiz-close" onClick={onClose}>✖</button>
            </div>
            <div className="quiz-body">
              <div className="quiz-q" dangerouslySetInnerHTML={renderText(quiz.question)} />
              <div className="quiz-options">
                {quiz.options.map((opt, i) => (
                  <label
                    key={i}
                    className={`quiz-opt ${selected === i ? 'selected' : ''}`}
                    onClick={() => setSelected(i)}
                  >
                    <span className="quiz-radio">{String.fromCharCode(65 + i)}</span>
                    <span className="quiz-opt-text" dangerouslySetInnerHTML={renderText(opt.replace(/^[A-D][.、]\s*/, ''))} />
                  </label>
                ))}
              </div>
            </div>
            <div className="quiz-footer">
              <button className="quiz-submit" disabled={selected === null} onClick={handleSubmit}>
                确认提交
              </button>
            </div>
          </>
        ) : (
          <div className="quiz-result">
            <div className="quiz-result-icon">{passed ? '🎉' : '💪'}</div>
            <h3>{passed ? '回答正确！' : '差一点！'}</h3>
            <p>
              {passed
                ? `${cfg.hasExp ? '+15 EXP  +5 金币' : '继续加油！'}`
                : `${cfg.required ? '再看看提示，重新试试吧~' : '下次细心就能拿到全部奖励！'}`
              }
            </p>
            {!passed && cfg.required && (
              <p className="quiz-hint-text">作业需要全部通过验证，查看提示后再试一次。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
