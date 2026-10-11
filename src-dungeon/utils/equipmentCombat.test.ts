import { describe, expect, it } from 'vitest';
import { applyWeaponDamage, applyArmorReduction } from './equipmentCombat';
import { EQUIPMENT_ELEMENTS, ELEMENT_COUNTERS } from '../data/equipmentCatalog';
import { calculateDamage, resolveEnemyIntent, type CombatPet } from './combatLogic';

describe('装备独立属性公式', () => {
  it.each([[0, 105], [1, 110], [2, 115], [3, 120], [4, 125], [5, 130]])('武器+%i中立100伤害变成%i', (level, expected) => {
    expect(applyWeaponDamage(100, { element: 'fire', level }, 'earth')).toBe(expected);
  });
  it.each([[0, 90], [1, 86], [2, 82], [3, 78], [4, 74], [5, 70]])('防具+%i克制100伤害变成%i', (level, expected) => {
    expect(applyArmorReduction(100, { element: 'fire', level }, 'wind')).toBe(expected);
  });
  it('五种克制均乘120%，防具中立无额外减伤，未装备无加成', () => {
    for (const element of EQUIPMENT_ELEMENTS) {
      expect(applyWeaponDamage(100, { element, level: 0 }, ELEMENT_COUNTERS[element])).toBe(126);
      expect(applyArmorReduction(100, { element, level: 5 }, element)).toBe(100);
    }
    expect(applyWeaponDamage(100, undefined, 'wind')).toBe(100);
    expect(applyArmorReduction(100, undefined, 'wind')).toBe(100);
  });
  it('伙伴元素不再重复加成，防具减伤先于护盾', () => {
    const player: CombatPet = { maxHp: 100, currentHp: 100, attack: 110, defense: 10, speed: 10, element: 'fire', level: 1 };
    const enemy = { ...player, element: 'wind' as const };
    expect(calculateDamage(player, enemy, 1, 1)).toBe(100);
    expect(resolveEnemyIntent({ type: 'attack', power: 110 }, enemy, player, 20, .7)).toMatchObject({ damageTaken: 50, remainingShield: 0 });
  });
});
