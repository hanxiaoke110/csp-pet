import { useState, useEffect, useRef } from 'react';
import { useQuizStore } from '../../stores/quizStore';
import { usePetStore } from '../../stores/petStore';
import { emit } from '@tauri-apps/api/event';
import { renderCodeText } from '../../utils/markdown';
import { useNavigate } from 'react-router-dom';
import { useClassAccess, ClassAccessRequired } from '../access/ClassAccessGate';
import KnowledgePointHelp from '../shared/KnowledgePointHelp';
import { beginQuestionBankSession } from '../../question-bank/repository';
import { toLegacyQuestion } from '../../question-bank/adapters';

// 月度复盘单次奖励封顶（金币/经验）
const MONTHLY_REVIEW_COIN_CAP = 300;
const MONTHLY_REVIEW_EXP_CAP = 400;

interface QuizQuestion {
  id: string;
  source: string;
  year: number;
  knowledgePoint: string;
  difficulty: number;
  level?: number;
  question: string;
  code?: string;
  image?: string | null;
  codeImage?: string | null;
  options: string[];
  correctIndex: number;
  explanation: string;
  type?: 'choice' | 'reading' | 'fillBlank';
  subQuestions?: { label: string; options: string[]; correctIndex: number; explanation?: string }[];
  blanks?: { label?: string; position: number; options: string[]; correctIndex: number; explanation?: string }[];
  answers?: number[];
}

type Mode = 'weekly' | 'extra' | 'free' | 'review' | 'super';

let questionBank: QuizQuestion[] | null = null;

async function loadBank(): Promise<QuizQuestion[]> {
  if (questionBank) return questionBank;
  const session = await beginQuestionBankSession(['daily', 'super']);
  const daily = (session.channels.daily || []).map(question => toLegacyQuestion(question));
  const superQuestions = (session.channels.super || []).map(question => toLegacyQuestion(question, 'super_challenge'));
  questionBank = [...daily, ...superQuestions] as QuizQuestion[];
  return questionBank!;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resolveQuizImage(src?: string | null): string | null {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return src;
  return src.startsWith('/') ? src : `/${src.replace(/^\/+/, '')}`;
}

function QuizImage({ src }: { src?: string | null }) {
  const resolved = resolveQuizImage(src);
  const [errored, setErrored] = useState(false);
  if (!resolved) return null;
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

function shouldShowQuizImage(q: QuizQuestion): boolean {
  const src = q.image || q.codeImage;
  if (!src) return false;
  const isExtractedCodeScreenshot = /\/gesp-code-images\//.test(src);
  return !isExtractedCodeScreenshot || !q.code;
}

export default function QuizPractice() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<{ correct: number; total: number; done: boolean }>({ correct: 0, total: 0, done: false });
  const [loading, setLoading] = useState(true);
  const [superAnswers, setSuperAnswers] = useState<number[]>([]);
  const [kpResults, setKpResults] = useState<Map<string, { correct: number; total: number }>>(new Map());
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<string | 'all'>('all');
  const freeStreakRef = useRef(0); // 自由练习连续答对计数（学霸时刻成就）
  const [classGate, setClassGate] = useState<{ title: string; description: string; message?: string } | null>(null);

  // 月度复盘单次奖励封顶追踪（session 级，不持久化）
  const reviewSessionCoins = useRef(0);
  const reviewSessionExp = useRef(0);

  const quizStore = useQuizStore();
  const addCoins = usePetStore(s => s.addCoins);
  const addExp = usePetStore(s => s.addExp);
  const hasPet = usePetStore(s => s.ownedPets.length > 0);
  const navigate = useNavigate();
  const classAccess = useClassAccess();

  // Gate: must have a pet first
  if (!hasPet) {
    return (
      <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🐾</div>
        <h2>请先领养一只灵犀智子！</h2>
        <p style={{ color: '#64748b', marginBottom: 20 }}>选择题的奖励需要宠物来接收，先去挑选你的学习伙伴吧。</p>
        <button className="mode-btn" onClick={() => navigate('/pet')}>🐾 去领养灵犀智子</button>
      </div>
    );
  }

  // Load bank on mount
  useEffect(() => { loadBank().then(() => setLoading(false)); }, []);

  // Get reward based on mode
  const getReward = (): { exp: number; coins: number } => {
    switch (mode) {
      case 'weekly': return { exp: 15, coins: 8 };
      case 'extra': return { exp: 8, coins: 5 };
      case 'free': return { exp: 3, coins: 3 };
      case 'review': return { exp: 20, coins: 15 };
      case 'super': return { exp: 0, coins: 0 };
      default: return { exp: 0, coins: 0 };
    }
  };

  const getSuperReward = (correct: number, total: number): { exp: number; coins: number; label: string } => {
    const ratio = correct / total;
    if (ratio === 0) return { exp: 0, coins: 0, label: '😅 下次加油！' };
    if (ratio <= 0.4) return { exp: 10, coins: 5, label: '🌱 基本奖励' };
    if (ratio <= 0.8) return { exp: 25, coins: 15, label: '🔥 进阶奖励' };
    return { exp: 50, coins: 30, label: '👑 完美通关！' };
  };

  const startMode = async (m: Mode) => {
    setClassGate(null);
    setMode(m);
    setCurrentIdx(0);
    setSelected(null);
    setSubmitted(false);
    setResults({ correct: 0, total: 0, done: false });
    setKpResults(new Map());
    freeStreakRef.current = 0;
    setQuestions([]);
    setLoading(true);

    // 重置月度复盘 session 计数
    if (m === 'review') {
      reviewSessionCoins.current = 0;
      reviewSessionExp.current = 0;
    }

    let bank: QuizQuestion[] = [];
    try {
      bank = await loadBank();
    } finally {
      setLoading(false);
    }

    if (m === 'review') {
      // Use error pool
      const errorIds = new Set(quizStore.errors.map(e => e.questionId));
      const reviewQs = bank.filter(q => errorIds.has(q.id));
      setQuestions(shuffle(reviewQs));
    } else if (m === 'super') {
      const superQs = bank.filter(q => q.source === 'super_challenge');
      setQuestions(shuffle(superQs).slice(0, 1));
    } else {
      // Random CSP/GESP exam questions with optional filters
      let pool = bank.filter(q => q.source === 'csp_exam' || q.source === 'gesp');
      if (sourceFilter !== 'all') {
        pool = pool.filter(q => q.source === sourceFilter);
      }
      if (levelFilter !== 'all') {
        pool = pool.filter(q => q.level === levelFilter);
      }
      if (pool.length === 0) {
        // Fallback to all exam questions if filter leaves nothing
        pool = bank.filter(q => q.source === 'csp_exam' || q.source === 'gesp');
      }
      setQuestions(shuffle(pool).slice(0, m === 'free' ? 15 : 5));
    }
  };

  const startRestrictedMode = async (m: 'review' | 'super') => {
    const label = m === 'review' ? '月度复盘' : '超级挑战';
    const result = await classAccess.ensure();
    if (result.ok) {
      startMode(m);
      return;
    }
    setClassGate({
      title: `${label}需要班级码`,
      description: `${label}属于班级专属挑战，需要先绑定老师提供的班级码。普通自由练习仍可直接使用。`,
      message: result.message,
    });
  };

  const handleSubmit = () => {
    if (selected === null) return;
    setSubmitted(true);
    const q = questions[currentIdx];
    const reward = getReward();

    if (selected === q.correctIndex) {
      quizStore.recordAnswer(true);
      // 自由练习连续答对 -> 记录 max 到 localStorage（学霸时刻成就）
      if (mode === 'free') {
        freeStreakRef.current += 1;
        try { const prev = parseInt(localStorage.getItem('csp_free_streak') || '0'); if (freeStreakRef.current > prev) localStorage.setItem('csp_free_streak', String(freeStreakRef.current)); } catch {}
      }
      const newResults = { ...results, correct: results.correct + 1, total: results.total + 1 };
      setResults(newResults);

      // Pet reacts
      if (results.correct === 0) emit('pet-anim', { anim: 'celebrate', duration: 2000 }).catch(() => {});
      else emit('pet-anim', { anim: 'think', duration: 1500 }).catch(() => {});

      // Track KP result
      if (q.knowledgePoint) {
        setKpResults(prev => {
          const next = new Map(prev);
          const cur = next.get(q.knowledgePoint) || { correct: 0, total: 0 };
          next.set(q.knowledgePoint, { correct: cur.correct + 1, total: cur.total + 1 });
          return next;
        });
      }

      // Reward (per question for non-weekly/non-extra modes — those reward on completion only)
      if (mode !== 'super' && mode !== 'weekly' && mode !== 'extra' && reward.exp > 0) {
        const activePetId = usePetStore.getState().activePetId;
        const mult = usePetStore.getState().getRewardMultiplier();

        if (mode === 'free') {
          // 自由练习：每日前 N 题有奖励（方案A），超出可继续做题但不发奖
          if (quizStore.canRewardFreePractice()) {
            if (activePetId) addExp(activePetId, reward.exp);
            addCoins(Math.floor(reward.coins * mult));
            quizStore.recordFreeReward();
          }
        } else if (mode === 'review') {
          // 月度复盘：单次金币/经验封顶，超出部分只清错题不发奖
          const remainingCoins = Math.max(0, MONTHLY_REVIEW_COIN_CAP - reviewSessionCoins.current);
          const remainingExp = Math.max(0, MONTHLY_REVIEW_EXP_CAP - reviewSessionExp.current);
          if (remainingCoins > 0 || remainingExp > 0) {
            const giveCoins = Math.min(Math.floor(reward.coins * mult), remainingCoins);
            const giveExp = Math.min(reward.exp, remainingExp);
            if (giveCoins > 0) addCoins(giveCoins);
            if (activePetId && giveExp > 0) addExp(activePetId, giveExp);
            reviewSessionCoins.current += giveCoins;
            reviewSessionExp.current += giveExp;
          }
        } else {
          if (activePetId) addExp(activePetId, reward.exp);
          addCoins(Math.floor(reward.coins * mult));
        }
      }

      // In review mode, remove from errors
      if (mode === 'review') {
        quizStore.removeError(q.id);
      }
    } else {
      setResults(r => ({ ...r, total: r.total + 1 }));
      if (mode === 'free') freeStreakRef.current = 0;
      // Pet reacts to wrong answer
      emit('pet-anim', { anim: 'unhappy', duration: 2000 }).catch(() => {});
      const lines = ['没关系，再看看！💡', '差一点点，再想想~', '别灰心，错题才是进步的阶梯！'];
      emit('pet-bubble', { text: lines[Math.floor(Math.random() * lines.length)] }).catch(() => {});
      // Track KP result (wrong)
      if (q.knowledgePoint) {
        setKpResults(prev => {
          const next = new Map(prev);
          const cur = next.get(q.knowledgePoint) || { correct: 0, total: 0 };
          next.set(q.knowledgePoint, { correct: cur.correct, total: cur.total + 1 });
          return next;
        });
      }
      // Report error to error pool and server
      quizStore.addError(q.id, selected, q.correctIndex, q.knowledgePoint);
      quizStore.recordAnswer(false);
    }
  };

  const nextQuestion = () => {
    // Hunger: -1 every 2 questions
    if (currentIdx % 2 === 1) usePetStore.getState().tickHunger();
    if (currentIdx + 1 >= questions.length) {
      const finalResults = { ...results, done: true, correct: results.correct + (selected === q.correctIndex ? 1 : 0), total: results.total + 1 };
      setResults(finalResults);
      // Record KP results to store
      const kpArray = Array.from(kpResults.entries()).map(([kp, v]) => ({ kp, ...v }));
      quizStore.recordKpResults(kpArray);
      if (mode === 'weekly') {
        quizStore.completeWeeklyTask(finalResults.correct === 5);
        // Reward on completion (not per-question — prevents exploit by leaving mid-task)
        const reward = getReward();
        const correct = finalResults.correct;
        if (reward.exp > 0 && correct > 0) {
          const activePetId = usePetStore.getState().activePetId;
          if (activePetId) addExp(activePetId, reward.exp * correct);
          const mult = usePetStore.getState().getRewardMultiplier();
          addCoins(Math.floor(reward.coins * correct * mult));
        }
        usePetStore.getState().claimPendingRewards();
      }
      if (mode === 'extra') {
        quizStore.completeExtraChallenge();
        // Reward on completion
        const reward = getReward();
        const correct = finalResults.correct;
        if (reward.exp > 0 && correct > 0) {
          const activePetId = usePetStore.getState().activePetId;
          if (activePetId) addExp(activePetId, reward.exp * correct);
          const mult = usePetStore.getState().getRewardMultiplier();
          addCoins(Math.floor(reward.coins * correct * mult));
        }
      }
      if (mode === 'review') quizStore.completeMonthlyReview(finalResults.correct, finalResults.total);
      if (mode === 'super') {
        quizStore.completeSuperChallenge(finalResults.correct);
        // Apply tiered super reward
        const sr = getSuperReward(finalResults.correct, finalResults.total);
        if (sr.exp > 0) {
          const activePetId = usePetStore.getState().activePetId;
          if (activePetId) addExp(activePetId, sr.exp);
          const mult = usePetStore.getState().getRewardMultiplier();
          addCoins(Math.floor(sr.coins * mult));
        }
      }

      // Pet celebrates on quiz completion
      emit('pet-anim', { anim: 'celebrate', duration: 3000 }).catch(() => {});
      const completionLines: Record<string, string[]> = {
        weekly: ['本周任务完成！去领奖励吧 🎁', '全部搞定！你太强了 🔥', '一周的努力没有白费！'],
        extra: ['额外挑战完成！加练达人 💪', '超额完成任务！'],
        super: ['超级挑战通关！🏆', '极限模式征服者！'],
        review: ['复盘完成，查漏补缺！📋', '错题全部消化！'],
        free: ['练习完成，手感火热！', '又进步了一点点 ✨'],
      };
      const lines = completionLines[mode || 'free'] || ['全部完成！'];
      emit('pet-bubble', { text: lines[Math.floor(Math.random() * lines.length)] }).catch(() => {});
    } else {
      setCurrentIdx(i => i + 1);
      setSelected(null);
      setSubmitted(false);
    }
  };

  const renderText = renderCodeText;

  // --- Mode selection screen ---
  if (!mode) {
    // 班级码门禁未通过（月度复盘 / 超级挑战）：展示提示，不进入答题
    if (classGate) {
      return (
        <ClassAccessRequired
          title={classGate.title}
          description={classGate.description}
          message={classGate.message}
          onBind={() => navigate('/settings')}
          onBack={() => setClassGate(null)}
        />
      );
    }
    return (
      <div className="quiz-practice">
        <h2>📝 选择题练习</h2>
        <p className="quiz-subtitle">完成选择题练习获得经验和金币，答错自动记录到月度复盘</p>

        <div className="quiz-filter-bar">
          <div className="quiz-filter-group">
            <span className="quiz-filter-label">等级</span>
            <div className="quiz-filter-options">
              {(['all', 1, 2, 3, 4] as const).map(lv => (
                <button
                  key={String(lv)}
                  className={`quiz-filter-btn ${levelFilter === lv ? 'active' : ''}`}
                  onClick={() => setLevelFilter(lv)}
                >
                  {lv === 'all' ? '全部' : `GESP ${lv}级`}
                </button>
              ))}
            </div>
          </div>
          <div className="quiz-filter-group">
            <span className="quiz-filter-label">来源</span>
            <div className="quiz-filter-options">
              {[
                { key: 'all', label: '全部' },
                { key: 'gesp', label: 'GESP' },
                { key: 'csp_exam', label: 'CSP' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`quiz-filter-btn ${sourceFilter === key ? 'active' : ''}`}
                  onClick={() => setSourceFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="quiz-filter-hint">
          {(() => {
            if (!questionBank) return '加载题库中...';
            let pool = questionBank.filter(q => q.source === 'csp_exam' || q.source === 'gesp');
            if (sourceFilter !== 'all') pool = pool.filter(q => q.source === sourceFilter);
            if (levelFilter !== 'all') pool = pool.filter(q => q.level === levelFilter);
            const parts: string[] = [];
            if (levelFilter !== 'all') parts.push(`GESP ${levelFilter}级`);
            if (sourceFilter !== 'all') parts.push(sourceFilter === 'gesp' ? 'GESP' : 'CSP');
            const scope = parts.length > 0 ? parts.join(' · ') : '全部';
            return `当前练习范围：${scope}，共 ${pool.length} 道题`;
          })()}
        </p>

        <div className="quiz-mode-cards">
          <div className="quiz-mode-card">
            <div className="mode-header">
              <span className="mode-icon">📋</span>
              <span className="mode-title">每周任务</span>
              <span className="mode-badge mode-weekly">+15 EXP +8 金币/题</span>
            </div>
            <p className="mode-desc">
              {quizStore.canDoWeeklyTask()
                ? '5 道真题，完成后解锁额外挑战'
                : '✅ 本周已完成' + (quizStore.weeklyPerfects > 0 ? ` (含 ${quizStore.weeklyPerfects} 次完美挑战🏆)` : '')
              }
            </p>
            {quizStore.canDoWeeklyTask() && quizStore.weeklyCompletions === 0 && (
              <p className="mode-nudge">🐱 「灵犀智子成长需要你的帮助！完成挑战可以让我变得更强哦~」</p>
            )}
            <button
              className="mode-btn"
              disabled={!quizStore.canDoWeeklyTask()}
              onClick={() => startMode('weekly')}
            >
              {quizStore.canDoWeeklyTask() ? '开始答题 (5题)' : '✅ 本周已完成'}
            </button>
          </div>

          <div className="quiz-mode-card">
            <div className="mode-header">
              <span className="mode-icon">🔥</span>
              <span className="mode-title">额外挑战</span>
              <span className="mode-badge mode-extra">+8 EXP +5 金币/题</span>
            </div>
            <p className="mode-desc">完成每周任务后解锁，再做 5 道题赚更多奖励</p>
            <button
              className="mode-btn"
              disabled={!quizStore.canDoExtraChallenge()}
              onClick={() => startMode('extra')}
            >
              {quizStore.canDoExtraChallenge() ? '开始答题 (5题)' : quizStore.weeklyTaskDone < 5 ? '🔒 先完成每周任务' : '✅ 今日已挑战'}
            </button>
          </div>

          <div className="quiz-mode-card">
            <div className="mode-header">
              <span className="mode-icon">📚</span>
              <span className="mode-title">月度复盘</span>
              <span className="mode-badge mode-review">+20 EXP +15 金币/题 · 单次封顶300金币</span>
            </div>
            <p className="mode-desc">
              {(() => {
                const review = quizStore.canDoMonthlyReview();
                return review.allowed
                  ? `✅ ${review.reason} · ${quizStore.errorCount()} 道错题等你挑战`
                  : `🔒 ${review.reason}`;
              })()}
            </p>
            <button
              className="mode-btn mode-btn-review"
              disabled={!quizStore.canDoMonthlyReview().allowed}
              onClick={() => startRestrictedMode('review')}
            >
              {quizStore.canDoMonthlyReview().allowed ? `开始复盘 (${quizStore.errorCount()}题)` : '已锁定'}
            </button>
          </div>

          <div className="quiz-mode-card">
            <div className="mode-header">
              <span className="mode-icon">🏋️</span>
              <span className="mode-title">自由练习</span>
              <span className="mode-badge mode-free">+3 EXP +3 金币/题 · 每日前30题有奖</span>
            </div>
            <p className="mode-desc">
              不限次数，今日剩余奖励题数 {quizStore.freeRewardRemaining()}/30，超出可继续做题但不发奖
            </p>
            <button className="mode-btn" onClick={() => startMode('free')}>
              开始练习
            </button>
          </div>

          <div className="quiz-mode-card mode-super">
            <div className="mode-header">
              <span className="mode-icon">⚡</span>
              <span className="mode-title">超级挑战</span>
              <span className="mode-badge mode-super-badge">
                {quizStore.canDoSuperChallenge() ? '可挑战' : '本轮已挑战'}
              </span>
            </div>
            <p className="mode-desc">
              {quizStore.canDoSuperChallenge()
                ? '程序阅读 & 程序填空题，5-6 小问一次性挑战。全错无奖，全对完美通关！'
                : `🔒 本轮已完成，${quizStore.superDaysLeft?.() || 14} 天后可再次挑战`
            }
            </p>
            <button
              className="mode-btn mode-btn-super"
              disabled={!quizStore.canDoSuperChallenge()}
              onClick={() => startRestrictedMode('super')}
            >
              {quizStore.canDoSuperChallenge() ? '⚡ 开始挑战' : '已完成'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Results screen ---
  if (results.done) {
    const allCorrect = results.correct === results.total;
    return (
      <div className="quiz-practice">
        <div className="quiz-results">
          <div className="result-icon">{allCorrect ? '🏆' : '🎉'}</div>
          <h2>
            {mode === 'review'
              ? (allCorrect ? '完美复盘！' : '复盘完成！')
              : mode === 'weekly' && allCorrect
                ? '完美挑战！全对！'
                : (allCorrect ? '全对！太厉害了！' : '答题完成！')
            }
          </h2>
          <div className="result-stats">
            <div className="stat">
              <span className="stat-value">{results.correct}/{results.total}</span>
              <span className="stat-label">正确</span>
            </div>
            {mode === 'super' ? (() => {
              const sr = getSuperReward(results.correct, results.total);
              return <>
                <div className="stat">
                  <span className="stat-value">+{sr.exp}</span>
                  <span className="stat-label">经验</span>
                </div>
                <div className="stat">
                  <span className="stat-value">+{sr.coins}</span>
                  <span className="stat-label">金币</span>
                </div>
              </>;
            })() : <>
              <div className="stat">
                <span className="stat-value">+{results.correct * getReward().exp}</span>
                <span className="stat-label">经验</span>
              </div>
              <div className="stat">
                <span className="stat-value">+{results.correct * getReward().coins}</span>
                <span className="stat-label">金币</span>
              </div>
            </>}
          </div>
          {allCorrect && mode === 'review' && (
            <p className="result-bonus">完美复盘额外奖励：+50 EXP +30 金币 🎁</p>
          )}
          {allCorrect && mode === 'weekly' && (
            <p className="result-bonus">完美挑战额外奖励：+30 EXP +15 金币 🎁</p>
          )}
          {mode === 'super' && (
            <p className="result-bonus">{getSuperReward(results.correct, results.total).label}</p>
          )}

          {/* KP Analysis */}
          {mode !== 'super' && kpResults.size > 0 && (
            <div className="quiz-kp-analysis">
              <h4>📊 {mode === 'review' ? '累计薄弱知识点' : '本次知识点表现'}</h4>
              {Array.from(kpResults.entries())
                .sort(([, a], [, b]) => (a.correct / a.total) - (b.correct / b.total))
                .map(([kp, v]) => {
                  const rate = v.correct / v.total;
                  const icon = rate === 1 ? '✅' : rate >= 0.5 ? '⚠️' : '❌';
                  return (
                    <div key={kp} className="kp-row">
                      <span className="kp-icon">{icon}</span>
                      <span className="kp-name">{kp}</span>
                      <span className="kp-score">{v.correct}/{v.total}</span>
                      <span className="kp-rate">{Math.round(rate * 100)}%</span>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Monthly Review: cumulative weak points */}
          {mode === 'review' && quizStore.getWeakPoints(5).length > 0 && (
            <div className="quiz-kp-analysis" style={{ marginTop: 12 }}>
              <h4>🔍 历史薄弱知识点（需加强）</h4>
              {quizStore.getWeakPoints(5).map(w => (
                <div key={w.kp} className="kp-row kp-weak">
                  <span className="kp-icon">{w.rate < 0.5 ? '❌' : '⚠️'}</span>
                  <span className="kp-name">{w.kp}</span>
                  <span className="kp-score">{w.total}题</span>
                  <span className="kp-rate">{Math.round(w.rate * 100)}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="result-actions">
            {mode === 'weekly' && quizStore.canDoExtraChallenge() && (
              <button className="mode-btn" onClick={() => startMode('extra')}>
                🔥 想要更多奖励？额外挑战 →
              </button>
            )}
            <button className="mode-btn mode-btn-back" onClick={() => setMode(null)}>
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Super Challenge answering screen ---
  if (mode === 'super' && questions.length > 0) {
    const q = questions[0];
    const subItems = q.type === 'fillBlank' ? (q.blanks || []) : (q.subQuestions || []);
    const subCount = subItems.length;

    const handleSuperSubmit = () => {
      if (superAnswers.length < subCount) return;
      const correctAnswers = q.answers || [];
      let correct = 0;
      for (let i = 0; i < subCount; i++) {
        const expected = correctAnswers[i];
        const got = superAnswers[i];
        if (typeof expected === 'boolean') {
          if ((expected && got === 0) || (!expected && got === 1)) correct++;
        } else {
          if (got === expected) correct++;
        }
      }
      setResults({ correct, total: subCount, done: true });
      quizStore.completeSuperChallenge(correct);
      // Add wrong sub-questions to error pool for monthly review
      for (let i = 0; i < subCount; i++) {
        const expected = correctAnswers[i];
        const got = superAnswers[i];
        const isCorrect = typeof expected === 'boolean'
          ? ((expected && got === 0) || (!expected && got === 1))
          : got === expected;
        if (!isCorrect) {
          quizStore.addError(`${q.id}-q${i+1}`, got ?? -1, typeof expected === 'boolean' ? (expected ? 0 : 1) : expected);
        }
      }
      const sr = getSuperReward(correct, subCount);
      if (sr.exp > 0) {
        const activePetId = usePetStore.getState().activePetId;
        if (activePetId) addExp(activePetId, sr.exp);
        const mult = usePetStore.getState().getRewardMultiplier();
        addCoins(Math.floor(sr.coins * mult));
      }
    };

    return (
      <div className="quiz-practice">
        <div className="quiz-question-header">
          <span className="quiz-mode-label">⚡ 超级挑战</span>
          <span className="quiz-kp">{q.type === 'reading' ? '📖 程序阅读' : '✏️ 程序填空'} · {subCount}小问</span>
        </div>
        <div className="quiz-question-card">
          {q.code && <pre className="code-block"><code>{q.code}</code></pre>}
          <QuizImage src={q.image || q.codeImage} />
          <div className="quiz-q-body" dangerouslySetInnerHTML={renderText(q.question)} />
        </div>
        <div className="quiz-question-card" style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 16 }}>请作答（共 {subCount} 小问）</h4>
          <div className="super-answers">
            {Array.from({ length: subCount }, (_, i) => {
              const item = subItems[i];
              return (
                <div key={i} className="super-answer-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ marginBottom: 8, lineHeight: 1.6 }}><b>{i + 1}.</b> {item?.label}</div>
                    <div className="super-options">
                      {(item?.options || []).map((opt, oi) => (
                        <label key={`${oi}-${opt}`} className={`super-opt ${superAnswers[i] === oi ? 'selected' : ''}`} onClick={() => {
                          const a = [...superAnswers]; a[i] = oi; setSuperAnswers(a);
                        }}><b>{String.fromCharCode(65 + oi)}.</b> {opt}</label>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="quiz-actions" style={{ marginTop: 20 }}>
            <button className="quiz-submit-btn" disabled={superAnswers.filter(a => a !== undefined).length < subCount}
              onClick={handleSuperSubmit}>
              提交答案
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Regular answering screen ---
  if (loading) {
    return <div className="quiz-practice"><div className="loading-spinner" /><p>加载题目中...</p></div>;
  }

  if (questions.length === 0) {
    const emptyText: Record<Mode, string> = {
      weekly: '当前筛选条件下没有可用题目。',
      extra: '当前额外挑战没有可用题目。',
      free: '当前筛选条件下没有可用练习题。',
      review: '当前错题已清空，暂无可复盘题目。',
      super: '当前超级挑战题库为空。',
    };
    return (
      <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h2>暂无题目</h2>
        <p className="quiz-subtitle">{emptyText[mode]}</p>
        <button className="mode-btn mode-btn-back" onClick={() => setMode(null)}>
          返回选择
        </button>
      </div>
    );
  }

  const q = questions[currentIdx];
  const modeLabel: Record<Mode, string> = { weekly: '每周任务', extra: '额外挑战', free: '自由练习', review: '月度复盘', super: '超级挑战' };

  return (
    <div className="quiz-practice">
      <div className="quiz-question-header">
        <span className="quiz-mode-label">{modeLabel[mode]}</span>
        <span className="quiz-progress">{currentIdx + 1}/{questions.length}</span>
        <span className="quiz-kp">{q.knowledgePoint}</span>
        {mode === 'free' && (
          <span className="quiz-kp" style={{ marginLeft: 'auto' }}>
            今日奖励 {quizStore.freeRewardRemaining()}/30
          </span>
        )}
        {mode === 'review' && (
          <span className="quiz-kp" style={{ marginLeft: 'auto' }}>
            已获 {reviewSessionCoins.current}/{MONTHLY_REVIEW_COIN_CAP} 金币
          </span>
        )}
      </div>

      <div className="quiz-question-card">
        {q.code && <pre className="code-block"><code>{q.code}</code></pre>}
        {shouldShowQuizImage(q) && <QuizImage src={q.image || q.codeImage} />}
        <div className="quiz-q-body" dangerouslySetInnerHTML={renderText(q.question)} />

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
                <span className="quiz-opt-text" dangerouslySetInnerHTML={renderText(opt.replace(/^[A-D][.、]\s*/, ''))} />
              </label>
            );
          })}
        </div>

        {submitted && (
          <div className={`quiz-feedback ${selected === q.correctIndex ? 'correct' : 'wrong'}`}>
            <strong>{selected === q.correctIndex ? '✅ 回答正确！' : '❌ 回答错误'}</strong>
            {q.explanation && <p dangerouslySetInnerHTML={renderText(q.explanation)} />}
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
          <button className="quiz-submit-btn" onClick={nextQuestion}>
            {currentIdx + 1 >= questions.length ? '查看结果' : '下一题 →'}
          </button>
        )}
      </div>
    </div>
  );
}
