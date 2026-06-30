import { describe, it, expect } from 'vitest';
import { calculateDamage, getElementMultiplier, determineFirstAttacker } from './combatLogic';
import { PetElement } from '../../src/types/pet';

const makePet = (element: PetElement, attack: number, defense: number, speed: number) => ({
  maxHp: 100, currentHp: 100, attack, defense, speed, element, level: 1,
});

describe('元素克制', () => {
  it('火克风', () => {
    expect(getElementMultiplier('fire', 'wind')).toBe(1.5);
  });
  it('火被水克', () => {
    expect(getElementMultiplier('fire', 'water')).toBe(0.7);
  });
  it('光无克制', () => {
    expect(getElementMultiplier('light', 'fire')).toBe(1.0);
  });
});

describe('伤害计算', () => {
  it('基础伤害', () => {
    const attacker = makePet('fire', 20, 5, 10);
    const defender = makePet('wind', 10, 5, 8);
    const dmg = calculateDamage(attacker, defender, 1.0, 1.0);
    expect(dmg).toBeGreaterThan(0);
  });
});

describe('先手判定', () => {
  it('速度快先攻', () => {
    const player = makePet('fire', 10, 5, 12);
    const enemy = makePet('water', 10, 5, 8);
    expect(determineFirstAttacker(player, enemy)).toBe('player');
  });
});
