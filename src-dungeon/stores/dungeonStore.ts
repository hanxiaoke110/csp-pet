// 潜龙闭关 — 核心状态管理
import { create } from 'zustand';
import { usePetStore } from '../../src/stores/petStore';
import type {
  PlayerState, DungeonProgress, DungeonDefinition, Question,
  BattleState, BadgeDefinition, DailyTasks, School, TrialInventory,
} from '../types/dungeon';
import {
  applySchoolClearPassive,
  getLevelFromExp,
  getRankTier, expToNextLevel,
  FIRST_CLEAR_MULTIPLIER,
  BOSS_CLEAR_EXP, BOSS_CLEAR_GOLD, STAGE_CLEAR_EXP, STAGE_CLEAR_GOLD,
} from '../utils/gameLogic';

// ── Week start helper ──
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

// ── Local date string (YYYY-MM-DD)，用于流派被动每日上限的跨日重置 ──
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PET_COIN_DAILY_LIMIT = 30;
const PET_COIN_WEEKLY_LIMIT = 150;

function defaultTrialInventory(): TrialInventory {
  return { hintTickets: 0, healingPotions: 0, ownedCosmetics: [], equippedTitle: null, equippedAvatarFrame: null };
}

// ── Default player ──
function defaultPlayer(): PlayerState {
  return {
    deviceHash: '',
    classCode: '',
    displayName: '',
    realName: '',
    phone: '',
    status: 'active',
    school: 'cultivation',
    rankTier: 1,
    rankPoints: 0,
    playerLevel: 1,
    exp: 0,
    expToNext: 100,
    gold: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    currentStreak: 0,
    maxStreak: 0,
    loginStreak: 0,
    lastLoginDate: '',
    season: '2026-autumn',
  };
}

// ── Store interface ──
interface DungeonState {
  // Data
  player: PlayerState;
  dungeons: DungeonDefinition[];
  dungeonProgress: DungeonProgress[];
  questionBank: Question[];
  questionMapping: Record<string, Record<string, string[]>>;
  badges: BadgeDefinition[];
  earnedBadges: string[];
  dailyTasks: DailyTasks;

  // Battle
  battle: BattleState | null;
  // 上一场战斗的结算快照（finalizeBattle 写入，RewardScreen 读取展示）
  lastBattleResult: BattleState | null;
  weakPoints: Record<string, number>;     // knowledgePoint → errorCount
  mistakeNotebook: string[];              // question IDs that were answered wrong
  healing: { knowledgePoint: string; requiredCorrect: number; currentCorrect: number } | null;
  view: 'title' | 'register' | 'map' | 'dungeon-preview' | 'battle' | 'boss' | 'reward' | 'profile' | 'leaderboard' | 'hall-of-fame';
  loading: boolean;
  error: string | null;

  // Weekly challenge limit
  weeklyChallenges: {
    used: number;
    limit: number;
    resetAt: string; // ISO 周一开始
  };
  currentBattleEarnsRewards: boolean;
  // 流派被动每日触发上限：轻量乘数被动每日最多触发 N 次，防刷 EXP（金币/段位已由 weeklyChallenges 间接限制）
  schoolPassiveDaily: {
    used: number;
    limit: number;
    resetAt: string; // YYYY-MM-DD 本地日期
  };
  petCoinRewards: { dailyDate: string; dailyGranted: number; weekStart: string; weeklyGranted: number };
  trialInventory: TrialInventory;

  // Actions
  setView: (v: DungeonState['view']) => void;
  setLoading: (l: boolean) => void;
  setError: (e: string | null) => void;

  // Player
  initPlayer: (data: Partial<PlayerState>) => void;
  setSchool: (school: School) => void;
  setClassCode: (classCode: string) => void;
  addExp: (amount: number) => void;
  addGold: (amount: number) => void;
  spendGold: (amount: number) => boolean;
  addRankPoints: (amount: number) => void;
  checkRankUp: () => { upgraded: boolean; newTier: number } | null;
  recordAnswer: (correct: boolean) => void;

  // Dungeon
  initDungeons: (dungeons: DungeonDefinition[]) => void;
  initProgress: (progress: DungeonProgress[]) => void;
  setQuestionBank: (bank: Question[]) => void;
  setQuestionMapping: (mapping: Record<string, Record<string, string[]>>) => void;
  getDungeonProgress: (dungeonId: string) => DungeonProgress | undefined;
  isDungeonUnlocked: (dungeonId: string) => boolean;

  // Battle
  finishBattle: () => BattleState | null;
  // 在战斗结束瞬间结算：发通关奖励 + 更新进度 + 首通标记 + 徽章 + 存档 + 服务端同步。
  // 返回结算前的 battle 快照供 RewardScreen 展示（battle 随后被清空）。
  finalizeBattle: (dungeonId: string, isBoss: boolean) => BattleState | null;

  // First-clear tracking
  _firstClears: Record<string, boolean>;

  // Badges
  checkAndAwardBadges: () => string[];

  // Weekly challenge limit
  canEarnRewards: () => boolean;
  useChallenge: () => void;
  buyRewardChallenge: () => boolean;

  // Weak points & healing
  addWeakPoint: (kp: string) => void;
  removeWeakPoint: (kp: string) => void;
  addToMistakeNotebook: (questionId: string) => void;
  startHealing: (kp: string) => void;
  recordHealingAnswer: (correct: boolean) => boolean;
  clearHealing: () => void;
  getWeakPointsAboveThreshold: (threshold: number) => string[];
  // 流派被动每日上限：未达上限则计数+1 并返回 true（允许触发被动），达上限返回 false（只发基础奖励）
  bumpSchoolPassiveDaily: () => boolean;
  grantPetCoins: (amount: number) => { granted: number; dailyRemaining: number; weeklyRemaining: number };
  buyTrialItem: (itemId: 'hint-ticket' | 'healing-potion' | 'title-data-scout' | 'frame-crystal') => boolean;
  consumeTrialItem: (itemId: 'hint-ticket' | 'healing-potion') => boolean;
  equipTrialCosmetic: (itemId: 'title-data-scout' | 'frame-crystal') => void;

  // Persistence
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => boolean;
}

export const useDungeonStore = create<DungeonState>((set, get) => ({
  player: defaultPlayer(),
  dungeons: [],
  dungeonProgress: [],
  questionBank: [],
  questionMapping: {},
  badges: [],
  earnedBadges: [],
  dailyTasks: { date: '', questionsDone: 0, stagesCleared: 0, bossesDefeated: 0, allDone: false, claimed: false },
  battle: null,
  lastBattleResult: null,
  weakPoints: {},
  mistakeNotebook: [],
  healing: null,
  view: 'title',
  loading: true,
  error: null,
  weeklyChallenges: { used: 0, limit: 5, resetAt: '' },
  currentBattleEarnsRewards: true,
  schoolPassiveDaily: { used: 0, limit: 50, resetAt: '' },
  petCoinRewards: { dailyDate: '', dailyGranted: 0, weekStart: '', weeklyGranted: 0 },
  trialInventory: defaultTrialInventory(),
  // Track if this dungeon has been cleared before (for first-clear bonus)
  _firstClears: {} as Record<string, boolean>,

  setView: (v) => set({ view: v }),
  setLoading: (l) => set({ loading: l }),
  setError: (e) => set({ error: e }),

  initPlayer: (data) => set((s) => {
    // Normalize snake_case (from server) to camelCase (client)
    // 服务端现在通过 report-battle 同步了等级/段位/连胜/金币/统计，是权威来源（防刷）。
    // 登录时用服务端值恢复；仅当服务端字段缺失时回退客户端值（兼容旧数据）。
    const srv = (k1: string, k2: string) => (data as any)[k1] ?? (data as any)[k2] ?? (data as any)[k2.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
    const p: PlayerState = {
      ...s.player,
      deviceHash: srv('device_hash', 'deviceHash') || s.player.deviceHash,
      classCode: srv('class_code', 'classCode') || s.player.classCode,
      displayName: srv('display_name', 'displayName') || s.player.displayName,
      realName: srv('real_name', 'realName') || s.player.realName,
      phone: srv('phone', 'phone') || s.player.phone,
      status: srv('status', 'status') || s.player.status,
      school: srv('school', 'school') || s.player.school,
      rankTier: srv('rank_tier', 'rankTier') || s.player.rankTier,
      rankPoints: srv('rank_points', 'rankPoints') || s.player.rankPoints,
      playerLevel: srv('player_level', 'playerLevel') || s.player.playerLevel,
      exp: srv('exp', 'exp') || s.player.exp,
      // 金币/统计以服务端为准（防刷权威）
      gold: srv('gold', 'gold') ?? s.player.gold,
      totalAnswered: srv('total_answered', 'totalAnswered') ?? s.player.totalAnswered,
      totalCorrect: srv('total_correct', 'totalCorrect') ?? s.player.totalCorrect,
      currentStreak: srv('current_streak', 'currentStreak') || s.player.currentStreak,
      maxStreak: srv('max_streak', 'maxStreak') || s.player.maxStreak,
      loginStreak: srv('login_streak', 'loginStreak') || s.player.loginStreak,
      lastLoginDate: srv('last_login_date', 'lastLoginDate') || s.player.lastLoginDate,
      season: srv('season', 'season') || s.player.season,
      expToNext: expToNextLevel(srv('player_level', 'playerLevel') || s.player.playerLevel),
    };
    return { player: p };
  }),

  setSchool: (school) => set((s) => ({ player: { ...s.player, school } })),

  // 换班级码时调用：仅更新本地 classCode 字段并存档，进度/金币/段位全部保留（数据按 device_hash 继承）。
  // 服务端 class_code + teacher_id 由 syncProgress 同步（sync 端点已支持 class_code 白名单）。
  setClassCode: (classCode) => set((s) => ({ player: { ...s.player, classCode } })),

  addExp: (amount) => set((s) => {
    // 重建总累积经验：s.player.exp 是「当前等级内的经验」，但 getLevelFromExp 期望从 1 级起的总经验。
    // 必须先加上前面所有等级的门槛，否则每次 addExp 都会掉级（#bug-2026-07-10）。
    let totalExp = (s.player.exp || 0);
    for (let lv = 1; lv < (s.player.playerLevel || 1); lv++) {
      totalExp += expToNextLevel(lv);
    }
    totalExp += amount;
    const { level, exp, expToNext } = getLevelFromExp(totalExp);
    return { player: { ...s.player, playerLevel: level, exp, expToNext } };
  }),

  addGold: (amount) => set((s) => ({
    player: { ...s.player, gold: s.player.gold + amount }
  })),

  spendGold: (amount) => {
    const cost = Math.max(0, amount || 0);
    const { player } = get();
    if (player.gold < cost) return false;
    set((s) => ({ player: { ...s.player, gold: s.player.gold - cost } }));
    get().saveToLocalStorage();
    return true;
  },

  addRankPoints: (amount) => set((s) => ({
    player: { ...s.player, rankPoints: s.player.rankPoints + amount }
  })),

  checkRankUp: () => {
    const { player } = get();
    const newTier = getRankTier(player.rankPoints);
    if (newTier > player.rankTier) {
      set((s) => ({ player: { ...s.player, rankTier: newTier } }));
      return { upgraded: true, newTier };
    }
    return null;
  },

  recordAnswer: (correct) => set((s) => {
    const p = s.player;
    const newStreak = correct ? p.currentStreak + 1 : 0;
    return {
      player: {
        ...p,
        totalAnswered: p.totalAnswered + 1,
        totalCorrect: correct ? p.totalCorrect + 1 : p.totalCorrect,
        currentStreak: newStreak,
        maxStreak: Math.max(p.maxStreak, newStreak),
      }
    };
  }),

  initDungeons: (dungeons) => set({ dungeons }),
  initProgress: (progress) => set({ dungeonProgress: progress }),
  setQuestionBank: (bank) => set({ questionBank: bank }),
  setQuestionMapping: (mapping) => set({ questionMapping: mapping }),

  getDungeonProgress: (dungeonId) => {
    const { dungeonProgress } = get();
    return dungeonProgress.find(dp => dp.dungeonId === dungeonId);
  },

  isDungeonUnlocked: (dungeonId) => {
    const { dungeons, dungeonProgress, player } = get();
    const dungeon = dungeons.find(d => d.id === dungeonId);
    if (!dungeon) return false;

    // Check level requirement
    if (player.playerLevel < dungeon.unlockLevel) return false;

    // No requirement = always unlocked
    if (!dungeon.requiredDungeon) return true;

    // Check required dungeon is cleared
    const reqProgress = dungeonProgress.find(dp => dp.dungeonId === dungeon.requiredDungeon);
    return reqProgress?.status === 'cleared';
  },

  finalizeBattle: (dungeonId, isBoss) => {
    const { battle } = get();
    if (!battle) return null;
    // 保留结算前快照供 RewardScreen 展示
    const snapshot = { ...battle };

    // 1. 通关奖励（首通倍率）——同步累加到快照，避免结算页少报
    if (battle.isWon) {
      const isFirstClear = !get()._firstClears[dungeonId];
      const mult = isFirstClear ? FIRST_CLEAR_MULTIPLIER : 1;
      const earnsRewards = get().currentBattleEarnsRewards;
      let clearExp = 0;
      let clearGold = 0;
      if (isBoss) {
        clearExp = earnsRewards ? BOSS_CLEAR_EXP * mult : 0;
        clearGold = earnsRewards ? BOSS_CLEAR_GOLD * mult : 0;
      } else {
        clearExp = earnsRewards ? STAGE_CLEAR_EXP * mult : 0;
        clearGold = earnsRewards ? STAGE_CLEAR_GOLD * mult : 0;
      }
      const schoolReward = applySchoolClearPassive(get().player.school, { exp: clearExp, gold: clearGold });
      clearExp = schoolReward.exp;
      clearGold = schoolReward.gold;
      if (clearExp > 0) get().addExp(clearExp);
      if (clearGold > 0) get().addGold(clearGold);
      snapshot.expEarned += clearExp;
      snapshot.goldEarned += clearGold;
      if (isFirstClear) {
        set((s) => ({ _firstClears: { ...s._firstClears, [dungeonId]: true } }));
      }
      // 内部金币用于试炼补给；桌宠金币按固定额度结算并受日/周上限限制，避免重复刷关破坏主商城平衡。
      const petCoinBase = isBoss ? 12 : 5;
      const petCoinFirstClearBonus = isFirstClear ? (isBoss ? 8 : 3) : 0;
      const petCoinReward = get().grantPetCoins(earnsRewards ? petCoinBase + petCoinFirstClearBonus : 0);
      snapshot.petCoinsEarned = petCoinReward.granted;
      snapshot.petCoinsDailyRemaining = petCoinReward.dailyRemaining;
      snapshot.petCoinsWeeklyRemaining = petCoinReward.weeklyRemaining;
    }

    // 2. 更新副本进度（在徽章检查之前，避免读 stale progress）
    if (battle.isWon) {
      set((s) => {
        const progress = s.dungeonProgress;
        const dp = progress.find(p => p.dungeonId === dungeonId);
        if (!dp) return {};
        const newProgress = progress.map(p => {
          if (p.dungeonId !== dungeonId) return p;
          const ratingOrder: Record<string, number> = { 'SS': 5, 'S': 4, 'A': 3, 'B': 2, 'C': 1, 'D': 0 };
          const bestRating = (ratingOrder[battle.rating] || 0) > (ratingOrder[p.bestRating] || 0)
            ? battle.rating
            : p.bestRating;
          if (isBoss) {
            return { ...p, bossDefeated: true, bestScore: Math.max(p.bestScore, battle.correctCount), bestRating };
          }
          const stageIndex = Math.max(0, Number((battle.stageId.match(/stage-0(\d)$/) || [])[1] || p.completedStages + 1) - 1);
          const newCompleted = Math.min(Math.max(p.completedStages, stageIndex + 1), p.totalStages);
          const allStagesDone = newCompleted >= p.totalStages;
          const status: DungeonProgress['status'] = allStagesDone ? 'cleared' : 'in_progress';
          return { ...p, completedStages: newCompleted, status, bestScore: Math.max(p.bestScore, battle.correctCount), bestRating };
        });
        return { dungeonProgress: newProgress };
      });
    }

    // 3. 段位重算 + 徽章检查（此时 progress 已更新）
    get().checkRankUp();
    get().checkAndAwardBadges();
    get().saveToLocalStorage();

    // 4. 服务端同步：仅胜利时上报（失败不上报，省 D1 写次数；失败不影响排行榜/进度/金币）。
    //    胜利才 sync 当前副本进度（通关状态变化时才写，普通关打完不写）。
    const stageIdForReport = battle.stageId;
    const totalAnswered = battle.correctCount + battle.wrongCount;
    if (battle.isWon) {
      const s0 = get();
      import('../utils/api').then(({ reportBattle, syncProgress }) => {
        if (s0.currentBattleEarnsRewards) {
          reportBattle({
            dungeon_id: dungeonId,
            stage_id: stageIdForReport,
            is_win: true,
            rating: battle.rating,
            questions_answered: totalAnswered,
            correct_count: battle.correctCount,
            // 同步客户端权威字段到服务端（供跨设备登录恢复）
            player_level: s0.player.playerLevel,
            exp: s0.player.exp,
            rank_tier: s0.player.rankTier,
            rank_points: s0.player.rankPoints,
            current_streak: s0.player.currentStreak,
            max_streak: s0.player.maxStreak,
          }).catch(() => {});
        }
        const s = get();
        // 仅同步本场副本的进度（report-battle 已在服务端推进通关状态，这里只补 best_score/best_rating）
        const changedDp = s.dungeonProgress.find(dp => dp.dungeonId === dungeonId);
        syncProgress({
          display_name: s.player.displayName,
          school: s.player.school,
          dungeon_progress: changedDp ? [{
            dungeonId: changedDp.dungeonId, status: changedDp.status, completedStages: changedDp.completedStages,
            totalStages: changedDp.totalStages, bossDefeated: changedDp.bossDefeated,
            bestScore: changedDp.bestScore, bestRating: changedDp.bestRating,
          }] : [],
        }).catch(() => {});
      });
    }

    // 5. Web 端专属宠物经验写回（仅 Web 端生效，零后端写入；桌面端 webPet 为空自动跳过）
    if (snapshot.expEarned > 0) {
      import('../utils/webPet').then(({ loadWebPet, saveWebPet }) => {
        const webPet = loadWebPet();
        if (!webPet) return;
        let level = webPet.level;
        let remaining = (webPet.exp || 0) + snapshot.expEarned;
        let expToNext = webPet.expToNext || 100;
        while (remaining >= expToNext && level < 20) {
          remaining -= expToNext;
          level += 1;
          expToNext = Math.floor(expToNext * 1.3);
        }
        saveWebPet({ ...webPet, level, exp: remaining, expToNext });
      }).catch(() => {});
    }

    // 6. 清空 battle，保留结算快照供 RewardScreen 展示（结算已落地，关窗不再丢失）
    set({ battle: null, lastBattleResult: snapshot, currentBattleEarnsRewards: true });
    return snapshot;
  },

  finishBattle: () => {
    // 兼容旧调用：仅清空 battle。结算已由 finalizeBattle 完成。
    const { battle } = get();
    set({ battle: null, currentBattleEarnsRewards: true });
    return battle;
  },

  checkAndAwardBadges: () => {
    // Simplified client-side badge check
    const { player, dungeonProgress } = get();
    const ctx = {
      totalCorrect: player.totalCorrect,
      totalAnswered: player.totalAnswered,
      maxStreak: player.maxStreak,
      currentStreak: player.currentStreak,
      clearedDungeons: dungeonProgress.filter(d => d.status === 'cleared').length,
      perfectDungeons: dungeonProgress.filter(d => d.bestRating === 'SS' || d.bestRating === 'S').length,
      bossScores: dungeonProgress
        .filter(d => d.bossDefeated)
        .map(d => ({ dungeonId: d.dungeonId, rating: d.bestRating || 'A', time: 0 })),
      playerLevel: player.playerLevel,
      rankTier: player.rankTier,
      loginStreak: player.loginStreak,
      gold: player.gold,
    };

    // Dynamic import to avoid circular dependency
    const newBadges: string[] = [];
    const { earnedBadges } = get();

    // Simple inline checks for common badges
    const check = (id: string, condition: boolean) => {
      if (condition && !earnedBadges.includes(id)) newBadges.push(id);
    };

    check('first_blood', ctx.totalAnswered >= 1);
    check('apprentice', ctx.totalAnswered >= 10);
    check('marathon', ctx.totalAnswered >= 100);
    check('sharpshooter', ctx.maxStreak >= 10);
    check('combo_master', ctx.maxStreak >= 30);
    check('unstoppable', ctx.maxStreak >= 50);
    check('perfectionist', ctx.totalAnswered >= 50 && ctx.totalCorrect / ctx.totalAnswered >= 0.95);
    check('first_clear', ctx.clearedDungeons >= 1);
    check('dungeon_crawler', ctx.clearedDungeons >= 3);
    check('dungeon_master', ctx.clearedDungeons >= 6);
    check('all_clear', ctx.clearedDungeons >= 8);
    check('speed_demon', ctx.bossScores.filter(b => b.rating === 'SS').length >= 1);
    check('time_lord', ctx.bossScores.filter(b => b.rating === 'SS').length >= 3);
    check('flawless', ctx.perfectDungeons >= 1);
    check('immortal_dragon', ctx.perfectDungeons >= 3);
    check('supreme_dragon', ctx.perfectDungeons >= 8);
    check('rising_star', ctx.rankTier >= 3);
    check('dragon_warrior', ctx.rankTier >= 5);
    check('dragon_lord', ctx.rankTier >= 7);
    check('dragon_god', ctx.rankTier >= 8);
    check('dedicated', ctx.loginStreak >= 3);
    check('devoted', ctx.loginStreak >= 7);
    check('immortal_dedication', ctx.loginStreak >= 30);

    if (newBadges.length > 0) {
      set((s) => ({ earnedBadges: [...s.earnedBadges, ...newBadges] }));
    }
    return newBadges;
  },

  // ── Weekly challenge limit ──
  canEarnRewards: () => {
    const state = get();
    const currentWeekStart = getWeekStart();
    // 跨周重置：若已跨周，先重置 used=0 再判断（修复 useChallenge 不会被调用导致永不重置的死锁）
    if (state.weeklyChallenges.resetAt !== currentWeekStart) {
      set({ weeklyChallenges: { used: 0, limit: 5, resetAt: currentWeekStart } });
      return true;
    }
    return state.weeklyChallenges.used < state.weeklyChallenges.limit;
  },

  useChallenge: () => {
    const state = get();
    const currentWeekStart = getWeekStart();
    if (state.weeklyChallenges.resetAt !== currentWeekStart) {
      set({
        weeklyChallenges: { used: 0, limit: 5, resetAt: currentWeekStart },
      });
    }
    set((st) => ({
      weeklyChallenges: {
        ...st.weeklyChallenges,
        used: st.weeklyChallenges.used + 1,
      },
    }));
  },

  buyRewardChallenge: () => {
    const cost = 120;
    const state = get();
    const currentWeekStart = getWeekStart();
    if (state.weeklyChallenges.resetAt !== currentWeekStart) {
      set({ weeklyChallenges: { used: 0, limit: 5, resetAt: currentWeekStart } });
    }
    if (!get().spendGold(cost)) return false;
    set((s) => ({
      weeklyChallenges: {
        ...s.weeklyChallenges,
        limit: s.weeklyChallenges.limit + 1,
      },
    }));
    get().saveToLocalStorage();
    return true;
  },

  grantPetCoins: (amount) => {
    const today = todayStr();
    const weekStart = getWeekStart();
    const current = get().petCoinRewards;
    const dailyGranted = current.dailyDate === today ? current.dailyGranted : 0;
    const weeklyGranted = current.weekStart === weekStart ? current.weeklyGranted : 0;
    const granted = Math.max(0, Math.min(amount, PET_COIN_DAILY_LIMIT - dailyGranted, PET_COIN_WEEKLY_LIMIT - weeklyGranted));
    const next = {
      dailyDate: today,
      dailyGranted: dailyGranted + granted,
      weekStart,
      weeklyGranted: weeklyGranted + granted,
    };
    set({ petCoinRewards: next });
    if (granted > 0) usePetStore.getState().addCoins(granted);
    return {
      granted,
      dailyRemaining: PET_COIN_DAILY_LIMIT - next.dailyGranted,
      weeklyRemaining: PET_COIN_WEEKLY_LIMIT - next.weeklyGranted,
    };
  },

  buyTrialItem: (itemId) => {
    const catalog = {
      'hint-ticket': { cost: 18, key: 'hintTickets' as const },
      'healing-potion': { cost: 24, key: 'healingPotions' as const },
      'title-data-scout': { cost: 90 },
      'frame-crystal': { cost: 120 },
    };
    const item = catalog[itemId];
    const state = get();
    const isCosmetic = itemId === 'title-data-scout' || itemId === 'frame-crystal';
    if (isCosmetic && state.trialInventory.ownedCosmetics.includes(itemId)) return false;
    if (!state.spendGold(item.cost)) return false;
    set((s) => {
      if (isCosmetic) {
        return { trialInventory: { ...s.trialInventory, ownedCosmetics: [...s.trialInventory.ownedCosmetics, itemId] } };
      }
      const key: 'hintTickets' | 'healingPotions' = itemId === 'hint-ticket' ? 'hintTickets' : 'healingPotions';
      return { trialInventory: { ...s.trialInventory, [key]: s.trialInventory[key] + 1 } };
    });
    get().saveToLocalStorage();
    return true;
  },

  consumeTrialItem: (itemId) => {
    const key = itemId === 'hint-ticket' ? 'hintTickets' : 'healingPotions';
    if (get().trialInventory[key] <= 0) return false;
    set((s) => ({ trialInventory: { ...s.trialInventory, [key]: s.trialInventory[key] - 1 } }));
    get().saveToLocalStorage();
    return true;
  },

  equipTrialCosmetic: (itemId) => {
    if (!get().trialInventory.ownedCosmetics.includes(itemId)) return;
    set((s) => ({
      trialInventory: {
        ...s.trialInventory,
        equippedTitle: itemId === 'title-data-scout' ? itemId : s.trialInventory.equippedTitle,
        equippedAvatarFrame: itemId === 'frame-crystal' ? itemId : s.trialInventory.equippedAvatarFrame,
      },
    }));
    get().saveToLocalStorage();
  },

  bumpSchoolPassiveDaily: () => {
    const today = todayStr();
    const st = get().schoolPassiveDaily;
    // 跨日重置
    if (st.resetAt !== today) {
      set({ schoolPassiveDaily: { used: 1, limit: st.limit || 50, resetAt: today } });
      return true;
    }
    if (st.used < st.limit) {
      set({ schoolPassiveDaily: { used: st.used + 1, limit: st.limit, resetAt: today } });
      return true;
    }
    return false;
  },

  // ── Weak Points & Healing ──
  addWeakPoint: (kp) => set((s) => {
    const wp = { ...s.weakPoints };
    wp[kp] = (wp[kp] || 0) + 1;
    return { weakPoints: wp };
  }),
  removeWeakPoint: (kp) => set((s) => {
    const wp = { ...s.weakPoints };
    if (wp[kp] && wp[kp] <= 1) delete wp[kp];
    else if (wp[kp]) wp[kp]--;
    return { weakPoints: wp };
  }),
  addToMistakeNotebook: (qid) => set((s) => ({
    mistakeNotebook: s.mistakeNotebook.includes(qid) ? s.mistakeNotebook : [...s.mistakeNotebook, qid],
  })),
  startHealing: (kp) => set({ healing: { knowledgePoint: kp, requiredCorrect: 3, currentCorrect: 0 } }),
  recordHealingAnswer: (correct) => {
    const s = get();
    if (!s.healing) return false;
    if (correct) {
      const nc = s.healing.currentCorrect + 1;
      set((st) => ({ healing: st.healing ? { ...st.healing, currentCorrect: nc } : null }));
      if (nc >= s.healing.requiredCorrect) {
        get().removeWeakPoint(s.healing.knowledgePoint);
        get().addExp(30);
        get().addGold(20);
        return true;
      }
    } else {
      set((st) => ({ healing: st.healing ? { ...st.healing, currentCorrect: 0 } : null }));
    }
    return false;
  },
  clearHealing: () => set({ healing: null }),
  getWeakPointsAboveThreshold: (threshold) => {
    const { weakPoints } = get();
    return Object.entries(weakPoints).filter(([, c]) => (c as number) >= threshold).map(([kp]) => kp);
  },

  saveToLocalStorage: () => {
    const { player, dungeonProgress, earnedBadges, weakPoints, mistakeNotebook, _firstClears, weeklyChallenges, schoolPassiveDaily, petCoinRewards, trialInventory } = get();
    try {
      localStorage.setItem('dungeon_player', JSON.stringify(player));
      localStorage.setItem('dungeon_progress', JSON.stringify(dungeonProgress));
      localStorage.setItem('dungeon_badges', JSON.stringify(earnedBadges));
      localStorage.setItem('dungeon_weakpoints', JSON.stringify(weakPoints));
      localStorage.setItem('dungeon_mistakes', JSON.stringify(mistakeNotebook));
      localStorage.setItem('dungeon_first_clears', JSON.stringify(_firstClears));
      localStorage.setItem('dungeon_weekly_challenges', JSON.stringify(weeklyChallenges));
      localStorage.setItem('dungeon_school_passive_daily', JSON.stringify(schoolPassiveDaily));
      localStorage.setItem('dungeon_pet_coin_rewards', JSON.stringify(petCoinRewards));
      localStorage.setItem('dungeon_trial_inventory', JSON.stringify(trialInventory));
    } catch { /* ignore */ }
  },

  loadFromLocalStorage: () => {
    // 每个 key 独立 try-catch，单个损坏不影响其他存档
    let hasAny = false;
    try {
      const playerRaw = localStorage.getItem('dungeon_player');
      if (playerRaw) {
        const raw = JSON.parse(playerRaw);
        // Normalize snake_case (server) to camelCase (client)
        set({ player: {
          ...defaultPlayer(),
          deviceHash: raw.device_hash || raw.deviceHash || '',
          classCode: raw.class_code || raw.classCode || '',
          displayName: raw.display_name || raw.displayName || '',
          realName: raw.real_name || raw.realName || '',
          phone: raw.phone || '',
          status: raw.status || 'active',
          school: raw.school || 'cultivation',
          rankTier: raw.rank_tier || raw.rankTier || 1,
          rankPoints: raw.rank_points || raw.rankPoints || 0,
          playerLevel: raw.player_level || raw.playerLevel || 1,
          exp: raw.exp || 0,
          expToNext: raw.expToNext || expToNextLevel(raw.player_level || raw.playerLevel || 1),
          gold: raw.gold || 0,
          totalAnswered: raw.total_answered || raw.totalAnswered || 0,
          totalCorrect: raw.total_correct || raw.totalCorrect || 0,
          currentStreak: raw.current_streak || raw.currentStreak || 0,
          maxStreak: raw.max_streak || raw.maxStreak || 0,
          loginStreak: raw.login_streak || raw.loginStreak || 0,
          lastLoginDate: raw.last_login_date || raw.lastLoginDate || '',
          season: raw.season || '2026-autumn',
        }});
        hasAny = true;
      }
    } catch { /* ignore player */ }
    try {
      const progress = localStorage.getItem('dungeon_progress');
      if (progress) { set({ dungeonProgress: JSON.parse(progress) }); hasAny = true; }
    } catch { /* ignore progress */ }
    try {
      const badges = localStorage.getItem('dungeon_badges');
      if (badges) set({ earnedBadges: JSON.parse(badges) });
    } catch { /* ignore badges */ }
    try {
      const wp = localStorage.getItem('dungeon_weakpoints');
      if (wp) set({ weakPoints: JSON.parse(wp) });
    } catch { /* ignore weakpoints */ }
    try {
      const mn = localStorage.getItem('dungeon_mistakes');
      if (mn) set({ mistakeNotebook: JSON.parse(mn) });
    } catch { /* ignore mistakes */ }
    try {
      const fc = localStorage.getItem('dungeon_first_clears');
      if (fc) set({ _firstClears: JSON.parse(fc) });
    } catch { /* ignore firstClears */ }
    try {
      const wc = localStorage.getItem('dungeon_weekly_challenges');
      if (wc) {
        const parsed = JSON.parse(wc);
        const currentWeekStart = getWeekStart();
        if (parsed.resetAt === currentWeekStart) {
          set({ weeklyChallenges: parsed });
        } else {
          set({ weeklyChallenges: { used: 0, limit: 5, resetAt: currentWeekStart } });
        }
      }
    } catch { /* ignore weekly */ }
    try {
      const spd = localStorage.getItem('dungeon_school_passive_daily');
      if (spd) {
        const parsed = JSON.parse(spd);
        const today = todayStr();
        if (parsed.resetAt === today) {
          set({ schoolPassiveDaily: parsed });
        } else {
          set({ schoolPassiveDaily: { used: 0, limit: parsed.limit || 50, resetAt: today } });
        }
      }
    } catch { /* ignore schoolPassiveDaily */ }
    try {
      const rewards = localStorage.getItem('dungeon_pet_coin_rewards');
      if (rewards) {
        const parsed = JSON.parse(rewards);
        const today = todayStr();
        const weekStart = getWeekStart();
        set({ petCoinRewards: {
          dailyDate: today,
          dailyGranted: parsed.dailyDate === today ? Number(parsed.dailyGranted) || 0 : 0,
          weekStart,
          weeklyGranted: parsed.weekStart === weekStart ? Number(parsed.weeklyGranted) || 0 : 0,
        } });
      }
    } catch { /* ignore pet coin rewards */ }
    try {
      const inventory = localStorage.getItem('dungeon_trial_inventory');
      if (inventory) set({ trialInventory: { ...defaultTrialInventory(), ...JSON.parse(inventory) } });
    } catch { /* ignore trial inventory */ }

    return hasAny;
  },
}));

export default useDungeonStore;
