import { describe, expect, it } from 'vitest';
import { BUNDLED_EQUIPMENT, LEGACY_TRIAL_EQUIPMENT } from './explorationItems';
import { EQUIPMENT_ELEMENTS, EQUIPMENT_RARITIES, getUpgradeCost } from './equipmentCatalog';
import { EXPLORATION_STAGE_CONFIGS } from './explorationStages';

describe('五属性装备目录', () => {
  it('新武器各有专属图标，旧装备图标保持不变', () => {
    const weapons = Object.values(BUNDLED_EQUIPMENT).filter(i => i.category === 'weapon');
    expect(new Set(weapons.map(i => i.icon)).size).toBe(20);
    for (const weapon of weapons) {
      expect(weapon.icon).toBe(LEGACY_TRIAL_EQUIPMENT[weapon.id]?.icon || `/dungeon-exploration/weapons/${weapon.id}.webp`);
    }
  });
  it('40张迷宫晶石来源覆盖全部属性，每种足够把一把传说武器和一件传说防具强化到+5', () => {
    expect(EXPLORATION_STAGE_CONFIGS).toHaveLength(40);
    for (const element of EQUIPMENT_ELEMENTS) {
      const total = EXPLORATION_STAGE_CONFIGS.flatMap(config => config.materialRewards).filter(r => r.materialId === `${element}-crystal`).reduce((sum, r) => sum + r.amount, 0);
      expect(total).toBeGreaterThanOrEqual(120);
    }
  });
  it('每个武器品级有五种属性，共20把', () => {
    for (const rarity of EQUIPMENT_RARITIES) {
      const weapons = Object.values(BUNDLED_EQUIPMENT).filter(i => i.category === 'weapon' && i.rarity === rarity);
      expect(weapons.map(i => i.element).sort()).toEqual([...EQUIPMENT_ELEMENTS].sort());
    }
  });
  it('有15件可购买护甲，另保留旧普通护甲', () => {
    expect(Object.values(BUNDLED_EQUIPMENT).filter(i => i.category === 'armor' && i.shopAvailable)).toHaveLength(15);
    for (const id of Object.keys(LEGACY_TRIAL_EQUIPMENT)) expect(BUNDLED_EQUIPMENT[id]).toBeDefined();
  });
  it('35件商店装备各有专属图标，不用换色图标代替不同装备', () => {
    const items = Object.values(BUNDLED_EQUIPMENT).filter(i => i.shopAvailable);
    expect(new Set(items.map(i => i.icon)).size).toBe(35);
  });
  it('价格和升级条件明确，满级不可继续升级', () => {
    const item = BUNDLED_EQUIPMENT['fire-weapon-legendary'];
    expect(item.price).toBe(950);
    expect(getUpgradeCost(item, 0)).toEqual({ coins: 70, materialId: 'fire-crystal', materials: 4 });
    expect(getUpgradeCost(item, 5)).toBeNull();
  });
});
