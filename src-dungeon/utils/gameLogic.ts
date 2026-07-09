// 潜龙闭关 — 游戏数值公式

// ── 等级与经验 ──
export function expToNextLevel(level: number): number {
  return Math.round(100 * Math.pow(1.15, level - 1) / 10) * 10;
}

export function getLevelFromExp(totalExp: number): { level: number; exp: number; expToNext: number } {
  let level = 1;
  let remainingExp = totalExp;
  while (true) {
    const needed = expToNextLevel(level);
    if (remainingExp < needed) {
      return { level, exp: remainingExp, expToNext: needed };
    }
    remainingExp -= needed;
    level++;
    if (level > 100) break; // safety cap
  }
  return { level: 100, exp: 0, expToNext: expToNextLevel(100) };
}

// ── 段位积分 ──
export const RANK_TIER_NAMES: Record<string, string[]> = {
  cultivation: ['潜龙勿用','见龙在田','飞龙在天','亢龙有悔','龙战于野','神龙摆尾','真龙降世','万龙之祖'],
  tactical: ['见习特工','行动干员','精英特工','战术专家','行动指挥官','战略大师','传奇特工','影子统帅'],
  star: ['开拓者','探索者','观测者','觉醒者','命途行者','星核猎手','星域之主','终末的观者'],
  minecraft: ['史蒂夫','铁套战士','钻石剑士','附魔师','下界探险家','末影猎手','凋零杀手','创世神'],
  code: ['脚本学徒','逻辑术士','递归法师','算法贤者','架构大法师','编译先知','数字半神','代码创世神'],
  dream: ['追光者','聚光灯下','闪耀新星','舞台焦点','全场C位','国民偶像','时代传奇','永恒之光'],
};

export const RANK_POINTS_THRESHOLDS = [0, 300, 800, 1500, 3000, 5000, 8000, 12000];

export function getRankTier(rankPoints: number): number {
  for (let i = RANK_POINTS_THRESHOLDS.length - 1; i >= 0; i--) {
    if (rankPoints >= RANK_POINTS_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function getRankName(school: string, tier: number): string {
  const ranks = RANK_TIER_NAMES[school] || RANK_TIER_NAMES.cultivation;
  return ranks[Math.min(tier - 1, ranks.length - 1)] || '未知';
}

export function getNextRankPoints(tier: number): number {
  if (tier < 1 || tier >= 8) return RANK_POINTS_THRESHOLDS[7];
  return RANK_POINTS_THRESHOLDS[tier - 1]; // threshold to reach next tier
}

// ── 流派轻量被动 ──
export const SCHOOL_PASSIVES: Record<string, { name: string; description: string }> = {
  cultivation: {
    name: '厚积薄发',
    description: '获得的试炼 EXP +5%。',
  },
  tactical: {
    name: '精准复盘',
    description: '答对题目时，额外获得 +2 段位积分。',
  },
  star: {
    name: '星轨洞察',
    description: '技能暴击率 +3%。',
  },
  minecraft: {
    name: '资源采集',
    description: '通关结算金币 +5%。',
  },
  code: {
    name: '代码共鸣',
    description: '程序、算法、递归类题目答对时 EXP +8%。',
  },
  dream: {
    name: '舞台连携',
    description: '连对 3 题及以上时，答题金币 +5%。',
  },
};

export function getSchoolPassive(school: string) {
  return SCHOOL_PASSIVES[school] || SCHOOL_PASSIVES.cultivation;
}

function roundPositive(value: number): number {
  return value > 0 ? Math.max(1, Math.round(value)) : 0;
}

function isCodeLikeQuestion(questionType?: string, knowledgePoint?: string): boolean {
  const text = `${questionType || ''} ${knowledgePoint || ''}`;
  return /程序|代码|算法|递归|函数|循环|数组|结构|C\+\+/i.test(text);
}

export function applySchoolAnswerPassive(
  school: string,
  reward: { exp: number; gold: number },
  context: { combo: number; questionType?: string; knowledgePoint?: string }
): { exp: number; gold: number } {
  let exp = reward.exp;
  let gold = reward.gold;

  if (school === 'cultivation') {
    exp = roundPositive(exp * 1.05);
  }
  if (school === 'code' && isCodeLikeQuestion(context.questionType, context.knowledgePoint)) {
    exp = roundPositive(exp * 1.08);
  }
  if (school === 'dream' && context.combo >= 3) {
    gold = roundPositive(gold * 1.05);
  }

  return { exp, gold };
}

export function applySchoolClearPassive(
  school: string,
  reward: { exp: number; gold: number }
): { exp: number; gold: number } {
  let exp = reward.exp;
  let gold = reward.gold;

  if (school === 'cultivation') {
    exp = roundPositive(exp * 1.05);
  }
  if (school === 'minecraft') {
    gold = roundPositive(gold * 1.05);
  }

  return { exp, gold };
}

export function getSchoolRankPointBonus(school: string, isCorrect: boolean): number {
  return school === 'tactical' && isCorrect ? 2 : 0;
}

export function getCriticalChance(school: string): number {
  return school === 'star' ? 0.13 : 0.1;
}

// ── 奖励计算 ──
export const BASE_EXP = 15;
export const BASE_GOLD = 10;
export const STAGE_CLEAR_EXP = 50;
export const STAGE_CLEAR_GOLD = 30;
export const BOSS_CLEAR_EXP = 200;
export const BOSS_CLEAR_GOLD = 100;
export const FIRST_CLEAR_MULTIPLIER = 3;
export const DAILY_FIRST_WIN_MULTIPLIER = 2;

export function calculateAnswerReward(
  isCorrect: boolean,
  combo: number,
  isCritical: boolean
): { exp: number; gold: number } {
  if (!isCorrect) return { exp: 0, gold: 0 };

  let exp = BASE_EXP;
  let gold = BASE_GOLD;

  // Combo multiplier
  if (combo >= 20) { exp = Math.round(exp * 2); gold = Math.round(gold * 2); }
  else if (combo >= 10) { exp = Math.round(exp * 1.5); gold = Math.round(gold * 1.5); }
  else if (combo >= 5) { exp = Math.round(exp * 1.2); }

  // Critical hit
  if (isCritical) {
    exp *= 2;
  }

  return { exp, gold };
}

export function rollCritical(school = ''): boolean {
  return Math.random() < getCriticalChance(school);
}

export function randomGold(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function calculateBattleRewards(
  isWin: boolean,
  isFirstClear: boolean,
  isBoss: boolean,
  rating: ClearRating | string
): { gold: number; breakdown: string[] } {
  if (!isWin) return { gold: 0, breakdown: ['失败，无奖励'] };

  const breakdown: string[] = [];
  let gold = randomGold(10, 20);
  breakdown.push(`胜利奖励 ${gold} 金币`);

  if (isFirstClear) {
    const bonus = gold * 2;
    gold += bonus;
    breakdown.push(`首次通关 ×2：+${bonus} 金币`);
  }

  if (isBoss) {
    const bonus = randomGold(15, 30);
    gold += bonus;
    breakdown.push(`Boss 奖励：+${bonus} 金币`);
  }

  if (rating === 'S') {
    const bonus = randomGold(10, 15);
    gold += bonus;
    breakdown.push(`S 评级奖励：+${bonus} 金币`);
  } else if (rating === 'SS') {
    const bonus = randomGold(15, 20);
    gold += bonus;
    breakdown.push(`SS 评级奖励：+${bonus} 金币`);
  }

  return { gold, breakdown };
}

// ── Boss 评级 ──
export function calculateBossRating(scorePercent: number, timeSeconds: number): string {
  if (scorePercent >= 100 && timeSeconds < 180) return 'SS';
  if (scorePercent >= 95) return 'S';
  if (scorePercent >= 85) return 'A';
  if (scorePercent >= 70) return 'B';
  if (scorePercent >= 60) return 'C';
  return 'D';
}

// ── 智子试炼场战斗评级 ──
export function calculateBattleRating(
  correctCount: number,
  totalQuestions: number,
  remainingHpRatio: number,
  usedSkillIds: string[],
  roundCount: number,
  expectedRounds: number
): ClearRating {
  const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;
  const uniqueSkills = new Set(usedSkillIds).size;

  if (accuracy === 1 && remainingHpRatio >= 0.7 && uniqueSkills >= 4 && roundCount <= expectedRounds) {
    return 'SS';
  }
  if (accuracy >= 0.8 && remainingHpRatio >= 0.5 && uniqueSkills >= 3) {
    return 'S';
  }
  if (accuracy >= 0.7 && remainingHpRatio >= 0.3) return 'A';
  if (accuracy >= 0.6) return 'B';
  return 'C';
}

// ── 徽章检测 ──
export interface BadgeCheckContext {
  totalCorrect: number;
  totalAnswered: number;
  maxStreak: number;
  currentStreak: number;
  clearedDungeons: number;
  perfectDungeons: number;
  bossScores: { dungeonId: string; rating: string; time: number }[];
  playerLevel: number;
  rankTier: number;
  loginStreak: number;
  gold: number;
}

export function checkBadges(ctx: BadgeCheckContext): string[] {
  const newBadges: string[] = [];

  // Common badges
  if (ctx.totalAnswered >= 1 && ctx.totalCorrect >= 1) newBadges.push('first_blood');
  if (ctx.totalAnswered >= 10) newBadges.push('apprentice');
  if (ctx.totalAnswered >= 100) newBadges.push('marathon');

  // Accuracy badges
  if (ctx.maxStreak >= 10) newBadges.push('sharpshooter');
  if (ctx.maxStreak >= 30) newBadges.push('combo_master');
  if (ctx.maxStreak >= 50) newBadges.push('unstoppable');
  if (ctx.totalAnswered >= 50 && ctx.totalCorrect / ctx.totalAnswered >= 0.95) {
    newBadges.push('perfectionist');
  }

  // Boss badges
  const ssBosses = ctx.bossScores.filter(b => b.rating === 'SS').length;
  if (ssBosses >= 1) newBadges.push('speed_demon');
  if (ssBosses >= 3) newBadges.push('time_lord');

  // Dungeon badges
  if (ctx.clearedDungeons >= 1) newBadges.push('first_clear');
  if (ctx.clearedDungeons >= 3) newBadges.push('dungeon_crawler');
  if (ctx.clearedDungeons >= 6) newBadges.push('dungeon_master');
  if (ctx.clearedDungeons >= 8) newBadges.push('all_clear');
  if (ctx.perfectDungeons >= 1) newBadges.push('flawless');
  if (ctx.perfectDungeons >= 3) newBadges.push('immortal_dragon');
  if (ctx.perfectDungeons >= 8) newBadges.push('supreme_dragon');

  // Rank badges
  if (ctx.rankTier >= 3) newBadges.push('rising_star');
  if (ctx.rankTier >= 5) newBadges.push('dragon_warrior');
  if (ctx.rankTier >= 7) newBadges.push('dragon_lord');
  if (ctx.rankTier >= 8) newBadges.push('dragon_god');

  // Dedication badges
  if (ctx.loginStreak >= 3) newBadges.push('dedicated');
  if (ctx.loginStreak >= 7) newBadges.push('devoted');
  if (ctx.loginStreak >= 30) newBadges.push('immortal_dedication');

  // Secret/mythic badges (hidden conditions)
  // Will be checked on server side

  return newBadges;
}

// ── 赛季 ──
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month <= 6) return `${year}-spring`;
  return `${year}-autumn`;
}

// ── 副本完成度 ──
export type ClearRating = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
export function getStageClearRating(correct: number, total: number, hpRemaining: number): ClearRating {
  const ratio = correct / total;
  if (ratio >= 1 && hpRemaining >= 3) return 'SS';
  if (ratio >= 1) return 'S';
  if (ratio >= 0.8) return 'A';
  if (ratio >= 0.7) return 'B';
  if (ratio >= 0.6) return 'C';
  return 'D';
}
