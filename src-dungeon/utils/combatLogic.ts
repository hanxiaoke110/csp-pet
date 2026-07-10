import { PetElement } from '../../src/types/pet';
import type { EnemyIntent, BurnStack } from '../types/dungeon';

export interface CombatPet {
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  speed: number;
  element: PetElement;
  level: number;
}

export const ELEMENT_ADVANTAGE: Record<PetElement, Partial<Record<PetElement, number>>> = {
  fire:  { wind: 1.5, water: 0.7 },
  wind:  { earth: 1.5, fire: 0.7 },
  earth: { water: 1.5, wind: 0.7 },
  water: { fire: 1.5, earth: 0.7 },
  light: {},
};

export function getElementMultiplier(attacker: PetElement, defender: PetElement): number {
  return ELEMENT_ADVANTAGE[attacker]?.[defender] ?? 1.0;
}

/**
 * 计算伤害，支持连击加成。
 * @param comboCount 当前连击数，每级 +10%，上限 50%（combo 5）
 */
export function calculateDamage(
  attacker: CombatPet,
  defender: CombatPet,
  skillMultiplier: number,
  answerQuality: number,
  comboCount: number = 0
): number {
  const raw = attacker.attack * skillMultiplier - defender.defense;
  const elementMultiplier = getElementMultiplier(attacker.element, defender.element);
  const comboMultiplier = 1 + Math.min(comboCount * 0.1, 0.5);
  const damage = Math.max(1, Math.floor(raw * elementMultiplier * answerQuality * comboMultiplier));
  return damage;
}

export function calculateStats(
  base: { maxHp: number; attack: number; defense: number; speed: number },
  tierMultiplier: number,
  level: number
): Omit<CombatPet, 'currentHp' | 'element'> {
  return {
    maxHp: Math.floor(base.maxHp * tierMultiplier * Math.pow(1.1, level - 1)),
    attack: Math.floor(base.attack * tierMultiplier * Math.pow(1.1, level - 1)),
    defense: Math.floor(base.defense * tierMultiplier * Math.pow(1.1, level - 1)),
    speed: Math.floor(base.speed * tierMultiplier * Math.pow(1.05, level - 1)),
    level,
  };
}

export function determineFirstAttacker(player: CombatPet, enemy: CombatPet): 'player' | 'enemy' {
  return player.speed >= enemy.speed ? 'player' : 'enemy';
}

/**
 * 生成敌方下回合意图。
 * 普通攻击 60%、蓄力重击 25%、防御姿态 15%。
 * 玩家低血量时更倾向重击，敌方低血量时更倾向防御。
 */
export function generateEnemyIntent(
  enemyHpRatio: number,
  playerHpRatio: number,
  baseAttack: number
): EnemyIntent {
  const rand = Math.random();

  // 根据血量调整概率
  let attackWeight = 60;
  let heavyWeight = 25;
  let defendWeight = 15;

  if (playerHpRatio < 0.3) {
    heavyWeight += 20;
    attackWeight -= 20;
  }
  if (enemyHpRatio < 0.3) {
    defendWeight += 25;
    attackWeight -= 25;
  }

  const total = attackWeight + heavyWeight + defendWeight;
  const attackThreshold = attackWeight / total;
  const heavyThreshold = (attackWeight + heavyWeight) / total;

  if (rand < attackThreshold) {
    return { type: 'attack', power: baseAttack };
  }
  if (rand < heavyThreshold) {
    return { type: 'heavy', power: Math.floor(baseAttack * 1.5) };
  }
  return { type: 'defend', power: 0.5 };
}

/**
 * 执行敌方意图，计算对我方造成的伤害。
 * @param shield 当前护盾值
 * @returns 实际扣血和剩余护盾
 */
export function resolveEnemyIntent(
  intent: EnemyIntent,
  enemy: CombatPet,
  player: CombatPet,
  shield: number
): { damageTaken: number; remainingShield: number; blocked: boolean } {
  if (intent.type === 'defend') {
    return { damageTaken: 0, remainingShield: shield, blocked: false };
  }

  // 敌方伤害先扣除玩家防御力（与 calculateDamage 公式一致：attack - defense），
  // 再乘元素克制。修复前直接用 intent.power 跳过防御，导致后期副本被一击秒杀。
  const rawDamage = Math.max(1, intent.power - player.defense);
  const elementMultiplier = getElementMultiplier(enemy.element, player.element);
  const damageBeforeShield = Math.max(1, Math.floor(rawDamage * elementMultiplier));

  if (shield >= damageBeforeShield) {
    return {
      damageTaken: 0,
      remainingShield: shield - damageBeforeShield,
      blocked: true,
    };
  }

  const damageTaken = damageBeforeShield - shield;
  return { damageTaken, remainingShield: 0, blocked: false };
}

/**
 * 计算护盾值：答对给 25% 最大 HP，答错给 8%。
 */
export function calculateShieldAmount(maxHp: number, isCorrect: boolean): number {
  return Math.floor(maxHp * (isCorrect ? 0.25 : 0.08));
}

/**
 * 计算灼烧伤害。
 */
export function tickBurnStacks(stacks: BurnStack[]): { totalDamage: number; remaining: BurnStack[] } {
  let totalDamage = 0;
  const remaining: BurnStack[] = [];

  for (const stack of stacks) {
    totalDamage += stack.damage;
    if (stack.turnsRemaining > 1) {
      remaining.push({ ...stack, turnsRemaining: stack.turnsRemaining - 1 });
    }
  }

  return { totalDamage, remaining };
}
