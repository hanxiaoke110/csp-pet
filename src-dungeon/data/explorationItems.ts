import type { TrialEquipmentDefinition } from '../types/exploration';

const item = (input: TrialEquipmentDefinition) => input;

export const TRIAL_EQUIPMENT: Record<string, TrialEquipmentDefinition> = {
  'xuanwu-hammer-common': item({
    id: 'xuanwu-hammer-common',
    name: '玄岩重锤',
    category: 'weapon',
    rarity: 'common',
    element: 'earth',
    icon: '/dungeon-exploration/weapons/xuanwu-hammer-common.webp',
    description: '答对题目后获得相当于最大生命 5% 的护盾。',
    scope: '本赛季智子试炼场；每场最多触发 2 次。',
  }),
  'xuanwu-hammer-rare': item({
    id: 'xuanwu-hammer-rare', name: '碧脉玄岩锤', category: 'weapon', rarity: 'rare', element: 'earth',
    icon: '/dungeon-exploration/weapons/xuanwu-hammer-rare.webp',
    description: '答对题目后获得相当于最大生命 8% 的护盾。', scope: '本赛季智子试炼场；每场最多触发 2 次。',
  }),
  'xuanwu-hammer-epic': item({
    id: 'xuanwu-hammer-epic', name: '玄甲镇岳锤', category: 'weapon', rarity: 'epic', element: 'earth',
    icon: '/dungeon-exploration/weapons/xuanwu-hammer-epic.webp',
    description: '答对后获得 10% 护盾，并使本次攻击伤害提高 10%。', scope: '本赛季智子试炼场；每场最多触发 2 次。',
  }),
  'xuanwu-hammer-legendary': item({
    id: 'xuanwu-hammer-legendary', name: '天衡·玄武光锤', category: 'weapon', rarity: 'legendary', element: 'earth',
    icon: '/dungeon-exploration/weapons/xuanwu-hammer-legendary.webp',
    description: '玄武灵脉凝成的光武。连续答对 3 题时触发镇岳冲击，本次攻击伤害提高 35%。', scope: '本赛季智子试炼场；每场最多触发 1 次。',
  }),
  'jade-spear-common': item({
    id: 'jade-spear-common', name: '青竹短枪', category: 'weapon', rarity: 'common', element: 'wind',
    icon: '/dungeon-exploration/weapons/jade-spear-common.webp',
    description: '答对题目时，本次攻击伤害提高 4%。', scope: '本赛季智子试炼场；每场最多触发 2 次。',
  }),
  'jade-spear-rare': item({
    id: 'jade-spear-rare', name: '流风碧玉枪', category: 'weapon', rarity: 'rare', element: 'wind',
    icon: '/dungeon-exploration/weapons/jade-spear-rare.webp',
    description: '答对题目时，本次攻击伤害提高 8%。', scope: '本赛季智子试炼场；每场最多触发 2 次。',
  }),
  'jade-spear-epic': item({
    id: 'jade-spear-epic', name: '穿云逐影枪', category: 'weapon', rarity: 'epic', element: 'wind',
    icon: '/dungeon-exploration/weapons/jade-spear-epic.webp',
    description: '连续答对 3 题时触发穿云追击，本次攻击伤害提高 22%。', scope: '本赛季智子试炼场；每场最多触发 2 次。',
  }),
  'jade-spear-legendary': item({
    id: 'jade-spear-legendary', name: '天穹·青鸾光枪', category: 'weapon', rarity: 'legendary', element: 'wind',
    icon: '/dungeon-exploration/weapons/jade-spear-legendary.webp',
    description: '青鸾风息凝成的光武。连续答对 3 题时触发穿云追击，本次攻击伤害提高 45%。', scope: '本赛季智子试炼场；每场最多触发 1 次。',
  }),
  'xuanwu-armor-common': item({
    id: 'xuanwu-armor-common', name: '玄岩护甲', category: 'armor', rarity: 'common', element: 'earth',
    icon: '/dungeon-exploration/armor/xuanwu-armor-common.webp',
    description: '进入战斗时获得相当于最大生命 5% 的护盾。', scope: '本赛季智子试炼场；迷宫步数排名不受影响。',
  }),
  'xuanwu-armor-rare': item({
    id: 'xuanwu-armor-rare', name: '碧水玄甲', category: 'armor', rarity: 'rare', element: 'water',
    icon: '/dungeon-exploration/armor/xuanwu-armor-rare.webp',
    description: '进入战斗时获得 8% 护盾；首次伤及生命的攻击伤害降低 10%。', scope: '本赛季智子试炼场；每场触发 1 次。',
  }),
  'xuanwu-armor-epic': item({
    id: 'xuanwu-armor-epic', name: '镇海玄鳞铠', category: 'armor', rarity: 'epic', element: 'water',
    icon: '/dungeon-exploration/armor/xuanwu-armor-epic.webp',
    description: '进入战斗时获得 10% 护盾；护盾未破时，水与地属性伤害提高 8%。', scope: '本赛季智子试炼场；只在答题战斗中生效。',
  }),
  'xuanwu-armor-legendary': item({
    id: 'xuanwu-armor-legendary', name: '不动·玄武圣铠', category: 'armor', rarity: 'legendary', element: 'earth',
    icon: '/dungeon-exploration/armor/xuanwu-armor-legendary.webp',
    description: '开场获得 12% 护盾；生命首次低于 40% 时恢复 6% 生命和 12% 护盾。', scope: '本赛季智子试炼场；每场触发 1 次。',
  }),
  'compass-common': item({
    id: 'compass-common', name: '旧铜司南', category: 'artifact', rarity: 'common',
    icon: '/dungeon-exploration/artifacts/compass-common.webp',
    description: '在普通探索中标记已经走过的岔路。', scope: '仅普通迷宫；不影响排名迷宫的视野与计步。',
  }),
  'compass-rare': item({
    id: 'compass-rare', name: '寻灵罗盘', category: 'artifact', rarity: 'rare',
    icon: '/dungeon-exploration/artifacts/compass-rare.webp',
    description: '进入迷宫时揭示最近的一个普通事件方向。', scope: '仅普通迷宫；每张地图触发 1 次。',
  }),
  'compass-epic': item({
    id: 'compass-epic', name: '星轨天仪', category: 'artifact', rarity: 'epic',
    icon: '/dungeon-exploration/artifacts/compass-epic.webp',
    description: '进入迷宫时揭示最近的宝箱或商人方向。', scope: '仅普通迷宫；不直接揭开地图。',
  }),
  'compass-legendary': item({
    id: 'compass-legendary', name: '天机·万象星盘', category: 'artifact', rarity: 'legendary', element: 'light',
    icon: '/dungeon-exploration/artifacts/compass-legendary.webp',
    description: '进入迷宫时可预览一次未探索区域内的事件类型。', scope: '本赛季普通迷宫；每张地图触发 1 次。',
  }),
  'cleansing-talisman': item({
    id: 'cleansing-talisman', name: '净化玉符', category: 'consumable', rarity: 'rare',
    icon: '/dungeon-exploration/items/cleansing-talisman.webp',
    description: '清除探索中的一个临时减益。', scope: '仅当前探索地图，使用后消耗。',
  }),
  'path-compass': item({
    id: 'path-compass', name: '探路罗盘', category: 'artifact', rarity: 'rare',
    icon: '/dungeon-exploration/items/compass.webp',
    description: '让已探索道路的轮廓更加清晰。', scope: '普通迷宫生效；每周排名迷宫不增加视野。',
  }),
};

export const RARITY_LABELS = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
} as const;

export const EQUIPMENT_CATEGORY_LABELS = {
  weapon: '武器',
  armor: '护甲',
  artifact: '法器',
  consumable: '道具',
} as const;

export function getEquipmentResetDescription(definition: TrialEquipmentDefinition): string {
  if (definition.category === 'consumable') return '使用后立即消耗；没有适用状态时无法使用。';
  if (definition.id === 'compass-common' || definition.id === 'path-compass') return '装备期间持续生效；卸下后立即暂停，不改变已经记录的步数与迷雾。';
  if (definition.category === 'artifact') return '普通迷宫内生效；单次提示每张地图只触发一次，进入另一张地图后重置。';
  if (definition.id === 'xuanwu-armor-epic') return '护盾归零时增伤暂停；下一场战斗重新获得开场护盾。';
  if (definition.id === 'xuanwu-armor-common') return '开场护盾被消耗后不再恢复；下一场战斗重置。';
  return '达到标注触发次数后本场不再触发；下一场战斗自动重置。';
}
