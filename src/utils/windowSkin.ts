export type WindowSkin =
  | 'default'
  | 'academy'
  | 'observatory'
  | 'crystal'
  | 'verdant'
  | 'skyline'
  | 'cloud'
  | 'tianji'
  | 'shushu'
  | 'lingma'
  | 'wanmu'
  | 'suanfa'
  | 'tiansuan'
  | 'qianlong';

export type WindowSkinCategory = 'basic' | 'learning' | 'trial';
export type WindowSkinUnlock =
  | { type: 'default' }
  | { type: 'weekly'; target: number }
  | { type: 'correct'; target: number }
  | { type: 'course'; target: number }
  | { type: 'streak'; target: number }
  | { type: 'review'; target: number }
  | { type: 'dungeon'; dungeonId: string; dungeonName: string };

export interface WindowSkinDefinition {
  id: WindowSkin;
  name: string;
  description: string;
  image?: string;
  category: WindowSkinCategory;
  unlock: WindowSkinUnlock;
}

export interface WindowSkinMetrics {
  weeklyCompletions: number;
  totalCorrect: number;
  completedCourses: number;
  freeStreak: number;
  monthlyReviews: number;
  defeatedDungeons: ReadonlySet<string>;
}

export interface WindowSkinProgress {
  current: number;
  target: number;
  unlocked: boolean;
  label: string;
}

export const WINDOW_SKINS: ReadonlyArray<WindowSkinDefinition> = [
  { id: 'default', name: '简洁', description: '清爽浅色背景', category: 'basic', unlock: { type: 'default' } },
  {
    id: 'academy', name: '智域穹庭', description: '明亮科幻学院',
    image: '/dungeon-art/dungeon-01-bg.webp', category: 'basic', unlock: { type: 'default' },
  },
  {
    id: 'observatory', name: '星律观测厅', description: '金色机械星穹',
    image: '/dungeon-art/dungeon-02-bg.webp', category: 'learning', unlock: { type: 'weekly', target: 1 },
  },
  {
    id: 'crystal', name: '蓝晶秘境', description: '幽蓝晶石洞窟',
    image: '/dungeon-art/dungeon-03-bg.webp', category: 'learning', unlock: { type: 'correct', target: 30 },
  },
  {
    id: 'verdant', name: '翠芯遗迹', description: '自然能量工坊',
    image: '/dungeon-art/dungeon-04-bg.webp', category: 'learning', unlock: { type: 'course', target: 5 },
  },
  {
    id: 'skyline', name: '浮空矩阵', description: '云端机械城邦',
    image: '/dungeon-art/dungeon-05-bg.webp', category: 'learning', unlock: { type: 'streak', target: 10 },
  },
  {
    id: 'cloud', name: '云海演算台', description: '明净天空竞技场',
    image: '/dungeon-art/dungeon-06-bg.webp', category: 'learning', unlock: { type: 'review', target: 1 },
  },
  {
    id: 'tianji', name: '天机雪关', description: '雪岭古关与天文机关',
    image: '/dungeon-art-v2/dungeon-01-bg.webp', category: 'trial',
    unlock: { type: 'dungeon', dungeonId: 'dungeon-01', dungeonName: '天机阁' },
  },
  {
    id: 'shushu', name: '数术玄门', description: '山腹中的数术秘殿',
    image: '/dungeon-art-v2/dungeon-02-bg.webp', category: 'trial',
    unlock: { type: 'dungeon', dungeonId: 'dungeon-02', dungeonName: '数术殿' },
  },
  {
    id: 'lingma', name: '灵码悬城', description: '绝壁古城与灵码回廊',
    image: '/dungeon-art-v2/dungeon-03-bg.webp', category: 'trial',
    unlock: { type: 'dungeon', dungeonId: 'dungeon-03', dungeonName: '灵码洞' },
  },
  {
    id: 'wanmu', name: '万木秘苑', description: '雨林深处的机关书院',
    image: '/dungeon-art-v2/dungeon-04-bg.webp', category: 'trial',
    unlock: { type: 'dungeon', dungeonId: 'dungeon-04', dungeonName: '万木林' },
  },
  {
    id: 'suanfa', name: '算法云阙', description: '云海古塔与演算天桥',
    image: '/dungeon-art-v2/dungeon-05-bg.webp', category: 'trial',
    unlock: { type: 'dungeon', dungeonId: 'dungeon-05', dungeonName: '算法塔' },
  },
  {
    id: 'tiansuan', name: '天算星台', description: '星穹之上的古代观象台',
    image: '/dungeon-art-v2/dungeon-06-bg.webp', category: 'trial',
    unlock: { type: 'dungeon', dungeonId: 'dungeon-06', dungeonName: '天算台' },
  },
  {
    id: 'qianlong', name: '潜龙天域', description: '潜龙觉醒后的终极天域',
    image: '/dungeon-art-v2/dungeon-08-bg.webp', category: 'trial',
    unlock: { type: 'dungeon', dungeonId: 'dungeon-08', dungeonName: '潜龙觉醒' },
  },
];

export const WINDOW_SKIN_STORAGE_KEY = 'csp_window_skin';
export const WINDOW_SKIN_CHANGE_EVENT = 'csp-window-skin-change';
export const WINDOW_SKIN_UNLOCKED_KEY = 'csp_unlocked_window_skins';

export function getWindowSkinProgress(
  skin: WindowSkinDefinition,
  metrics: WindowSkinMetrics,
): WindowSkinProgress {
  const unlock = skin.unlock;
  if (unlock.type === 'default') {
    return { current: 1, target: 1, unlocked: true, label: '默认获得' };
  }
  if (unlock.type === 'weekly') {
    const current = metrics.weeklyCompletions;
    return {
      current, target: unlock.target, unlocked: current >= unlock.target,
      label: `完成 ${unlock.target} 次每周任务`,
    };
  }
  if (unlock.type === 'correct') {
    const current = metrics.totalCorrect;
    return {
      current, target: unlock.target, unlocked: current >= unlock.target,
      label: `自由练习累计答对 ${unlock.target} 题`,
    };
  }
  if (unlock.type === 'course') {
    const current = metrics.completedCourses;
    return {
      current, target: unlock.target, unlocked: current >= unlock.target,
      label: `完成 ${unlock.target} 道课程验证题`,
    };
  }
  if (unlock.type === 'streak') {
    const current = metrics.freeStreak;
    return {
      current, target: unlock.target, unlocked: current >= unlock.target,
      label: `自由练习连续答对 ${unlock.target} 题`,
    };
  }
  if (unlock.type === 'review') {
    const current = metrics.monthlyReviews;
    return {
      current, target: unlock.target, unlocked: current >= unlock.target,
      label: `完成 ${unlock.target} 次月度复盘`,
    };
  }
  const unlocked = metrics.defeatedDungeons.has(unlock.dungeonId);
  return {
    current: unlocked ? 1 : 0,
    target: 1,
    unlocked,
    label: `击败「${unlock.dungeonName}」Boss`,
  };
}

export function collectUnlockedWindowSkins(
  existing: Iterable<WindowSkin>,
  metrics: WindowSkinMetrics,
): WindowSkin[] {
  const unlocked = new Set<WindowSkin>(existing);
  unlocked.add('default');
  unlocked.add('academy');
  for (const skin of WINDOW_SKINS) {
    if (getWindowSkinProgress(skin, metrics).unlocked) unlocked.add(skin.id);
  }
  return WINDOW_SKINS.filter(skin => unlocked.has(skin.id)).map(skin => skin.id);
}

export function loadUnlockedWindowSkins(): WindowSkin[] {
  const known = new Set(WINDOW_SKINS.map(skin => skin.id));
  const unlocked = new Set<WindowSkin>(['default', 'academy']);
  try {
    const saved = JSON.parse(localStorage.getItem(WINDOW_SKIN_UNLOCKED_KEY) || '[]');
    if (Array.isArray(saved)) {
      saved.forEach(id => { if (known.has(id)) unlocked.add(id); });
    }
    // Preserve the theme already selected before the collection system existed.
    const current = localStorage.getItem(WINDOW_SKIN_STORAGE_KEY);
    if (current && known.has(current as WindowSkin)) unlocked.add(current as WindowSkin);
  } catch {}
  return WINDOW_SKINS.filter(skin => unlocked.has(skin.id)).map(skin => skin.id);
}

export function saveUnlockedWindowSkins(skins: Iterable<WindowSkin>) {
  try {
    localStorage.setItem(WINDOW_SKIN_UNLOCKED_KEY, JSON.stringify([...skins]));
  } catch {}
}

export function getWindowSkin(): WindowSkin {
  try {
    const saved = localStorage.getItem(WINDOW_SKIN_STORAGE_KEY);
    return WINDOW_SKINS.some(skin => skin.id === saved) ? saved as WindowSkin : 'academy';
  } catch {
    return 'academy';
  }
}

export function setWindowSkin(skin: WindowSkin) {
  try {
    localStorage.setItem(WINDOW_SKIN_STORAGE_KEY, skin);
  } catch {}

  window.dispatchEvent(new CustomEvent<WindowSkin>(WINDOW_SKIN_CHANGE_EVENT, {
    detail: skin,
  }));
}
