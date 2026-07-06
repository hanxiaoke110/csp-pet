// Phaser 战斗场景内部类型定义
import type { SkillDefinition } from '../data/skills';
import type { PetElement } from '../../src/types/pet';
import type { EnemyIntent, EnemyIntentType, BurnStack } from '../types/dungeon';

export { EnemyIntent, EnemyIntentType, BurnStack };

export interface PhaserPetConfig {
  petId: string;
  displayName: string;
  speciesId: string;
  element: PetElement;
  level: number;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  speed: number;
  isPlayer: boolean;
  previewUrl: string;
  textureKey: string;
}

export interface PhaserSkillCard {
  skill: SkillDefinition;
  usedCount: number;
  cooldownRemaining: number;
}

export interface BattleInitData {
  dungeonId: string;
  stageId: string;
  isBoss: boolean;
  playerPet: PhaserPetConfig;
  enemyPet: PhaserPetConfig;
  initialEnergy: number;
  maxEnergy: number;
  dungeonColor: string;
  dungeonBgImage?: string;
  dungeonName: string;
}

export interface SkillSelectResult {
  skillId: string;
  isCorrect: boolean;
}

export interface BattleEndResult {
  isWon: boolean;
  expEarned: number;
  goldEarned: number;
  rating: string;
  correctCount: number;
  wrongCount: number;
  comboCount: number;
  roundCount: number;
  usedSkillIds: string[];
  playerHp: number;
  playerMaxHp: number;
  enemyHp: number;
  enemyMaxHp: number;
}

export const INTENT_CONFIG: Record<EnemyIntentType, { label: string; icon: string; color: string }> = {
  attack: { label: '普通攻击', icon: '⚔️', color: '#ffffff' },
  heavy:  { label: '蓄力重击', icon: '🔴', color: '#ff4444' },
  defend: { label: '防御姿态', icon: '🛡️', color: '#4488ff' },
};
