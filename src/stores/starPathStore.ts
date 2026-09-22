import { create } from 'zustand';
import { usePetStore } from './petStore';
import type { StarPathMetrics, StarPathTask } from '../types/starPath';

export const STAR_PATH_PROGRESS_KEY = 'csp_star_path_progress_v1';
export const STAR_PATH_WELCOME_REWARD = { coins: 200, exp: 100, basicFoods: 2 } as const;

interface StarPathSave {
  schemaVersion: 1;
  claimedTaskIds: string[];
  welcomeClaimed: boolean;
}

interface StarPathState extends StarPathSave {
  claimTask: (task: StarPathTask, progress: number) => { ok: boolean; message: string };
  claimWelcomeReward: () => { ok: boolean; message: string };
}

function readSave(): StarPathSave {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAR_PATH_PROGRESS_KEY) || 'null') as Partial<StarPathSave> | null;
    return {
      schemaVersion: 1,
      claimedTaskIds: Array.isArray(parsed?.claimedTaskIds)
        ? [...new Set(parsed.claimedTaskIds.filter(id => typeof id === 'string'))]
        : [],
      welcomeClaimed: parsed?.welcomeClaimed === true,
    };
  } catch {
    return { schemaVersion: 1, claimedTaskIds: [], welcomeClaimed: false };
  }
}

function persist(save: StarPathSave): void {
  try { localStorage.setItem(STAR_PATH_PROGRESS_KEY, JSON.stringify(save)); } catch {}
}

function grantReward(coins: number, exp: number, basicFoods = 0): void {
  const store = usePetStore.getState();
  if (coins > 0 || basicFoods > 0) {
    usePetStore.setState(state => ({
      coins: state.coins + coins,
      maxCoinBalance: Math.max(state.maxCoinBalance || 0, state.coins + coins),
      foods: basicFoods > 0
        ? { ...state.foods, basic: (state.foods.basic || 0) + basicFoods }
        : state.foods,
    }));
  }
  if (exp > 0) {
    if (store.activePetId) usePetStore.getState().addExp(store.activePetId, exp);
    else usePetStore.getState().addExpToPool(exp);
  } else {
    usePetStore.getState().save();
  }
}

const initial = readSave();
export const useStarPathStore = create<StarPathState>((set, get) => ({
  ...initial,
  claimTask: (task, progress) => {
    if (!usePetStore.getState().loaded) return { ok: false, message: '正在恢复智子资料，请稍后再领取' };
    if (get().claimedTaskIds.includes(task.id)) return { ok: false, message: '这份奖励已经领取过了' };
    if (progress < task.target) return { ok: false, message: '还差一点，进度会一直保留' };
    const next = [...get().claimedTaskIds, task.id];
    set({ claimedTaskIds: next });
    persist({ schemaVersion: 1, claimedTaskIds: next, welcomeClaimed: get().welcomeClaimed });
    grantReward(task.reward.coins, task.reward.exp);
    return { ok: true, message: `收下 ${task.reward.coins} 金币和 ${task.reward.exp} 经验` };
  },
  claimWelcomeReward: () => {
    if (!usePetStore.getState().loaded) return { ok: false, message: '正在恢复智子资料，请稍后再领取' };
    if (get().welcomeClaimed) return { ok: false, message: '焕新礼已经领取过了' };
    set({ welcomeClaimed: true });
    persist({ schemaVersion: 1, claimedTaskIds: get().claimedTaskIds, welcomeClaimed: true });
    grantReward(STAR_PATH_WELCOME_REWARD.coins, STAR_PATH_WELCOME_REWARD.exp, STAR_PATH_WELCOME_REWARD.basicFoods);
    return { ok: true, message: '学习区焕新礼已收下！' };
  },
}));

type ExplorationSave = {
  schemaVersion?: number;
  maps?: Record<string, { sealsSolved?: number; completed?: boolean }>;
  sealsSolved?: number;
  completed?: boolean;
};

function readExplorationMetrics(): Pick<StarPathMetrics, 'mazeSeals' | 'mazeClears'> {
  try {
    const parsed = JSON.parse(localStorage.getItem('csp_dungeon_exploration_v1') || 'null') as ExplorationSave | null;
    const maps = parsed?.maps ? Object.values(parsed.maps) : parsed ? [parsed] : [];
    return {
      mazeSeals: maps.reduce((sum, item) => sum + Math.max(0, Number(item.sealsSolved) || 0), 0),
      mazeClears: maps.filter(item => item.completed).length,
    };
  } catch { return { mazeSeals: 0, mazeClears: 0 }; }
}

function readTrialStages(): number {
  try {
    const parsed = JSON.parse(localStorage.getItem('dungeon_progress') || '[]') as Array<{ completedStages?: number }>;
    return Array.isArray(parsed)
      ? parsed.reduce((sum, item) => sum + Math.max(0, Number(item.completedStages) || 0), 0)
      : 0;
  } catch { return 0; }
}

export function collectStarPathMetrics(quiz: {
  totalCorrect?: number;
  totalPractice?: number;
  weeklyCompletions?: number;
  superCompletions?: number;
}): StarPathMetrics {
  const exploration = readExplorationMetrics();
  return {
    quizCorrect: Math.max(0, Number(quiz.totalCorrect) || 0),
    quizAnswered: Math.max(0, Number(quiz.totalPractice) || 0),
    weeklyChallenges: Math.max(0, Number(quiz.weeklyCompletions) || 0),
    superChallenges: Math.max(0, Number(quiz.superCompletions) || 0),
    mazeSeals: exploration.mazeSeals,
    mazeClears: exploration.mazeClears,
    trialStages: readTrialStages(),
  };
}
