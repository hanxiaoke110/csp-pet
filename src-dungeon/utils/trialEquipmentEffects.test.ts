import { describe, expect, it } from 'vitest';
import { findArtifactPreviewTarget, getEquippedDefinitionId, getTrialCombatProfile } from './trialEquipmentEffects';
import { generateExplorationMap } from './explorationLogic';

describe('trial equipment effects', () => {
  it('merges weapon and armor effects without inventing random rolls', () => {
    const profile = getTrialCombatProfile('xuanwu-hammer-epic', 'xuanwu-armor-rare');
    expect(profile.correctShieldRatio).toBe(0.1);
    expect(profile.nextAttackBoost).toBe(0.1);
    expect(profile.initialShieldRatio).toBe(0.08);
    expect(profile.firstHpHitReduction).toBe(0.1);
  });

  it('resolves persisted owned ids to stable definition ids', () => {
    const owned = [{ id: 'owned-1', definitionId: 'jade-spear-common' }];
    expect(getEquippedDefinitionId(owned, 'owned-1')).toBe('jade-spear-common');
    expect(getEquippedDefinitionId(owned, 'missing')).toBeUndefined();
  });

  it('wires every preview artifact to the correct event group', () => {
    const map = generateExplorationMap({ id: 'artifact-preview-test', width: 15, height: 11 });
    const resolved = new Set<string>();
    const rare = findArtifactPreviewTarget(map, map.start, resolved, 'compass-rare');
    const epic = findArtifactPreviewTarget(map, map.start, resolved, 'compass-epic');
    const legendary = findArtifactPreviewTarget(map, map.start, resolved, 'compass-legendary');
    expect(['clue', 'route', 'treasure', 'equipment', 'merchant', 'trap']).toContain(rare?.type);
    expect(['treasure', 'merchant']).toContain(epic?.type);
    expect(legendary?.type).not.toBe('seal');
    expect(legendary?.type).not.toBe('exit');
    expect(findArtifactPreviewTarget(map, map.start, resolved, 'compass-common')).toBeUndefined();
  });
});
