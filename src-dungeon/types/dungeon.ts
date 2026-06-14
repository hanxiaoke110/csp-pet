// 潜龙闭关・学霸副本攻略 — 类型定义

// ── 修行流派 ──
export type School = 'cultivation' | 'tactical' | 'star' | 'minecraft' | 'code' | 'dream';

export interface SchoolDefinition {
  id: School;
  name: string;           // 流派名称
  subtitle: string;        // 副标题
  icon: string;            // emoji
  description: string;     // 描述文字
  themeColor: string;      // UI 主题色
  bgGradient: string;      // 背景渐变
  ranks: string[];         // 8 段位称号
}

// ── 玩家状态 ──
export interface PlayerState {
  deviceHash: string;
  classCode: string;
  displayName: string;
  realName: string;
  phone: string;
  status: 'active' | 'inactive';
  school: School;
  rankTier: number;        // 1-8 统一段位
  rankPoints: number;      // 段位积分
  playerLevel: number;
  exp: number;
  expToNext: number;
  gold: number;
  totalAnswered: number;
  totalCorrect: number;
  currentStreak: number;
  maxStreak: number;
  loginStreak: number;
  lastLoginDate: string;
  season: string;
}

// ── 副本定义 ──
export interface DungeonDefinition {
  id: string;                    // "dungeon-01"
  name: string;                  // 副本名，如 "天机阁"
  subtitle: string;              // 知识点描述
  icon: string;                  // emoji
  description: string;           // 风味文字
  guardianName: string;          // 守关 NPC 名字
  guardianLine: string;          // NPC 对话
  bossName: string;              // Boss 名字
  bossDescription: string;       // Boss 描述
  color: string;                 // 主题色
  requiredDungeon: string | null; // 前置副本 id，null=无需前置
  unlockLevel: number;           // 所需玩家等级
  stages: DungeonStage[];
  bossQuestionCount: number;     // Boss 战题目数
  bossPassScore: number;         // Boss 战通过分数（百分比）
}

export interface DungeonStage {
  id: string;                    // "dungeon-01-stage-01"
  name: string;                  // 关卡名
  description: string;           // 风味文字
  questionIds: string[];         // 引用 csp-exam-bank 题号
  requiredCorrect: number;       // 需要答对的题目数
  hp: number;                    // 容错次数
}

// ── 副本进度 ──
export interface DungeonProgress {
  dungeonId: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'cleared';
  completedStages: number;
  totalStages: number;
  currentStageId: string | null;
  bossDefeated: boolean;
  bestScore: number;              // Boss 战最高分
  bestRating: string;             // D/C/B/A/S/SS
}

// ── 题目（复用已有数据结构） ──
export interface Question {
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
  subQuestions?: SubQuestion[];
  blanks?: Blank[];
  explanation?: string;
}

export interface SubQuestion {
  label: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface Blank {
  position: number;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

// ── 徽章 ──
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  rarity: BadgeRarity;
  icon: string;               // emoji
  category: 'combat' | 'accuracy' | 'dedication' | 'collection' | 'secret';
  condition: string;          // 人类可读的达成条件
  hidden: boolean;            // 神话徽章隐藏条件
}

// ── 排行榜 ──
export type LeaderboardType = 'power' | 'streak' | 'conquest' | 'badge';
export type LeaderboardScope = 'class' | 'global';

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  school: School;
  rankTier: number;
  rankPoints: number;
  classCode: string;
  value: number;              // 排序值
}

// ── 全服广播 ──
export type BroadcastType = 'dungeon_clear' | 'rank_up' | 'badge_legendary' | 'streak_record' | 'class_war';

export interface Broadcast {
  id: number;
  displayName: string;
  school: School;
  message: string;
  broadcastType: BroadcastType;
  createdAt: string;
}

// ── 每日任务 ──
export interface DailyTasks {
  date: string;
  questionsDone: number;
  stagesCleared: number;
  bossesDefeated: number;
  allDone: boolean;
  claimed: boolean;
}

// ── 战斗状态 ──
export interface BattleState {
  dungeonId: string;
  stageId: string;
  questions: Question[];
  currentQuestionIndex: number;
  hp: number;
  maxHp: number;
  correctCount: number;
  wrongCount: number;
  comboCount: number;
  startTime: number;
  isBoss: boolean;
  isFinished: boolean;
  isWon: boolean;
  expEarned: number;
  goldEarned: number;
  rating: string;              // D/C/B/A/S/SS
}

// ── API 响应 ──
export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface RegisterResponse {
  success: boolean;
  player: PlayerState;
}

export interface StatusResponse {
  success: boolean;
  player: PlayerState;
  dungeons: DungeonProgress[];
  badges: string[];
  dailyTasks: DailyTasks;
}

export interface ReportResponse {
  success: boolean;
  expEarned: number;
  goldEarned: number;
  criticalHit: boolean;
  levelUp: boolean;
  newLevel?: number;
  newBadges: string[];
  rankUp: boolean;
  newTier?: number;
  newTierName?: string;
}

export interface LeaderboardResponse {
  success: boolean;
  scope: LeaderboardScope;
  type: LeaderboardType;
  entries: LeaderboardEntry[];
  playerEntry: LeaderboardEntry | null;
}

// ── 页面视图 ──
export type View =
  | 'title'
  | 'register'
  | 'map'
  | 'dungeon-preview'
  | 'battle'
  | 'boss'
  | 'reward'
  | 'profile'
  | 'leaderboard'
  | 'hall-of-fame';
