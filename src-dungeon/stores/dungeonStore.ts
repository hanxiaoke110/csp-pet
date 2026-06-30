// 潜龙闭关 — 核心状态管理
import { create } from 'zustand';
import type {
  PlayerState, DungeonProgress, DungeonDefinition, Question,
  BattleState, BadgeDefinition, DailyTasks, School,
} from '../types/dungeon';
import {
  getLevelFromExp,
  getRankTier, expToNextLevel,
  RANK_POINTS_THRESHOLDS, FIRST_CLEAR_MULTIPLIER,
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

  // Actions
  setView: (v: DungeonState['view']) => void;
  setLoading: (l: boolean) => void;
  setError: (e: string | null) => void;

  // Player
  initPlayer: (data: Partial<PlayerState>) => void;
  setSchool: (school: School) => void;
  addExp: (amount: number) => void;
  addGold: (amount: number) => void;
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

  // Weak points & healing
  addWeakPoint: (kp: string) => void;
  removeWeakPoint: (kp: string) => void;
  addToMistakeNotebook: (questionId: string) => void;
  startHealing: (kp: string) => void;
  recordHealingAnswer: (correct: boolean) => boolean;
  clearHealing: () => void;
  getWeakPointsAboveThreshold: (threshold: number) => string[];

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
  // Track if this dungeon has been cleared before (for first-clear bonus)
  _firstClears: {} as Record<string, boolean>,

  setView: (v) => set({ view: v }),
  setLoading: (l) => set({ loading: l }),
  setError: (e) => set({ error: e }),

  initPlayer: (data) => set((s) => {
    // Normalize snake_case (from server) to camelCase (client)
    const p: PlayerState = {
      ...s.player,
      deviceHash: (data as any).device_hash || (data as any).deviceHash || data.deviceHash || s.player.deviceHash,
      classCode: (data as any).class_code || (data as any).classCode || data.classCode || s.player.classCode,
      displayName: (data as any).display_name || (data as any).displayName || data.displayName || s.player.displayName,
      realName: (data as any).real_name || (data as any).realName || data.realName || s.player.realName,
      phone: (data as any).phone || data.phone || s.player.phone,
      status: (data as any).status || data.status || s.player.status,
      school: (data as any).school || data.school || s.player.school,
      rankTier: (data as any).rank_tier || (data as any).rankTier || data.rankTier || s.player.rankTier,
      rankPoints: (data as any).rank_points || (data as any).rankPoints || data.rankPoints || s.player.rankPoints,
      playerLevel: (data as any).player_level || (data as any).playerLevel || data.playerLevel || s.player.playerLevel,
      exp: (data as any).exp || data.exp || s.player.exp,
      gold: (data as any).gold || data.gold || s.player.gold,
      totalAnswered: (data as any).total_answered || (data as any).totalAnswered || data.totalAnswered || s.player.totalAnswered,
      totalCorrect: (data as any).total_correct || (data as any).totalCorrect || data.totalCorrect || s.player.totalCorrect,
      currentStreak: (data as any).current_streak || (data as any).currentStreak || data.currentStreak || s.player.currentStreak,
      maxStreak: (data as any).max_streak || (data as any).maxStreak || data.maxStreak || s.player.maxStreak,
      loginStreak: (data as any).login_streak || (data as any).loginStreak || data.loginStreak || s.player.loginStreak,
      lastLoginDate: (data as any).last_login_date || (data as any).lastLoginDate || data.lastLoginDate || s.player.lastLoginDate,
      season: (data as any).season || data.season || s.player.season,
      expToNext: s.player.expToNext,
    };
    return { player: p };
  }),

  setSchool: (school) => set((s) => ({ player: { ...s.player, school } })),

  addExp: (amount) => set((s) => {
    const totalExp = (s.player.exp || 0) + amount;
    const { level, exp, expToNext } = getLevelFromExp(totalExp);
    return { player: { ...s.player, playerLevel: level, exp, expToNext } };
  }),

  addGold: (amount) => set((s) => ({
    player: { ...s.player, gold: s.player.gold + amount }
  })),

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
        clearExp = BOSS_CLEAR_EXP * mult;
        clearGold = earnsRewards ? BOSS_CLEAR_GOLD * mult : 0;
      } else {
        clearExp = STAGE_CLEAR_EXP * mult;
        clearGold = earnsRewards ? STAGE_CLEAR_GOLD * mult : 0;
      }
      get().addExp(clearExp);
      if (clearGold > 0) get().addGold(clearGold);
      snapshot.expEarned += clearExp;
      snapshot.goldEarned += clearGold;
      if (isFirstClear) {
        set((s) => ({ _firstClears: { ...s._firstClears, [dungeonId]: true } }));
      }
    }

    // 2. 更新副本进度（在徽章检查之前，避免读 stale progress）
    if (battle.isWon) {
      set((s) => {
        const progress = s.dungeonProgress;
        const dp = progress.find(p => p.dungeonId === dungeonId);
        if (!dp) return {};
        const newProgress = progress.map(p => {
          if (p.dungeonId !== dungeonId) return p;
          if (isBoss) {
            return { ...p, bossDefeated: true, bestScore: Math.max(p.bestScore, battle.correctCount), bestRating: battle.rating };
          }
          const newCompleted = Math.min(p.completedStages + 1, p.totalStages);
          const allStagesDone = newCompleted >= p.totalStages;
          const status: DungeonProgress['status'] = allStagesDone ? 'cleared' : 'in_progress';
          return { ...p, completedStages: newCompleted, status };
        });
        return { dungeonProgress: newProgress };
      });
    }

    // 3. 段位重算 + 徽章检查（此时 progress 已更新）
    get().checkRankUp();
    get().checkAndAwardBadges();
    get().saveToLocalStorage();

    // 4. 服务端同步：上报战斗结果（写 dungeon_attempts + 服务端发金币）+ 同步玩家信息
    const stageIdForReport = battle.stageId;
    const totalAnswered = battle.correctCount + battle.wrongCount;
    import('../utils/api').then(({ reportBattle, syncProgress }) => {
      reportBattle({
        dungeon_id: dungeonId,
        stage_id: stageIdForReport,
        is_win: battle.isWon,
        rating: battle.rating,
        questions_answered: totalAnswered,
        correct_count: battle.correctCount,
      }).catch(() => {});
      const s = get();
      syncProgress({
        player_level: s.player.playerLevel, exp: s.player.exp, gold: s.player.gold,
        rank_tier: s.player.rankTier, rank_points: s.player.rankPoints,
        total_answered: s.player.totalAnswered, total_correct: s.player.totalCorrect,
        current_streak: s.player.currentStreak, max_streak: s.player.maxStreak,
        login_streak: s.player.loginStreak, school: s.player.school,
        dungeon_progress: s.dungeonProgress.map(dp => ({
          dungeonId: dp.dungeonId, status: dp.status, completedStages: dp.completedStages,
          totalStages: dp.totalStages, bossDefeated: dp.bossDefeated,
          bestScore: dp.bestScore, bestRating: dp.bestRating,
        })),
        badges: s.earnedBadges,
      }).catch(() => {});
    });

    // 5. 清空 battle，保留结算快照供 RewardScreen 展示（结算已落地，关窗不再丢失）
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
    const { player, dungeonProgress, earnedBadges, weakPoints, mistakeNotebook, _firstClears, weeklyChallenges } = get();
    try {
      localStorage.setItem('dungeon_player', JSON.stringify(player));
      localStorage.setItem('dungeon_progress', JSON.stringify(dungeonProgress));
      localStorage.setItem('dungeon_badges', JSON.stringify(earnedBadges));
      localStorage.setItem('dungeon_weakpoints', JSON.stringify(weakPoints));
      localStorage.setItem('dungeon_mistakes', JSON.stringify(mistakeNotebook));
      localStorage.setItem('dungeon_first_clears', JSON.stringify(_firstClears));
      localStorage.setItem('dungeon_weekly_challenges', JSON.stringify(weeklyChallenges));
    } catch { /* ignore */ }
  },

  loadFromLocalStorage: () => {
    try {
      const playerRaw = localStorage.getItem('dungeon_player');
      const progress = localStorage.getItem('dungeon_progress');
      const badges = localStorage.getItem('dungeon_badges');
      const wp = localStorage.getItem('dungeon_weakpoints');
      const mn = localStorage.getItem('dungeon_mistakes');
      const fc = localStorage.getItem('dungeon_first_clears');
      const wc = localStorage.getItem('dungeon_weekly_challenges');

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
      }
      if (progress) set({ dungeonProgress: JSON.parse(progress) });
      if (badges) set({ earnedBadges: JSON.parse(badges) });
      if (wp) set({ weakPoints: JSON.parse(wp) });
      if (mn) set({ mistakeNotebook: JSON.parse(mn) });
      if (fc) set({ _firstClears: JSON.parse(fc) });
      if (wc) {
        const parsed = JSON.parse(wc);
        const currentWeekStart = getWeekStart();
        if (parsed.resetAt === currentWeekStart) {
          set({ weeklyChallenges: parsed });
        } else {
          set({ weeklyChallenges: { used: 0, limit: 5, resetAt: currentWeekStart } });
        }
      }

      return !!(playerRaw || progress);
    } catch {
      return false;
    }
  },
}));

export default useDungeonStore;
