export interface TrialCombatProfile {
  initialShieldRatio: number;
  correctShieldRatio: number;
  correctShieldLimit: number;
  nextAttackBoost: number;
  firstHpHitReduction: number;
  shieldedElementBoost: number;
  comboThreeBoost: number;
  comboThreeLimit: number;
  lowHpShieldRatio: number;
  lowHpHealRatio: number;
}

const EMPTY_PROFILE: TrialCombatProfile = {
  initialShieldRatio: 0,
  correctShieldRatio: 0,
  correctShieldLimit: 0,
  nextAttackBoost: 0,
  firstHpHitReduction: 0,
  shieldedElementBoost: 0,
  comboThreeBoost: 0,
  comboThreeLimit: 0,
  lowHpShieldRatio: 0,
  lowHpHealRatio: 0,
};

const WEAPON_EFFECTS: Record<string, Partial<TrialCombatProfile>> = {
  'xuanwu-hammer-common': { correctShieldRatio: 0.05, correctShieldLimit: 2 },
  'xuanwu-hammer-rare': { correctShieldRatio: 0.08, correctShieldLimit: 2 },
  'xuanwu-hammer-epic': { correctShieldRatio: 0.1, correctShieldLimit: 2, nextAttackBoost: 0.1 },
  'xuanwu-hammer-legendary': { comboThreeBoost: 0.35, comboThreeLimit: 1 },
  'jade-spear-common': { nextAttackBoost: 0.04, correctShieldLimit: 2 },
  'jade-spear-rare': { nextAttackBoost: 0.08, correctShieldLimit: 2 },
  'jade-spear-epic': { comboThreeBoost: 0.22, comboThreeLimit: 2 },
  'jade-spear-legendary': { comboThreeBoost: 0.45, comboThreeLimit: 1 },
};

const ARMOR_EFFECTS: Record<string, Partial<TrialCombatProfile>> = {
  'xuanwu-armor-common': { initialShieldRatio: 0.05 },
  'xuanwu-armor-rare': { initialShieldRatio: 0.08, firstHpHitReduction: 0.1 },
  'xuanwu-armor-epic': { initialShieldRatio: 0.1, shieldedElementBoost: 0.08 },
  'xuanwu-armor-legendary': { initialShieldRatio: 0.12, lowHpShieldRatio: 0.12, lowHpHealRatio: 0.06 },
};

export function getTrialCombatProfile(weaponId?: string, armorId?: string): TrialCombatProfile {
  return {
    ...EMPTY_PROFILE,
    ...(weaponId ? WEAPON_EFFECTS[weaponId] : undefined),
    ...(armorId ? ARMOR_EFFECTS[armorId] : undefined),
  };
}

export function getEquippedDefinitionId(
  ownedItems: Array<{ id: string; definitionId: string }>,
  equippedOwnedId: string | null,
): string | undefined {
  return ownedItems.find(item => item.id === equippedOwnedId)?.definitionId;
}

export function findArtifactPreviewTarget(
  map: ExplorationMapDefinition,
  position: GridPoint,
  resolvedEventIds: ReadonlySet<string>,
  artifactId?: string,
): ExplorationEvent | undefined {
  const unresolved = map.events.filter(event => !resolvedEventIds.has(event.id));
  const candidates = artifactId === 'compass-epic'
    ? unresolved.filter(event => event.type === 'treasure' || event.type === 'merchant')
    : artifactId === 'compass-rare'
      ? unresolved.filter(event => ['clue', 'route', 'treasure', 'equipment', 'merchant', 'trap'].includes(event.type))
      : artifactId === 'compass-legendary'
        ? unresolved.filter(event => event.type !== 'seal' && event.type !== 'exit')
        : [];
  return candidates
    .map(event => ({ event, distance: findPath(map, position, event.position).length }))
    .filter(item => item.distance > 0)
    .sort((a, b) => a.distance - b.distance)[0]?.event;
}
import type { ExplorationEvent, ExplorationMapDefinition, GridPoint } from '../types/exploration';
import { findPath } from './explorationLogic';
