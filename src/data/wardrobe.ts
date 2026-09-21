import type { WardrobeItem } from '../types/profile';

const zodiac = [
  ['rat', '灵鼠'], ['ox', '星牛'], ['tiger', '曜虎'], ['rabbit', '月兔'],
  ['dragon', '青龙'], ['snake', '灵蛇'], ['horse', '逐风马'], ['goat', '云羊'],
  ['monkey', '慧猴'], ['rooster', '晨光鸡'], ['dog', '守星犬'], ['pig', '福气猪'],
] as const;

const constellations = [
  ['aries', '白羊座'], ['taurus', '金牛座'], ['gemini', '双子座'], ['cancer', '巨蟹座'],
  ['leo', '狮子座'], ['virgo', '处女座'], ['libra', '天秤座'], ['scorpio', '天蝎座'],
  ['sagittarius', '射手座'], ['capricorn', '摩羯座'], ['aquarius', '水瓶座'], ['pisces', '双鱼座'],
] as const;

const interactiveAvatar = (group: 'zodiac' | 'constellation', slug: string) => ({
  type: 'direction-grid' as const,
  atlas: `/profile/avatars-interactive/${group}/${slug}-atlas.webp`,
  columns: 5 as const,
  rows: 5 as const,
  clickReaction: 'squash-bounce' as const,
});

export const PROFILE_AVATARS: WardrobeItem[] = [
  ...zodiac.map(([slug, name]) => ({
    id: `avatar-zodiac-${slug}`, version: 2, category: 'avatar' as const, name, rarity: 'rare' as const,
    acquisition: { type: 'coin' as const, price: 300 }, group: 'zodiac' as const,
    asset: `/profile/avatars/zodiac/${slug}.webp`,
    interaction: interactiveAvatar('zodiac', slug),
  })),
  ...constellations.map(([slug, name]) => ({
    id: `avatar-constellation-${slug}`, version: 2, category: 'avatar' as const, name, rarity: 'rare' as const,
    acquisition: { type: 'coin' as const, price: 300 }, group: 'constellation' as const,
    asset: `/profile/avatars/constellation/${slug}.webp`,
    interaction: interactiveAvatar('constellation', slug),
  })),
];

export const WARDROBE_ITEMS: WardrobeItem[] = [
  ...PROFILE_AVATARS,
  { id: 'frame-none', version: 1, category: 'frame', name: '清澈星环', rarity: 'common', acquisition: { type: 'free' }, preview: 'plain' },
  { id: 'frame-gold-orbit', version: 1, category: 'frame', name: '鎏金轨道', rarity: 'rare', acquisition: { type: 'coin', price: 480 }, preview: 'gold', asset: '/wardrobe/founders/frames/gold-orbit.webp' },
  { id: 'frame-crystal-trial', version: 1, category: 'frame', name: '试炼晶冕', rarity: 'epic', acquisition: { type: 'condition', description: '在智子试炼场商店获得', rule: 'dungeon-crystal' }, preview: 'crystal', asset: '/wardrobe/founders/frames/crystal-trial.webp' },
  { id: 'frame-scholar', version: 1, category: 'frame', name: '博学桂冠', rarity: 'legendary', acquisition: { type: 'condition', description: '累计答对 100 道选择题', achievementId: 'quiz-total-100', legacyAchievementIds: ['course-30'] }, preview: 'scholar', asset: '/wardrobe/founders/frames/scholar.webp' },
  { id: 'frame-aurora', version: 1, category: 'frame', name: '极境星虹', rarity: 'mythic', acquisition: { type: 'condition', description: '解锁成就「双重完美」', achievementId: 'super-double' }, preview: 'aurora', asset: '/wardrobe/founders/frames/aurora.webp' },
  { id: 'background-midnight', version: 1, category: 'background', name: '静谧星夜', rarity: 'common', acquisition: { type: 'free' }, preview: 'midnight', asset: '/wardrobe/founders/backgrounds/midnight.webp' },
  { id: 'background-sunrise', version: 1, category: 'background', name: '破晓云海', rarity: 'rare', acquisition: { type: 'coin', price: 360 }, preview: 'sunrise', asset: '/wardrobe/founders/backgrounds/sunrise.webp' },
  { id: 'background-tide', version: 1, category: 'background', name: '深海月潮', rarity: 'rare', acquisition: { type: 'coin', price: 360 }, preview: 'tide', asset: '/wardrobe/founders/backgrounds/tide.webp' },
  { id: 'background-gallery', version: 1, category: 'background', name: '典藏长廊', rarity: 'epic', acquisition: { type: 'condition', description: '永久收藏 2 张典藏卡', rule: 'two-cards' }, preview: 'gallery', asset: '/wardrobe/founders/backgrounds/gallery.webp' },
  { id: 'pendant-none', version: 1, category: 'pendant', name: '不佩戴挂件', rarity: 'common', acquisition: { type: 'free' }, preview: 'none' },
  { id: 'pendant-pencil', version: 1, category: 'pendant', name: '灵感铅笔', rarity: 'rare', acquisition: { type: 'condition', description: '完成 5 次每周任务', achievementId: 'quiz-weekly-5', legacyAchievementIds: ['course-10'] }, preview: 'pencil', asset: '/wardrobe/founders/pendants/pencil.webp' },
  { id: 'pendant-moon', version: 1, category: 'pendant', name: '月光铃', rarity: 'rare', acquisition: { type: 'coin', price: 260 }, preview: 'moon', asset: '/wardrobe/founders/pendants/moon-bell.webp' },
  { id: 'effect-none', version: 1, category: 'effect', name: '无特效', rarity: 'common', acquisition: { type: 'free' }, preview: 'none' },
  { id: 'effect-stardust', version: 1, category: 'effect', name: '星尘呼吸', rarity: 'epic', acquisition: { type: 'coin', price: 680 }, preview: 'stardust' },
  { id: 'effect-perfect', version: 1, category: 'effect', name: '完美回响', rarity: 'legendary', acquisition: { type: 'condition', description: '完成 5 次满分周挑战', achievementId: 'quiz-perfect-5' }, preview: 'perfect' },
  { id: 'title-apprentice', version: 1, category: 'title', name: '星途见习生', rarity: 'common', acquisition: { type: 'free' } },
  { id: 'title-course', version: 1, category: 'title', name: '万卷星河', rarity: 'rare', acquisition: { type: 'condition', description: '超级挑战获得一次满分', achievementId: 'super-5of5', legacyAchievementIds: ['course-30'] } },
  { id: 'title-companion', version: 1, category: 'title', name: '万灵挚友', rarity: 'epic', acquisition: { type: 'condition', description: '与任意智子好感达到 100', achievementId: 'pet-affection' } },
  { id: 'title-perfect', version: 1, category: 'title', name: '极境解题者', rarity: 'legendary', acquisition: { type: 'condition', description: '完成一次超级挑战满分', achievementId: 'super-5of5' } },
  { id: 'title-wealth', version: 1, category: 'title', name: '银河大富翁', rarity: 'mythic', acquisition: { type: 'condition', description: '历史最高金币达到 10000', achievementId: 'pet-coins-10000' } },
];

export const WARDROBE_BY_ID = new Map(WARDROBE_ITEMS.map(item => [item.id, item]));
export function registerWardrobeItems(items: WardrobeItem[]): void {
  for (const item of items) WARDROBE_BY_ID.set(item.id, item);
}
export const DEFAULT_OWNED_WARDROBE = ['frame-none', 'background-midnight', 'pendant-none', 'effect-none', 'title-apprentice'];
