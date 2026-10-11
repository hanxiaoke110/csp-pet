import type { EquipmentCombatEffects, EquipmentElement, EquipmentRarity, TrialEquipmentDefinition } from '../types/exploration';

export const EQUIPMENT_ELEMENTS: EquipmentElement[] = ['earth', 'fire', 'wind', 'water', 'light'];
export const EQUIPMENT_RARITIES: EquipmentRarity[] = ['common', 'rare', 'epic', 'legendary'];
export const ELEMENT_NAMES: Record<EquipmentElement, string> = { earth: '地', fire: '火', wind: '风', water: '水', light: '光' };
export const ELEMENT_COUNTERS: Record<EquipmentElement, EquipmentElement> = { fire: 'wind', wind: 'earth', earth: 'water', water: 'light', light: 'fire' };
const PRICES = [100, 220, 380, 950];
const WEAPON_NAMES: Record<EquipmentElement, string[]> = {
  earth: ['玄岩重锤', '碧脉玄岩锤', '玄甲镇岳锤', '天衡·玄武光锤'],
  wind: ['青竹短枪', '流风碧玉枪', '穿云逐影枪', '天穹·青鸾光枪'],
  fire: ['赤焰短刃', '熔火双刃', '烬羽战镰', '焚天·金乌日轮'],
  water: ['涟漪法杖', '寒潮长弓', '霜华战戟', '沧海·玄鲸月刃'],
  light: ['星砂权杖', '晨光细剑', '曜星战环', '破晓·天穹圣弩'],
};
const ARMOR_NAMES: Record<EquipmentElement, string[]> = {
  earth: ['磐岩护袍', '镇岳战甲', '不动·玄武圣铠'],
  fire: ['烛火羽衣', '赤霄战袍', '不灭·金乌圣衣'],
  wind: ['轻岚披风', '逐影风衣', '九霄·青鸾羽铠'],
  water: ['碧水玄甲', '镇海玄鳞铠', '深蓝·沧澜圣甲'],
  light: ['晨星斗篷', '辉耀礼装', '永昼·星河圣衣'],
};

export const LEGACY_WEAPON_EFFECTS: Record<string, Partial<EquipmentCombatEffects>> = {
  'xuanwu-hammer-common': { correctShieldRatio: .05, correctShieldLimit: 2 },
  'xuanwu-hammer-rare': { correctShieldRatio: .08, correctShieldLimit: 2 },
  'xuanwu-hammer-epic': { correctShieldRatio: .1, correctShieldLimit: 2, nextAttackBoost: .1 },
  'xuanwu-hammer-legendary': { comboThreeBoost: .35, comboThreeLimit: 1 },
  'jade-spear-common': { nextAttackBoost: .04, correctShieldLimit: 2 },
  'jade-spear-rare': { nextAttackBoost: .08, correctShieldLimit: 2 },
  'jade-spear-epic': { comboThreeBoost: .22, comboThreeLimit: 2 },
  'jade-spear-legendary': { comboThreeBoost: .45, comboThreeLimit: 1 },
};
export const LEGACY_ARMOR_EFFECTS: Record<string, Partial<EquipmentCombatEffects>> = {
  'xuanwu-armor-common': { initialShieldRatio: .05 },
  'xuanwu-armor-rare': { initialShieldRatio: .08, firstHpHitReduction: .1 },
  'xuanwu-armor-epic': { initialShieldRatio: .1, shieldedElementBoost: .08 },
  'xuanwu-armor-legendary': { initialShieldRatio: .12, lowHpShieldRatio: .12, lowHpHealRatio: .06 },
};

/** Stable definitions; the old common armor stays as an additional compatibility item. */
export function buildEquipmentCatalog(legacy: Record<string, TrialEquipmentDefinition>): Record<string, TrialEquipmentDefinition> {
  const result = Object.fromEntries(Object.entries(legacy).map(([id, item]) => [id, {
    ...item, combatEffects: LEGACY_WEAPON_EFFECTS[id] || LEGACY_ARMOR_EFFECTS[id], shopAvailable: false,
  }]));
  for (const element of EQUIPMENT_ELEMENTS) {
    EQUIPMENT_RARITIES.forEach((rarity, index) => {
      const id = element === 'earth' ? `xuanwu-hammer-${rarity}` : element === 'wind' ? `jade-spear-${rarity}` : `${element}-weapon-${rarity}`;
      const special: Partial<EquipmentCombatEffects> = index >= 2
        ? { comboThreeBoost: index === 3 ? .35 : .2, comboThreeLimit: 1 }
        : { nextAttackBoost: index === 1 ? .08 : .04, correctShieldLimit: 2 };
      result[id] = {
        id, name: WEAPON_NAMES[element][index], category: 'weapon', rarity, element,
        icon: legacy[id]?.icon || `/dungeon-exploration/weapons/jade-spear-${rarity}.webp`,
        description: legacy[id]?.description || (index >= 2 ? `连续答对3题，本次额外增伤${index === 3 ? 35 : 20}%，每场1次。` : `答对时本次额外增伤${index === 1 ? 8 : 4}%，每场2次。`),
        scope: '试炼场战斗生效；特殊效果下一场重置。',
        price: PRICES[index], attack: [1, 2, 4, 6][index],
        combatEffects: LEGACY_WEAPON_EFFECTS[id] || special, shopAvailable: true,
      };
    });
    EQUIPMENT_RARITIES.slice(1).forEach((rarity, index) => {
      const id = element === 'water' && index < 2 ? `xuanwu-armor-${rarity}`
        : element === 'earth' && rarity === 'legendary' ? 'xuanwu-armor-legendary' : `${element}-armor-${rarity}`;
      result[id] = {
        id, name: ARMOR_NAMES[element][index], category: 'armor', rarity, element,
        icon: legacy[id]?.icon || `/dungeon-exploration/armor/xuanwu-armor-${rarity}.webp`,
        description: legacy[id]?.description || `开场获得${[8, 10, 12][index]}%最大生命护盾，每场1次。`,
        scope: '试炼场战斗生效；开场效果下一场重置。',
        price: PRICES[index + 1], defense: [1, 3, 5][index],
        combatEffects: LEGACY_ARMOR_EFFECTS[id] || { initialShieldRatio: [.08, .1, .12][index] },
        shopAvailable: true,
      };
    });
  }
  return result;
}

export const UPGRADE_COSTS: Record<EquipmentRarity, number[]> = {
  common: [20, 30, 45, 65, 90], rare: [30, 45, 65, 95, 135],
  epic: [45, 65, 95, 140, 200], legendary: [70, 100, 145, 210, 300],
};
export function getUpgradeCost(item: TrialEquipmentDefinition, level: number) {
  if (!Number.isInteger(level) || level < 0 || level >= 5 || !['weapon', 'armor'].includes(item.category)) return null;
  return { coins: UPGRADE_COSTS[item.rarity][level], materialId: `${item.element || 'earth'}-crystal`, materials: (level + 1) * (EQUIPMENT_RARITIES.indexOf(item.rarity) + 1) };
}
