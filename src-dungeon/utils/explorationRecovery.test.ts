import { describe, expect, it } from 'vitest';
import { EXPLORATION_STAGE_CONFIGS } from '../data/explorationStages';
import { generateExplorationMap, getExplorationRegion, getUnlockedExplorationRegion } from './explorationLogic';
import { findNearestSafeCell, findRecoverySeal } from './explorationRecovery';

describe('迷宫出口脱困', () => {
  it.each(EXPLORATION_STAGE_CONFIGS)('$mapId 在所有封印状态下均有安全路径', config => {
    const map = generateExplorationMap({ id: config.mapId, width: config.width, height: config.height });
    const seals = map.events.filter(e => e.type === 'seal').sort((a, b) => (a.regionId || 0) - (b.regionId || 0));
    for (let count = 0; count <= 3; count++) {
      const resolved = new Set(seals.slice(0, count).map(e => e.id));
      const safe = findNearestSafeCell(map, map.exit, resolved);
      expect(safe).not.toBeNull();
      expect(safe).not.toEqual(map.exit);
      expect(map.tiles[safe!.y][safe!.x]).toBe(0);
      expect(getExplorationRegion(map, safe!)).toBeLessThanOrEqual(getUnlockedExplorationRegion(map, resolved));
      const target = findRecoverySeal(map, map.exit, resolved);
      if (count < 3) {
        expect(target).toBeDefined();
        expect(resolved.has(target!.id)).toBe(false);
        expect(target!.regionId).toBeLessThanOrEqual(getUnlockedExplorationRegion(map, resolved));
      } else expect(target).toBeUndefined();
    }
  });
});
