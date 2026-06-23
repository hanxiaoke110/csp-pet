import { create } from 'zustand';
import { dualSave, dualLoad } from '../lib/persist';
import { usePetStore } from './petStore';

export interface ErrorRecord {
  questionId: string;
  wrongAnswer: number;
  correctAnswer: number;
  date: string;
  attempts: number;
}

export interface KpStats {
  [kp: string]: { correct: number; total: number };
}

export interface WeeklyKpResult {
  kp: string;
  correct: number;
  total: number;
}

export interface QuizState {
  errors: ErrorRecord[];
  // Knowledge point tracking
  kpStats: KpStats;
  lastKpResults: WeeklyKpResult[];
  // Weekly task
  weeklyTaskDone: number;
  weeklyTaskDate: string;
  weeklyCompletions: number;
  weeklyPerfects: number;
  extraChallengeDone: boolean;
  extraChallengeCount: number;
  // Monthly review
  lastReviewDate: string;
  lastReviewCorrect: number;
  lastReviewTotal: number;
  lastSuperDate: string;
  superCompletions: number;
  superBestScore: number;
  // Free practice stats
  totalPractice: number;
  totalCorrect: number;

  // CSP 真题训练
  examDailyDate: string;
  examDailyCompleted: { id: string; type: 'choice' | 'reading' | 'fillBlank' }[];
  examDailyClaimed: boolean;
  examDailyTotalAnswered: number;
  examDailyTotalCorrect: number;
  examGroup: 'J' | 'S' | null;

  addError: (questionId: string, wrongAnswer: number, correctAnswer: number, knowledgePoint?: string) => void;
  removeError: (questionId: string) => void;
  recordKpResults: (results: WeeklyKpResult[]) => void;
  resetMonthlyKpStats: () => void;
  getWeakPoints: (limit?: number) => { kp: string; rate: number; total: number }[];
  completeWeeklyTask: (perfect: boolean) => void;
  completeExtraChallenge: () => void;
  completeMonthlyReview: (correct?: number, total?: number) => void;
  completeSuperChallenge: (correct: number) => void;
  canDoSuperChallenge: () => boolean;
  superDaysLeft: () => number;
  canDoWeeklyTask: () => boolean;
  canDoExtraChallenge: () => boolean;
  canDoMonthlyReview: () => { allowed: boolean; reason: string };
  recordAnswer: (correct: boolean) => void;
  errorCount: () => number;
  load: () => Promise<void>;
  save: () => void;

  // CSP 真题训练方法
  completeExamQuestion: (questionId: string, type: 'choice' | 'reading' | 'fillBlank', isCorrect: boolean) => void;
  canClaimExamDaily: () => boolean;
  getExamDailyAccuracy: () => number;
  claimExamDailyReward: () => { exp: number; coins: number; bonusLabel: string } | null;
}

const STORAGE_KEY = 'csp_quiz_state';

function getWeekStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().slice(0, 10);
}

function getMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function getWeekKeyStr(): string {
  const d = new Date();
  const weekNum = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 604800000);
  return `${d.getFullYear()}-W${weekNum}`;
}

function isLastWeekOfMonth(): boolean {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const daysLeft = lastDay.getDate() - d.getDate();
  return daysLeft <= 6; // last 7 days of month
}

export const useQuizStore = create<QuizState>((set, get) => {
  return {
    errors: [],
    kpStats: {},
    lastKpResults: [],
    weeklyTaskDone: 0,
    weeklyTaskDate: getWeekStart(),
    weeklyCompletions: 0,
    weeklyPerfects: 0,
    extraChallengeDone: false,
    extraChallengeCount: 0,
    lastReviewDate: '',
    lastReviewCorrect: 0,
    lastReviewTotal: 0,
    lastSuperDate: '',
    superCompletions: 0,
    superBestScore: 0,
    totalPractice: 0,
    totalCorrect: 0,

    // CSP 真题训练
    examDailyDate: '',
    examDailyCompleted: [],
    examDailyClaimed: false,
    examDailyTotalAnswered: 0,
    examDailyTotalCorrect: 0,
    examGroup: null,

    addError: (questionId, wrongAnswer, correctAnswer, knowledgePoint) => {
      void (knowledgePoint); // kept for API compatibility, was used for remote report
      set(s => {
        const existing = s.errors.find(e => e.questionId === questionId);
        const updated = existing
          ? s.errors.map(e => e.questionId === questionId
            ? { ...e, wrongAnswer, attempts: e.attempts + 1, date: new Date().toISOString().slice(0, 10) }
            : e)
          : [...s.errors, { questionId, wrongAnswer, correctAnswer, date: new Date().toISOString().slice(0, 10), attempts: 1 }];
        return { errors: updated };
      });
      get().save();
    },

    recordKpResults: (results) => {
      set(s => {
        const stats = { ...s.kpStats };
        for (const r of results) {
          const existing = stats[r.kp] || { correct: 0, total: 0 };
          stats[r.kp] = {
            correct: existing.correct + r.correct,
            total: existing.total + r.total,
          };
        }
        return { kpStats: stats, lastKpResults: results };
      });
      get().save();
    },

    resetMonthlyKpStats: () => {
      set({ kpStats: {} });
      get().save();
    },

    getWeakPoints: (limit = 5) => {
      const stats = get().kpStats;
      return Object.entries(stats)
        .map(([kp, v]) => ({ kp, rate: v.total > 0 ? v.correct / v.total : 0, total: v.total }))
        .filter(w => w.total >= 2) // at least 2 attempts to be meaningful
        .sort((a, b) => a.rate - b.rate)
        .slice(0, limit);
    },

    removeError: (questionId) => {
      set(s => ({ errors: s.errors.filter(e => e.questionId !== questionId) }));
      get().save();
    },

    completeWeeklyTask: (perfect: boolean) => {
      set(s => ({
        weeklyTaskDone: 5,
        weeklyTaskDate: getWeekStart(),
        weeklyCompletions: s.weeklyCompletions + 1,
        weeklyPerfects: perfect ? s.weeklyPerfects + 1 : s.weeklyPerfects,
      }));
      get().save();
    },

    completeExtraChallenge: () => {
      set(s => ({ extraChallengeDone: true, extraChallengeCount: (s.extraChallengeCount || 0) + 1 }));
      get().save();
    },

    completeMonthlyReview: (correct?: number, total?: number) => {
      set(s => ({
        lastReviewDate: getMonthKey(),
        kpStats: {},
        lastReviewCorrect: correct ?? s.lastReviewCorrect,
        lastReviewTotal: total ?? s.lastReviewTotal,
      }));
      get().save();
    },

    completeSuperChallenge: (correct: number) => {
      const s = get();
      const completions = (s.superCompletions || 0) + 1;
      const best = Math.max(s.superBestScore || 0, correct);
      set({ lastSuperDate: getWeekKeyStr(), superCompletions: completions, superBestScore: best });
      get().save();
    },

    canDoSuperChallenge: () => {
      // Check if training camp is active (unlimited attempts)
      try {
        const petState = usePetStore.getState();
        if (petState.trainingCampActive && petState.trainingCampEndDate) {
          const end = new Date(petState.trainingCampEndDate).getTime();
          if (Date.now() < end) return true;
        }
      } catch {}
      return get().lastSuperDate !== getWeekKeyStr();
    },

    superDaysLeft: () => {
      const s = get();
      if (s.lastSuperDate === getWeekKeyStr()) return 0;
      if (!s.lastSuperDate) return 0;
      // Check if training camp is active (unlimited)
      try {
        const petState = usePetStore.getState();
        if (petState.trainingCampActive && petState.trainingCampEndDate) {
          const end = new Date(petState.trainingCampEndDate).getTime();
          if (Date.now() < end) return 0;
        }
      } catch {}
      // Calculate days until next week
      const wPart = s.lastSuperDate.split('-W')[1];
      const lastWeek = parseInt(wPart || '0');
      const now = new Date();
      const nowWeek = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000);
      if (nowWeek <= lastWeek) return 7 - (now.getDay() || 7);
      return 0;
    },

    canDoWeeklyTask: () => {
      const s = get();
      return !(s.weeklyTaskDone >= 5 && s.weeklyTaskDate === getWeekStart());
    },

    canDoExtraChallenge: () => {
      const s = get();
      return !s.extraChallengeDone && getWeekStart() === s.weeklyTaskDate && s.weeklyTaskDone >= 5;
    },

    canDoMonthlyReview: () => {
      const s = get();
      if (s.errors.length === 0) {
        return { allowed: false, reason: '暂无错题，真棒！' };
      }
      if (s.lastReviewDate === getMonthKey()) {
        return { allowed: false, reason: '本月已完成复盘，下月再来' };
      }
      // Condition 1: 2+ weekly completions
      if (s.weeklyCompletions >= 2) {
        return { allowed: true, reason: `已完成 ${s.weeklyCompletions} 次每周挑战，可以复盘！` };
      }
      // Condition 2: Last week of month
      if (isLastWeekOfMonth()) {
        return { allowed: true, reason: '月末最后一周，可以复盘！' };
      }
      return { allowed: false, reason: `完成 2 次每周挑战或等到月末最后一周可开启（当前已完成 ${s.weeklyCompletions} 次）` };
    },

    recordAnswer: (correct: boolean) => {
      set(s => ({
        totalPractice: (s.totalPractice || 0) + 1,
        totalCorrect: correct ? (s.totalCorrect || 0) + 1 : (s.totalCorrect || 0),
      }));
      get().save();
    },

    errorCount: () => get().errors.length,

    load: async () => {
      // Helper to parse and hydrate from raw JSON
      const hydrate = (raw: string | null) => {
        if (!raw) return;
        let data: any = {};
        try { data = JSON.parse(raw); } catch { return; }
        const today = getWeekStart();
        const todayDate = new Date().toISOString().slice(0, 10);
        const sameWeek = data.weeklyTaskDate === today;
        set({
          errors: data.errors || [],
          kpStats: data.kpStats || {},
          lastKpResults: data.lastKpResults || [],
          extraChallengeCount: data.extraChallengeCount || 0,
          lastReviewDate: data.lastReviewDate || '',
          lastReviewCorrect: data.lastReviewCorrect || 0,
          lastReviewTotal: data.lastReviewTotal || 0,
          lastSuperDate: data.lastSuperDate || '',
          superCompletions: data.superCompletions || 0,
          superBestScore: data.superBestScore || 0,
          totalPractice: data.totalPractice || 0,
          totalCorrect: data.totalCorrect || 0,
          weeklyCompletions: data.weeklyCompletions || 0,
          weeklyPerfects: data.weeklyPerfects || 0,
          weeklyTaskDone: sameWeek ? (data.weeklyTaskDone || 0) : 0,
          weeklyTaskDate: sameWeek ? (data.weeklyTaskDate || today) : today,
          extraChallengeDone: sameWeek ? (data.extraChallengeDone || false) : false,
          // CSP 真题训练 — 每日重置（日期格式 YYYY-MM-DD，与现有 stores 一致）
          examDailyDate: data.examDailyDate || todayDate,
          examDailyCompleted: data.examDailyDate === todayDate ? (data.examDailyCompleted || []) : [],
          examDailyClaimed: data.examDailyDate === todayDate ? (data.examDailyClaimed || false) : false,
          examDailyTotalAnswered: data.examDailyDate === todayDate ? (data.examDailyTotalAnswered || 0) : 0,
          examDailyTotalCorrect: data.examDailyDate === todayDate ? (data.examDailyTotalCorrect || 0) : 0,
          examGroup: data.examGroup || null,
        });
      };

      const raw = await dualLoad('quiz_state', STORAGE_KEY);
      if (raw) { hydrate(raw); return; }
    },

    save: () => {
      try {
        const s = get();
        const json = JSON.stringify({
          errors: s.errors,
          kpStats: s.kpStats,
          lastKpResults: s.lastKpResults,
          extraChallengeCount: s.extraChallengeCount,
          lastReviewDate: s.lastReviewDate,
          lastReviewCorrect: s.lastReviewCorrect,
          lastReviewTotal: s.lastReviewTotal,
          lastSuperDate: s.lastSuperDate,
          superCompletions: s.superCompletions,
          superBestScore: s.superBestScore,
          totalPractice: s.totalPractice,
          totalCorrect: s.totalCorrect,
          weeklyCompletions: s.weeklyCompletions,
          weeklyPerfects: s.weeklyPerfects,
          weeklyTaskDone: s.weeklyTaskDone,
          weeklyTaskDate: s.weeklyTaskDate,
          extraChallengeDone: s.extraChallengeDone,
          examDailyDate: s.examDailyDate,
          examDailyCompleted: s.examDailyCompleted,
          examDailyClaimed: s.examDailyClaimed,
          examDailyTotalAnswered: s.examDailyTotalAnswered,
          examDailyTotalCorrect: s.examDailyTotalCorrect,
          examGroup: s.examGroup,
        });
        dualSave('quiz_state', STORAGE_KEY, json);
      } catch { /* quota exceeded or filesystem error */ }
    },

    // CSP 真题训练方法
    completeExamQuestion: (questionId, type, isCorrect) => {
      const s = get();
      const todayDate = new Date().toISOString().slice(0, 10);
      // Ensure examDailyDate is set to today
      if (s.examDailyDate !== todayDate) {
        set({ examDailyDate: todayDate, examDailyCompleted: [], examDailyClaimed: false, examDailyTotalAnswered: 0, examDailyTotalCorrect: 0 });
      }
      // Re-read state after potential date reset (avoid stale snapshot)
      const current = get();
      // Check duplicate BEFORE incrementing counters
      if (isCorrect && current.examDailyCompleted.some(r => r.id === questionId)) return;
      // Increment counters
      set(state => ({
        examDailyDate: todayDate,
        examDailyTotalAnswered: state.examDailyTotalAnswered + 1,
        examDailyTotalCorrect: state.examDailyTotalCorrect + (isCorrect ? 1 : 0),
      }));
      if (!isCorrect) {
        s.recordAnswer(false);
        return;
      }
      // 答对：加入 examDailyCompleted
      set(state => ({
        examDailyCompleted: [...state.examDailyCompleted, { id: questionId, type }],
      }));
      s.recordAnswer(true);
      // 每 2 题 tick hunger (第2,4,6...次提交时)
      const newLen = get().examDailyCompleted.length;
      if (newLen > 0 && newLen % 2 === 0) {
        try { usePetStore.getState().tickHunger(); } catch {}
      }
      get().save();
    },

    canClaimExamDaily: () => {
      const s = get();
      if (s.examDailyClaimed) return false;
      let choiceCount = 0, hasReadingOrFill = false;
      for (const r of s.examDailyCompleted) {
        if (r.type === 'choice') choiceCount++;
        else hasReadingOrFill = true;
      }
      return choiceCount >= 3 && hasReadingOrFill;
    },

    getExamDailyAccuracy: () => {
      const s = get();
      if (s.examDailyTotalAnswered === 0) return 0;
      return s.examDailyTotalCorrect / s.examDailyTotalAnswered;
    },

    claimExamDailyReward: () => {
      const s = get();
      if (s.examDailyClaimed) return null;
      if (!s.canClaimExamDaily()) return null;
      // 计算正确率加成
      const accuracy = s.getExamDailyAccuracy();
      let bonusExp = 0, bonusCoins = 0, bonusLabel = '';
      if (accuracy >= 1.0) {
        bonusExp = 20; bonusCoins = 10; bonusLabel = '👑 全部正确！完美通关！';
      } else if (accuracy >= 0.8) {
        bonusExp = 10; bonusCoins = 5; bonusLabel = '🌟 正确率优秀！';
      }
      // 先设 guard flag
      set({ examDailyClaimed: true });
      // 发奖励
      const totalExp = 20 + bonusExp;
      const totalCoins = 12 + bonusCoins;
      const petStore = usePetStore.getState();
      const activePetId = petStore.activePetId;
      if (activePetId) petStore.addExp(activePetId, totalExp);
      const mult = petStore.getRewardMultiplier();
      petStore.addCoins(Math.floor(totalCoins * mult));
      get().save();
      return { exp: totalExp, coins: totalCoins, bonusLabel };
    },
  };
});
