import { describe, it, expect } from 'vitest';
import { calculateDamage, getElementMultiplier, determineFirstAttacker, resolveEnemyIntent } from './combatLogic';
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

  it('敌方普通攻击会扣除玩家防御', () => {
    const enemy = makePet('light', 41, 27, 8);
    const player = makePet('light', 37, 25, 10);
    expect(resolveEnemyIntent({ type: 'attack', power: 41 }, enemy, player, 0)).toEqual({
      damageTaken: 16,
      remainingShield: 0,
      blocked: false,
    });
  });

  it('敌方重击扣防后保留技能倍率', () => {
    const enemy = makePet('light', 41, 27, 8);
    const player = makePet('light', 37, 25, 10);
    expect(resolveEnemyIntent({ type: 'heavy', power: 61 }, enemy, player, 0).damageTaken).toBe(36);
  });

  it('元素克制在扣防后生效', () => {
    const enemy = makePet('fire', 41, 27, 8);
    const player = makePet('wind', 37, 25, 10);
    expect(resolveEnemyIntent({ type: 'attack', power: 41 }, enemy, player, 0).damageTaken).toBe(24);
  });

  it('护盾可以完全或部分吸收伤害', () => {
    const enemy = makePet('light', 41, 27, 8);
    const player = makePet('light', 37, 25, 10);
    expect(resolveEnemyIntent({ type: 'attack', power: 41 }, enemy, player, 20)).toEqual({
      damageTaken: 0,
      remainingShield: 4,
      blocked: true,
    });
    expect(resolveEnemyIntent({ type: 'attack', power: 41 }, enemy, player, 6)).toEqual({
      damageTaken: 10,
      remainingShield: 0,
      blocked: false,
    });
  });

  it('高防御下仍保留最低 1 点伤害', () => {
    const enemy = makePet('light', 10, 5, 8);
    const player = makePet('light', 10, 99, 10);
    expect(resolveEnemyIntent({ type: 'attack', power: 10 }, enemy, player, 0).damageTaken).toBe(1);
  });
});

describe('先手判定', () => {
  it('速度快先攻', () => {
    const player = makePet('fire', 10, 5, 12);
    const enemy = makePet('water', 10, 5, 8);
    expect(determineFirstAttacker(player, enemy)).toBe('player');
  });
});
