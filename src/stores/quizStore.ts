import { create } from 'zustand';

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

  addError: (questionId: string, wrongAnswer: number, correctAnswer: number) => void;
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
  errorCount: () => number;
  load: () => void;
  save: () => void;
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

function getBiWeekKey(): string {
  const d = new Date();
  const weekNum = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 604800000);
  return `${d.getFullYear()}-W${Math.floor(weekNum / 2)}`;
}

function isLastWeekOfMonth(): boolean {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const daysLeft = lastDay.getDate() - d.getDate();
  return daysLeft <= 6; // last 7 days of month
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      // Fall back to temp backup (crash recovery)
      const tmp = localStorage.getItem(STORAGE_KEY + '_tmp');
      if (tmp) {
        localStorage.setItem(STORAGE_KEY, tmp);
        localStorage.removeItem(STORAGE_KEY + '_tmp');
        return JSON.parse(tmp);
      }
      return {};
    }
    return JSON.parse(saved);
  } catch {
    // JSON corrupted — try temp backup
    try {
      const tmp = localStorage.getItem(STORAGE_KEY + '_tmp');
      if (tmp) {
        const data = JSON.parse(tmp);
        localStorage.setItem(STORAGE_KEY, tmp);
        localStorage.removeItem(STORAGE_KEY + '_tmp');
        return data;
      }
    } catch { /* unrecoverable */ }
    return {};
  }
}

export const useQuizStore = create<QuizState>((set, get) => {
  const initial = loadState();

  return {
    errors: initial.errors || [],
    kpStats: initial.kpStats || {},
    lastKpResults: [],
    weeklyTaskDone: initial.weeklyTaskDate === getWeekStart() ? (initial.weeklyTaskDone || 0) : 0,
    weeklyTaskDate: initial.weeklyTaskDate || getWeekStart(),
    weeklyCompletions: initial.weeklyCompletions || 0,
    weeklyPerfects: initial.weeklyPerfects || 0,
    extraChallengeDone: initial.weeklyTaskDate === getWeekStart() ? (initial.extraChallengeDone || false) : false,
    extraChallengeCount: initial.extraChallengeCount || 0,
    lastReviewDate: initial.lastReviewDate || '',
    lastReviewCorrect: initial.lastReviewCorrect || 0,
    lastReviewTotal: initial.lastReviewTotal || 0,
    lastSuperDate: initial.lastSuperDate || '',
    superCompletions: initial.superCompletions || 0,
    superBestScore: initial.superBestScore || 0,
    totalPractice: initial.totalPractice || 0,
    totalCorrect: initial.totalCorrect || 0,

    addError: (questionId, wrongAnswer, correctAnswer) => {
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
      set({ lastSuperDate: getBiWeekKey(), superCompletions: completions, superBestScore: best });
      get().save();
    },

    canDoSuperChallenge: () => {
      return get().lastSuperDate !== getBiWeekKey();
    },

    superDaysLeft: () => {
      const s = get();
      if (s.lastSuperDate === getBiWeekKey()) return 0;
      if (!s.lastSuperDate) return 0;
      // Calculate days until next bi-week
      const wPart = s.lastSuperDate.split('-W')[1];
      const lastWeek = parseInt(wPart || '0');
      const now = new Date();
      const weekNum = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000);
      const targetWeek = (lastWeek + 1) * 2;
      const weeksLeft = targetWeek - weekNum;
      return Math.max(0, Math.ceil(weeksLeft * 7));
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

    errorCount: () => get().errors.length,

    load: () => {
      const data = loadState();
      const today = getWeekStart();
      const sameWeek = data.weeklyTaskDate === today;
      set({
        errors: data.errors || [],
        kpStats: data.kpStats || {},
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
      });
    },

    save: () => {
      try {
        const s = get();
        const json = JSON.stringify({
          errors: s.errors,
          kpStats: s.kpStats,
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
        });
        // Write to temp key first, then swap — reduces corruption risk on crash
        localStorage.setItem(STORAGE_KEY + '_tmp', json);
        localStorage.setItem(STORAGE_KEY, json);
        localStorage.removeItem(STORAGE_KEY + '_tmp');
      } catch { /* quota exceeded or filesystem error */ }
    },
  };
});
