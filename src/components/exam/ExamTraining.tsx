import { useState, useEffect, useMemo } from 'react';
import { useQuizStore } from '../../stores/quizStore';
import { usePetStore } from '../../stores/petStore';
import ExamChoice from './ExamChoice';
import ExamMultiPart from './ExamMultiPart';
import { emit } from '@tauri-apps/api/event';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

interface ExamQuestion {
  id: string;
  year: number;
  group: 'J' | 'S';
  type: 'choice' | 'reading' | 'fillBlank';
  knowledgePoint: string;
  difficulty: number;
  question: string;
  code?: string | null;
  image?: string | null;
  options?: string[];
  correctIndex?: number;
  subQuestions?: { label: string; options: string[]; correctIndex: number; explanation?: string }[];
  blanks?: { position: number; options: string[]; correctIndex: number; explanation?: string }[];
  explanation?: string;
}

type View = 'group' | 'type-select' | 'choice-answer' | 'multipart-answer';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const STORAGE_KEY = 'csp_exam_group';

export default function ExamTraining() {
  const [bank, setBank] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<'J' | 'S'>(() => {
    return (localStorage.getItem(STORAGE_KEY) as 'J' | 'S') || 'J';
  });
  const [view, setView] = useState<View>('group');
  const [activeType, setActiveType] = useState<'choice' | 'reading' | 'fillBlank' | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  const examStore = useQuizStore();
  const hasPet = usePetStore(s => s.ownedPets.length > 0);

  // Load bank：localStorage 缓存优先 + 后台检查 Gitee 更新
  const CACHE_KEY = 'csp_exam_bank_v3';
  const REMOTE_BASE = 'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data';
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // 1. 先读缓存，秒开
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try { const d = JSON.parse(cached); if (d.questions?.length) { setBank(d.questions); setLoading(false); } } catch {}
      }
      // 2. 后台检查远程版本
      try {
        const verResp = await tauriFetch(`${REMOTE_BASE}/exam-version.json`, { connectTimeout: 10_000 });
        if (verResp.ok && !cancelled) {
          const remoteVer = await verResp.json() as { version: number };
          const localVer = parseInt(localStorage.getItem('csp_exam_version') || '0');
          if (remoteVer.version > localVer) {
            // 有新版本，下载
            const bankResp = await tauriFetch(`${REMOTE_BASE}/csp-exam-bank.json`, { connectTimeout: 15_000 });
            if (bankResp.ok && !cancelled) {
              const data = await bankResp.json() as { questions: any[] };
              if (data.questions?.length) {
                setBank(data.questions);
                localStorage.setItem(CACHE_KEY, JSON.stringify(data));
                localStorage.setItem('csp_exam_version', String(remoteVer.version));
              }
            }
          }
        }
      } catch { /* 网络错误，用缓存即可 */ }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Group filtered bank
  const groupBank = useMemo(() => bank.filter(q => q.group === group), [bank, group]);

  const choiceQs = useMemo(() => groupBank.filter(q => q.type === 'choice'), [groupBank]);
  const readingQs = useMemo(() => groupBank.filter(q => q.type === 'reading'), [groupBank]);
  const fillBlankQs = useMemo(() => groupBank.filter(q => q.type === 'fillBlank'), [groupBank]);

  const completed = examStore.examDailyCompleted;
  const choiceDone = completed.filter(r => r.type === 'choice').length;
  const readingOrFillDone = completed.some(r => r.type === 'reading' || r.type === 'fillBlank');

  const hasClassCode = !!(localStorage.getItem('csp_class_code'));

  // Gate: must have class code bound
  if (!hasClassCode) {
    return (
      <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
        <h2>请先绑定班级码</h2>
        <p style={{ color: '#64748b', marginBottom: 20 }}>CSP 真题训练需要绑定班级码才能使用，请先在设置中输入老师提供的班级码。</p>
      </div>
    );
  }

  // Gate: must have pet
  if (!hasPet) {
    return (
      <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🐾</div>
        <h2>请先领养一只灵犀智子！</h2>
        <p style={{ color: '#64748b', marginBottom: 20 }}>CSP 真题训练需要宠物来接收奖励，先去挑选你的学习伙伴吧。</p>
      </div>
    );
  }

  if (loading) return <div className="oj-training"><div className="loading-spinner" /><p>加载题库中...</p></div>;
  if (error) return (
    <div className="oj-training" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ color: '#ef4444' }}>题库加载失败：{error}</p>
      <button className="mode-btn" onClick={() => { setError(null); setLoading(true); fetch('/course-data/csp-exam-bank.json').then(r => r.json()).then(d => { setBank(d.questions || []); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); }); }}>重试</button>
    </div>
  );

  const startPractice = (type: 'choice' | 'reading' | 'fillBlank') => {
    setActiveType(type);
    if (type === 'choice') {
      const pool = choiceQs.filter(q => !completed.some(r => r.id === q.id));
      // 每次只出 3 道随机题，做完返回
      setQuestions(shuffle(pool).slice(0, 3));
      setCurrentIdx(0);
      setView('choice-answer');
    } else {
      const pool = (type === 'reading' ? readingQs : fillBlankQs).filter(q => !completed.some(r => r.id === q.id));
      setQuestions(shuffle(pool));
      setCurrentIdx(0);
      setView('multipart-answer');
    }
  };

  const handleChoiceAnswer = (id: string, correct: boolean) => {
    const q = questions[currentIdx];
    examStore.completeExamQuestion(id, 'choice', correct);
    if (!correct && q) {
      const kp = (q as any).knowledgePoint || '';
      examStore.addError(id, 0, (q as any).correctIndex || 0, kp);
    }
    if (!correct) {
      emit('pet-bubble', { text: '没关系，再看看解析！💡' }).catch(() => {});
    }
  };

  const handleChoiceNext = () => {
    if (currentIdx + 1 >= questions.length) {
      setView('type-select');
      return;
    }
    setCurrentIdx(i => i + 1);
  };

  const handleChoiceBack = () => {
    setView('type-select');
  };

  const handleMultiPartSubmit = (correctCount: number, total: number) => {
    const q = questions[currentIdx];
    const pass = total >= 5 ? correctCount >= 3 : correctCount >= 2;
    examStore.completeExamQuestion(q.id, activeType as 'reading' | 'fillBlank', pass);
    if (!pass) {
      const kp = (q as any).knowledgePoint || '';
      examStore.addError(q.id, total - correctCount, correctCount, kp);
      emit('pet-bubble', { text: `答对 ${correctCount}/${total}，未过半，换一道试试？💪` }).catch(() => {});
    } else {
      emit('pet-bubble', { text: `答对 ${correctCount}/${total}，漂亮！🎉` }).catch(() => {});
    }
  };

  const handleMultiPartBack = () => {
    setView('type-select');
  };

  const claimReward = () => {
    const result = examStore.claimExamDailyReward();
    if (result) {
      emit('pet-anim', { anim: 'celebrate', duration: 3000 }).catch(() => {});
      const bonusText = result.bonusLabel ? `\n${result.bonusLabel}` : '';
      emit('pet-bubble', { text: `今日任务完成！+${result.exp} EXP +${result.coins} 金币 🎉${bonusText}` }).catch(() => {});
    }
  };

  const accuracy = examStore.getExamDailyAccuracy();
  const accuracyPct = Math.round(accuracy * 100);

  // --- Group selection view ---
  if (view === 'group') {
    return (
      <div className="quiz-practice">
        <h2>🏅 CSP 真题训练</h2>
        <p className="quiz-subtitle">选择你的组别，开始历年真题练习</p>

        {/* 规则说明 */}
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#0369a1', fontSize: 15 }}>📋 每日任务规则</h4>
          <div style={{ fontSize: 13, color: '#0c4a6e', lineHeight: 2 }}>
            <div>🎯 <b>任务目标：</b>答对 3 道选择题 + (1 道程序阅读题 或 1 道程序填空题)</div>
            <div>💰 <b>基础奖励：</b>+20 EXP +12 金币</div>
            <div>⭐ <b>正确率加成：</b></div>
            <div style={{ paddingLeft: 16 }}>
              <div>· 正确率 ≥ 80% → <b>+10 EXP +5 金币</b> 🌟</div>
              <div>· 全部正确 100% → <b>+20 EXP +10 金币</b> 👑</div>
            </div>
            <div>📌 <b>注意：</b>答错不推进进度，只有答对才算！每天 0 点重置。</div>
          </div>
        </div>

        <div className="quiz-mode-cards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className={`quiz-mode-card ${group === 'J' ? 'mode-super' : ''}`} onClick={() => { setGroup('J'); localStorage.setItem(STORAGE_KEY, 'J'); setView('type-select'); }} style={{ cursor: 'pointer' }}>
            <div className="mode-header">
              <span className="mode-icon">🌱</span>
              <span className="mode-title">CSP-J 入门级</span>
            </div>
            <p className="mode-desc">适合小学生和初中生，考察基础算法和数据结构</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              选择题 {bank.filter(q => q.group === 'J' && q.type === 'choice').length} 道 · 阅读 {bank.filter(q => q.group === 'J' && q.type === 'reading').length} 道 · 填空 {bank.filter(q => q.group === 'J' && q.type === 'fillBlank').length} 道
            </p>
          </div>
          <div className={`quiz-mode-card ${group === 'S' ? 'mode-super' : ''}`} onClick={() => { setGroup('S'); localStorage.setItem(STORAGE_KEY, 'S'); setView('type-select'); }} style={{ cursor: 'pointer' }}>
            <div className="mode-header">
              <span className="mode-icon">🚀</span>
              <span className="mode-title">CSP-S 提高级</span>
            </div>
            <p className="mode-desc">适合初中生和高中生，考察高级算法和数据结构</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              选择题 {bank.filter(q => q.group === 'S' && q.type === 'choice').length} 道 · 阅读 {bank.filter(q => q.group === 'S' && q.type === 'reading').length} 道 · 填空 {bank.filter(q => q.group === 'S' && q.type === 'fillBlank').length} 道
            </p>
          </div>
        </div>
        <button className="mode-btn mode-btn-back" onClick={() => setGroup(group === 'J' ? 'S' : 'J')}>
          切换到 CSP-{group === 'J' ? 'S' : 'J'}
        </button>
      </div>
    );
  }

  // --- Type selection view ---
  if (view === 'type-select') {
    const canClaim = examStore.canClaimExamDaily();

    return (
      <div className="quiz-practice">
        <h2>🏅 CSP-{group} 真题训练</h2>
        <button onClick={() => setView('group')} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          ← 切换组别
        </button>

        {/* Daily task progress */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📝 今日任务：3 选择 + 1 阅读/填空 → +20 EXP +12g</span>
            {canClaim && (
              <button onClick={claimReward} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                🎁 领取奖励
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#78350f' }}>
            <span>选择 [{choiceDone >= 3 ? '✅' : '⬜'.repeat(choiceDone) + '⬜'.repeat(Math.max(0, 3 - choiceDone))}] {choiceDone}/3</span>
            <span>阅读/填空 [{readingOrFillDone ? '✅' : '⬜'}] {readingOrFillDone ? 1 : 0}/1</span>
            <span>正确率 [{accuracyPct}%]</span>
          </div>
          {canClaim && <p style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12, marginTop: 6 }}>🎉 今日任务完成！点击上方按钮领取奖励</p>}
        </div>

        <div className="quiz-mode-cards">
          <button className="quiz-mode-card" onClick={() => startPractice('choice')} disabled={choiceQs.length < 3} style={{ border: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}>
            <div className="mode-header">
              <span className="mode-icon">📝</span>
              <span className="mode-title">选择题</span>
              <span className="mode-badge mode-weekly">{choiceQs.length} 道可用</span>
            </div>
            <p className="mode-desc">历年 CSP-{group} 单项选择题，每题 4 个选项，答对计进度</p>
            {choiceQs.length < 3 && <p className="mode-nudge">题目准备中，至少需要 3 道题</p>}
          </button>

          <button className="quiz-mode-card" onClick={() => startPractice('reading')} disabled={readingQs.length < 1} style={{ border: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}>
            <div className="mode-header">
              <span className="mode-icon">📖</span>
              <span className="mode-title">程序阅读题</span>
              <span className="mode-badge mode-extra">{readingQs.length} 道可用</span>
            </div>
            <p className="mode-desc">阅读 C++ 程序，判断输出结果。答对半数以上小问算完成</p>
            {readingQs.length < 1 && <p className="mode-nudge">题目准备中</p>}
          </button>

          <button className="quiz-mode-card" onClick={() => startPractice('fillBlank')} disabled={fillBlankQs.length < 1} style={{ border: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}>
            <div className="mode-header">
              <span className="mode-icon">✏️</span>
              <span className="mode-title">程序填空题</span>
              <span className="mode-badge mode-review">{fillBlankQs.length} 道可用</span>
            </div>
            <p className="mode-desc">完善 C++ 程序中的空缺部分。答对半数以上空位算完成</p>
            {fillBlankQs.length < 1 && <p className="mode-nudge">题目准备中</p>}
          </button>
        </div>
      </div>
    );
  }

  // --- Choice answering view ---
  if (view === 'choice-answer' && questions.length > 0) {
    const q = questions[currentIdx];
    return (
      <ExamChoice
        key={q.id}
        question={q as any}
        questionNum={`第 ${currentIdx + 1}/${questions.length} 题`}
        onAnswer={handleChoiceAnswer}
        onNext={handleChoiceNext}
        onBack={handleChoiceBack}
      />
    );
  }

  // --- MultiPart answering view (reading + fillBlank) ---
  if (view === 'multipart-answer' && questions.length > 0) {
    const q = questions[currentIdx];
    const title = `${q.type === 'reading' ? '📖 程序阅读' : '✏️ 程序填空'} · CSP-${q.group} ${q.year} · ${q.type === 'reading' ? (q.subQuestions?.length || 0) + '小问' : (q.blanks?.length || 0) + '空'}`;
    const subItems = q.type === 'reading'
      ? (q.subQuestions || []).map(sq => ({ label: sq.label, options: sq.options, correctIndex: sq.correctIndex, explanation: sq.explanation }))
      : (q.blanks || []).map(b => ({ label: `空位 ${b.position}`, options: b.options, correctIndex: b.correctIndex, explanation: b.explanation }));

    return (
      <ExamMultiPart
        key={q.id}
        title={title}
        code={q.code}
        question={q.question}
        subItems={subItems}
        onSubmit={handleMultiPartSubmit}
        onBack={handleMultiPartBack}
      />
    );
  }

  // Empty state
  return (
    <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ color: '#64748b' }}>暂无可用题目，请等待题库更新。</p>
    </div>
  );
}
