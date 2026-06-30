import { PetElement } from '../../src/types/pet';

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

export function calculateDamage(
  attacker: CombatPet,
  defender: CombatPet,
  skillMultiplier: number,
  answerQuality: number
): number {
  const raw = attacker.attack * skillMultiplier - defender.defense;
  const elementMultiplier = getElementMultiplier(attacker.element, defender.element);
  const damage = Math.max(1, Math.floor(raw * elementMultiplier * answerQuality));
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
