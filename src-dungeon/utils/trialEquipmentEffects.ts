import { TRIAL_EQUIPMENT } from '../data/explorationItems';

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

export function getTrialCombatProfile(weaponId?: string, armorId?: string): TrialCombatProfile {
  return {
    ...EMPTY_PROFILE,
    ...(weaponId && TRIAL_EQUIPMENT[weaponId]?.category === 'weapon' ? TRIAL_EQUIPMENT[weaponId].combatEffects : undefined),
    ...(armorId && TRIAL_EQUIPMENT[armorId]?.category === 'armor' ? TRIAL_EQUIPMENT[armorId].combatEffects : undefined),
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
