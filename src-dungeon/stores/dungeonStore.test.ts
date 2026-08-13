import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDungeonStore } from './dungeonStore';
import { usePetStore } from '../../src/stores/petStore';
import { expToNextLevel } from '../utils/gameLogic';
import type { BattleState, DungeonProgress, PlayerState } from '../types/dungeon';
import { CURRENT_DUNGEON_SEASON_ID } from '../data/season';

function makeLocalStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
  };
}

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    deviceHash: 'test-device',
    classCode: 'TEST01',
    displayName: '测试学生',
    realName: '测试学生',
    phone: '13800000000',
    status: 'active',
    school: 'cultivation',
    rankTier: 1,
    rankPoints: 0,
    playerLevel: 1,
    exp: 0,
    expToNext: expToNextLevel(1),
    gold: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    currentStreak: 0,
    maxStreak: 0,
    loginStreak: 0,
    lastLoginDate: '',
    season: '2026-autumn',
    ...overrides,
  };
}

function makeProgress(overrides: Partial<DungeonProgress> = {}): DungeonProgress {
  return {
    dungeonId: 'dungeon-01',
    status: 'unlocked',
    completedStages: 0,
    totalStages: 5,
    currentStageId: null,
    bossDefeated: false,
    bestScore: 0,
    bestRating: 'D',
    ...overrides,
  };
}

function makeBattle(overrides: Partial<BattleState> = {}): BattleState {
  return {
    dungeonId: 'dungeon-01',
    stageId: 'dungeon-01-stage-01',
    questions: [],
    currentQuestionIndex: 0,
    hp: 100,
    maxHp: 100,
    correctCount: 3,
    wrongCount: 0,
    comboCount: 3,
    startTime: Date.now(),
    isBoss: false,
    isFinished: true,
    isWon: true,
    expEarned: 0,
    goldEarned: 0,
    rating: 'A',
    enemyHp: 0,
    enemyMaxHp: 100,
    currentTurn: 'player',
    roundCount: 8,
    skillUsages: [],
    usedSkillIds: ['skill-1'],
    energy: 0,
    maxEnergy: 5,
    shield: 0,
    enemyIntent: null,
    burnStacks: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage());
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in unit tests'))));
  useDungeonStore.setState({
    player: makePlayer(),
    dungeons: [],
    dungeonProgress: [makeProgress()],
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
    view: 'map',
    loading: false,
    error: null,
    weeklyChallenges: { used: 0, limit: 5, resetAt: '' },
    currentBattleEarnsRewards: true,
    schoolPassiveDaily: { used: 0, limit: 50, resetAt: '' },
    petCoinRewards: { dailyDate: '', dailyGranted: 0, weekStart: '', weeklyGranted: 0 },
    trialInventory: { hintTickets: 0, healingPotions: 0, ownedCosmetics: [], equippedTitle: null, equippedAvatarFrame: null },
    _firstClears: {},
  });
  usePetStore.setState({ coins: 0 });
});

describe('智子试炼场核心结算', () => {
  it('新赛季只重置试炼数据，不影响桌宠金币与试炼道具', () => {
    usePetStore.setState({ coins: 2680 });
    useDungeonStore.setState({
      player: makePlayer({ season: '2026-autumn', playerLevel: 15, exp: 488, rankTier: 6, rankPoints: 800 }),
      dungeonProgress: [makeProgress({ status: 'cleared', completedStages: 5, bossDefeated: true, bestRating: 'SS' })],
      earnedBadges: ['first_clear'],
      weakPoints: { '循环': 3 },
      trialInventory: { hintTickets: 4, healingPotions: 2, ownedCosmetics: ['frame-crystal'], equippedTitle: null, equippedAvatarFrame: 'frame-crystal' },
    });

    const migrated = useDungeonStore.getState().migrateSeason([{
      id: 'dungeon-01', name: '天机阁', subtitle: '', icon: '', description: '', guardianName: '', guardianLine: '', bossName: '', bossLine: '', bossDescription: '', color: '#fff', requiredDungeon: null, unlockLevel: 1, stages: [{ id: 'dungeon-01-stage-01', name: '', description: '', questionIds: [], requiredCorrect: 3, hp: 3 }], bossQuestionCount: 10, bossPassScore: 60,
    }]);

    const state = useDungeonStore.getState();
    expect(migrated).toBe(true);
    expect(state.player.season).toBe(CURRENT_DUNGEON_SEASON_ID);
    expect(state.player.playerLevel).toBe(1);
    expect(state.dungeonProgress[0].completedStages).toBe(0);
    expect(state.earnedBadges).toEqual([]);
    expect(state.trialInventory.hintTickets).toBe(4);
    expect(state.trialInventory.ownedCosmetics).toEqual(['frame-crystal']);
    expect(usePetStore.getState().coins).toBe(2680);
  });

  it('同一赛季重复启动不会再次清空进度', () => {
    useDungeonStore.setState({
      player: makePlayer({ season: CURRENT_DUNGEON_SEASON_ID }),
      dungeonProgress: [makeProgress({ completedStages: 2 })],
    });
    expect(useDungeonStore.getState().migrateSeason([])).toBe(false);
    expect(useDungeonStore.getState().dungeonProgress[0].completedStages).toBe(2);
  });

  it('升级后继续获得经验不会掉级', () => {
    useDungeonStore.setState({
      player: makePlayer({ playerLevel: 3, exp: 0, expToNext: expToNextLevel(3) }),
    });

    useDungeonStore.getState().addExp(10);

    const player = useDungeonStore.getState().player;
    expect(player.playerLevel).toBe(3);
    expect(player.exp).toBe(10);
    expect(player.expToNext).toBe(expToNextLevel(3));
  });

  it('有奖励挑战胜利会推进关卡并发通关奖励', () => {
    useDungeonStore.setState({
      battle: makeBattle({ rating: 'A' }),
      currentBattleEarnsRewards: true,
      dungeonProgress: [makeProgress({ completedStages: 0, bestRating: 'D' })],
    });

    const result = useDungeonStore.getState().finalizeBattle('dungeon-01', false);

    const state = useDungeonStore.getState();
    expect(result?.isWon).toBe(true);
    expect(state.dungeonProgress[0].completedStages).toBe(1);
    expect(state.dungeonProgress[0].status).toBe('in_progress');
    expect(state.dungeonProgress[0].bestRating).toBe('A');
    expect(state.player.exp).toBeGreaterThan(0);
    expect(state.player.gold).toBe(0);
    expect(usePetStore.getState().coins).toBeGreaterThan(0);
    expect(state.lastBattleResult?.expEarned).toBeGreaterThan(0);
    expect(state.lastBattleResult?.goldEarned).toBeGreaterThan(0);
    expect(state.lastBattleResult?.petCoinsEarned).toBeGreaterThan(0);
  });

  it('重打已通关关卡不发奖励不推进进度，但能提升最好评级', () => {
    useDungeonStore.setState({
      player: makePlayer({ exp: 40, gold: 90 }),
      battle: makeBattle({ rating: 'S', correctCount: 5 }),
      currentBattleEarnsRewards: false,
      dungeonProgress: [makeProgress({ completedStages: 1, bestScore: 3, bestRating: 'A' })],
      _firstClears: { 'dungeon-01': true },
    });

    useDungeonStore.getState().finalizeBattle('dungeon-01', false);

    const state = useDungeonStore.getState();
    expect(state.player.exp).toBe(40);
    expect(state.player.gold).toBe(90);
    expect(state.dungeonProgress[0].completedStages).toBe(1);
    expect(state.dungeonProgress[0].bestScore).toBe(5);
    expect(state.dungeonProgress[0].bestRating).toBe('S');
    expect(state.lastBattleResult?.expEarned).toBe(0);
    expect(state.lastBattleResult?.goldEarned).toBe(0);
    expect(state.lastBattleResult?.rewardsEligible).toBe(false);
  });

  it('重打使用有奖次数时正常发放 EXP 和通用金币', () => {
    useDungeonStore.setState({
      player: makePlayer({ exp: 40 }),
      battle: makeBattle({ rating: 'SS', correctCount: 5, expEarned: 45, goldEarned: 30 }),
      currentBattleEarnsRewards: true,
      dungeonProgress: [makeProgress({ completedStages: 1, bestScore: 3, bestRating: 'A' })],
      _firstClears: { 'dungeon-01:dungeon-01-stage-01': true },
    });

    const result = useDungeonStore.getState().finalizeBattle('dungeon-01', false);

    expect(result?.rewardsEligible).toBe(true);
    expect(result?.expEarned).toBeGreaterThan(45);
    expect(result?.petCoinsEarned).toBeGreaterThan(0);
    expect(usePetStore.getState().coins).toBeGreaterThan(0);
  });

  it('重打较差评级不会覆盖已有 SS 最好评级', () => {
    useDungeonStore.setState({
      battle: makeBattle({ rating: 'B', correctCount: 2 }),
      currentBattleEarnsRewards: false,
      dungeonProgress: [makeProgress({ completedStages: 1, bestScore: 6, bestRating: 'SS' })],
      _firstClears: { 'dungeon-01': true },
    });

    useDungeonStore.getState().finalizeBattle('dungeon-01', false);

    const progress = useDungeonStore.getState().dungeonProgress[0];
    expect(progress.bestScore).toBe(6);
    expect(progress.bestRating).toBe('SS');
  });

  it('周奖励次数已满时，从未通关的具体关卡获得 SS 仍发经验', () => {
    useDungeonStore.setState({
      player: makePlayer({ exp: 0 }),
      battle: makeBattle({
        stageId: 'dungeon-01-stage-02',
        rating: 'SS',
        correctCount: 6,
      }),
      currentBattleEarnsRewards: false,
      weeklyChallenges: { used: 5, limit: 5, resetAt: new Date().toISOString() },
      dungeonProgress: [makeProgress({ completedStages: 1, bestRating: 'A' })],
      _firstClears: { 'dungeon-01:dungeon-01-stage-01': true },
    });

    const result = useDungeonStore.getState().finalizeBattle('dungeon-01', false);

    expect(useDungeonStore.getState().player.exp).toBeGreaterThan(0);
    expect(result?.ratingExpBonus).toBe(15);
    expect(result?.petExpEarned).toBeGreaterThan(0);
    expect(useDungeonStore.getState().dungeonProgress[0].completedStages).toBe(2);
  });

  it('通用金币可以购买本周额外奖励次数，金币不足时失败', () => {
    usePetStore.setState({ coins: 119 });
    useDungeonStore.getState().canEarnRewards();
    expect(useDungeonStore.getState().buyRewardChallenge()).toBe(false);

    usePetStore.setState({ coins: 120 });
    const before = useDungeonStore.getState().weeklyChallenges;
    expect(useDungeonStore.getState().buyRewardChallenge()).toBe(true);

    const state = useDungeonStore.getState();
    expect(usePetStore.getState().coins).toBe(0);
    expect(state.weeklyChallenges.limit).toBe(before.limit + 1);
  });

  it('桌宠金币奖励受每日上限限制', () => {
    const first = useDungeonStore.getState().grantPetCoins(25);
    const second = useDungeonStore.getState().grantPetCoins(25);

    expect(first.granted).toBe(25);
    expect(second.granted).toBe(5);
    expect(second.dailyRemaining).toBe(0);
    expect(useDungeonStore.getState().petCoinRewards.dailyGranted).toBe(30);
  });

  it('通用金币可以购买并消耗提示券', () => {
    usePetStore.setState({ coins: 18 });

    expect(useDungeonStore.getState().buyTrialItem('hint-ticket')).toBe(true);
    expect(usePetStore.getState().coins).toBe(0);
    expect(useDungeonStore.getState().trialInventory.hintTickets).toBe(1);
    expect(useDungeonStore.getState().consumeTrialItem('hint-ticket')).toBe(true);
    expect(useDungeonStore.getState().trialInventory.hintTickets).toBe(0);
  });

  it('试炼补给逐项到账，高价外观不能重复扣款', () => {
    usePetStore.setState({ coins: 300 });

    expect(useDungeonStore.getState().buyTrialItem('title-data-scout')).toBe(true);
    expect(useDungeonStore.getState().buyTrialItem('title-data-scout')).toBe(false);
    expect(useDungeonStore.getState().buyTrialItem('frame-crystal')).toBe(true);
    expect(useDungeonStore.getState().buyTrialItem('frame-crystal')).toBe(false);
    expect(useDungeonStore.getState().buyTrialItem('hint-ticket')).toBe(true);
    expect(useDungeonStore.getState().buyTrialItem('healing-potion')).toBe(true);

    const inventory = useDungeonStore.getState().trialInventory;
    expect(inventory.ownedCosmetics).toEqual(['title-data-scout', 'frame-crystal']);
    expect(inventory.hintTickets).toBe(1);
    expect(inventory.healingPotions).toBe(1);
    expect(usePetStore.getState().coins).toBe(48);

    expect(useDungeonStore.getState().consumeTrialItem('healing-potion')).toBe(true);
    expect(useDungeonStore.getState().consumeTrialItem('healing-potion')).toBe(false);
    expect(useDungeonStore.getState().trialInventory.healingPotions).toBe(0);
    expect(usePetStore.getState().coins).toBe(48);
  });
});
