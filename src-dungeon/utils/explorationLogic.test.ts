import { describe, expect, it } from 'vitest';
import { EXPLORATION_STAGE_CONFIGS } from '../data/explorationStages';
import { computeVisible, findNextUnresolvedSeal, findPath, findRevealedPath, generateExplorationMap, generateFirstExplorationMap, getExplorationRegion, getUnlockedExplorationRegion, pointKey } from './explorationLogic';

describe('first exploration map', () => {
  it('is deterministic, connected and contains the complete event set', () => {
    const first = generateFirstExplorationMap('student-a');
    const second = generateFirstExplorationMap('student-a');
    expect(second).toEqual(first);
    expect(first.events.filter(event => event.type === 'seal')).toHaveLength(3);
    expect(first.events.map(event => event.type)).toEqual(expect.arrayContaining(['clue', 'route', 'treasure', 'equipment', 'merchant', 'trap', 'exit']));
    expect(first.events.filter(event => event.type === 'seal').map(event => event.regionId)).toEqual([1, 2, 3]);
    for (const event of first.events) {
      const path = findPath(first, first.start, event.position);
      expect(path[0]).toEqual(first.start);
      expect(path.at(-1)).toEqual(event.position);
    }
  });

  it('builds all three regions reliably and lets the jade slip locate the nearest unresolved seal', () => {
    for (let index = 0; index < 100; index += 1) {
      const map = generateFirstExplorationMap(`student-${index}`);
      expect(new Set(map.regions.flat().filter(Boolean))).toEqual(new Set([1, 2, 3]));
      expect(getExplorationRegion(map, map.start)).toBe(1);
      expect(getExplorationRegion(map, map.exit)).toBe(3);
      const clue = map.events.find(event => event.type === 'clue')!;
      const nextSeal = findNextUnresolvedSeal(map, clue.position, new Set());
      expect(nextSeal?.type).toBe('seal');
      expect(findNextUnresolvedSeal(map, clue.position, new Set(map.events.filter(event => event.type === 'seal').map(event => event.id)))).toBeUndefined();
    }
  });

  it('unlocks regions in seal order without depending on unrelated events', () => {
    const map = generateFirstExplorationMap();
    expect(getUnlockedExplorationRegion(map, new Set())).toBe(1);
    expect(getUnlockedExplorationRegion(map, new Set(['treasure-1', 'seal-1']))).toBe(2);
    expect(getUnlockedExplorationRegion(map, new Set(['seal-1', 'seal-2']))).toBe(3);
  });

  it('reveals the current floor without revealing the whole maze', () => {
    const map = generateFirstExplorationMap();
    const visible = computeVisible(map, map.start);
    expect(visible.has(pointKey(map.start))).toBe(true);
    expect(visible.size).toBeGreaterThan(1);
    expect(visible.size).toBeLessThan(map.width * map.height);
  });

  it('auto-routes only through floor tiles that have already been revealed', () => {
    const map = generateFirstExplorationMap();
    const fullPath = findPath(map, map.start, map.exit);
    const nearbyTarget = fullPath[3];
    const revealed = new Set(fullPath.slice(0, 4).map(pointKey));

    expect(findRevealedPath(map, map.start, nearbyTarget, revealed)).toEqual(fullPath.slice(0, 4));
    expect(findRevealedPath(map, map.start, map.exit, revealed)).toEqual([]);
  });

  it('generates all 40 stage mazes with reachable seals, events and exits', () => {
    expect(EXPLORATION_STAGE_CONFIGS).toHaveLength(40);
    expect(new Set(EXPLORATION_STAGE_CONFIGS.map(config => config.mapId)).size).toBe(40);
    for (const config of EXPLORATION_STAGE_CONFIGS) {
      const map = generateExplorationMap({ id: config.mapId, width: config.width, height: config.height });
      expect(map.id).toBe(config.mapId);
      expect(map.events.filter(event => event.type === 'seal')).toHaveLength(3);
      expect(new Set(map.regions.flat().filter(Boolean))).toEqual(new Set([1, 2, 3]));
      for (const seal of map.events.filter(event => event.type === 'seal')) {
        const gatedPath = findPath(map, map.start, seal.position);
        expect(
          gatedPath.every(point => getExplorationRegion(map, point) <= seal.regionId!),
          `${config.mapId}:${seal.id}:region-gate`,
        ).toBe(true);
      }
      for (const event of map.events) {
        const path = findPath(map, map.start, event.position);
        expect(path[0], `${config.mapId}:${event.id}`).toEqual(map.start);
        expect(path[path.length - 1], `${config.mapId}:${event.id}`).toEqual(event.position);
      }
    }
  });
});
