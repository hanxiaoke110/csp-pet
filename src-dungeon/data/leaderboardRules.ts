import type { LeaderboardType } from '../types/dungeon';

export type VisibleLeaderboardType = Extract<
  LeaderboardType,
  'power' | 'streak' | 'progress' | 'warrior' | 'wins' | 'ss_count'
>;

export interface LeaderboardRuleItem {
  key: VisibleLeaderboardType;
  label: string;
  description: string;
}

export interface LeaderboardRulesConfig {
  version: number;
  title: string;
  rules: LeaderboardRuleItem[];
  ssCriteria: string[];
  footer: string;
  updatedAt?: string;
}

export const DEFAULT_LEADERBOARD_RULES: LeaderboardRulesConfig = {
  version: 1,
  title: '排行榜与 SS 评价规则',
  rules: [
    { key: 'power', label: '段位积分', description: '有奖励次数内，普通答对 +10，暴击答对 +20；战术流派每次答对再 +2。重打冲评级不增加积分。' },
    { key: 'streak', label: '最高连击', description: '统计一次战斗中连续答对的最高题数。' },
    { key: 'progress', label: '通关副本', description: '统计本赛季已通关的不同副本数量。' },
    { key: 'warrior', label: '勇者积分', description: '每场有效胜利 +10；S 评价再 +15，SS 评价再 +30。' },
    { key: 'wins', label: '赛季首胜', description: '统计获得奖励的有效胜利场次；同一关重复获胜不重复累计。' },
    { key: 'ss_count', label: 'SS评价副本', description: '统计拿到过 SS 最佳评价的不同副本数量，不是单独的新副本。' },
  ],
  ssCriteria: [
    '本场全部答对',
    '战斗结束时剩余生命不少于 70%',
    '本场使用 4 种不同技能',
    '在目标回合内获胜（普通关 20 回合，Boss 战 30 回合）',
  ],
  footer: '每周默认有 5 次奖励挑战，可在试炼补给中购买额外次数；无奖励重打不增加段位、连击、勇者或首胜数据，但仍可刷新副本最佳评级（含 SS）。',
};

const API_URL = 'https://api.cspstudy.top/api/dungeon/leaderboard-rules';
const CACHE_KEY = 'dungeon_leaderboard_rules_v1';
const CACHE_TTL = 6 * 60 * 60 * 1000;
const RULE_KEYS = DEFAULT_LEADERBOARD_RULES.rules.map(rule => rule.key);

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : fallback;
}

export function normalizeLeaderboardRules(value: unknown): LeaderboardRulesConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<LeaderboardRulesConfig>
    : {};
  const incoming = new Map(
    Array.isArray(source.rules)
      ? source.rules
          .filter(rule => rule && typeof rule === 'object')
          .map(rule => [(rule as LeaderboardRuleItem).key, rule as Partial<LeaderboardRuleItem>])
      : [],
  );

  const rules = DEFAULT_LEADERBOARD_RULES.rules.map(fallback => {
    const rule = incoming.get(fallback.key);
    return {
      key: fallback.key,
      label: cleanText(rule?.label, fallback.label, 40),
      description: cleanText(rule?.description, fallback.description, 500),
    };
  });
  const criteria = Array.isArray(source.ssCriteria)
    ? source.ssCriteria
        .map(item => cleanText(item, '', 300))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  return {
    version: Number.isFinite(Number(source.version)) ? Number(source.version) : 1,
    title: cleanText(source.title, DEFAULT_LEADERBOARD_RULES.title, 80),
    rules: rules.filter(rule => RULE_KEYS.includes(rule.key)),
    ssCriteria: criteria.length ? criteria : DEFAULT_LEADERBOARD_RULES.ssCriteria,
    footer: cleanText(source.footer, DEFAULT_LEADERBOARD_RULES.footer, 800),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
  };
}

interface CachedRules {
  fetchedAt: number;
  data: LeaderboardRulesConfig;
}

function readCache(): CachedRules | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as CachedRules | null;
    if (!cached || !Number.isFinite(cached.fetchedAt)) return null;
    return { fetchedAt: cached.fetchedAt, data: normalizeLeaderboardRules(cached.data) };
  } catch {
    return null;
  }
}

export async function loadLeaderboardRules(): Promise<LeaderboardRulesConfig> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { rules?: unknown };
    const data = normalizeLeaderboardRules(payload.rules);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
    } catch { /* storage may be unavailable */ }
    return data;
  } catch {
    return cached?.data || DEFAULT_LEADERBOARD_RULES;
  }
}
