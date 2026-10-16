import { describe, expect, it } from 'vitest';
import { advanceAccessoryTrail, orbitPoint } from './partnerAccessoryMotion';
describe('bounded accessory geometry', () => {
  it('orbits across rear and front with depth-dependent size', () => {
    const front = orbitPoint(1750, 0, 3, 7000), rear = orbitPoint(5250, 0, 3, 7000);
    expect(front.front).toBe(true); expect(rear.front).toBe(false); expect(front.scale).toBeGreaterThan(rear.scale);
    expect(orbitPoint(0, 0, 3, 7000).x).toBeCloseTo(orbitPoint(7000, 0, 3, 7000).x);
  });
  it('samples genuine movement and ages out after stopping', () => {
    const points = advanceAccessoryTrail([], { x: 20, y: 0 }, { x: 0, y: 0 }, 100, true, 900);
    expect(points).toHaveLength(3); expect(points[points.length - 1]?.x).toBe(20);
    expect(advanceAccessoryTrail(points, { x: 20, y: 0 }, { x: 20, y: 0 }, 500, false, 900)).toHaveLength(3);
    expect(advanceAccessoryTrail(points, { x: 20, y: 0 }, { x: 20, y: 0 }, 1001, false, 900)).toHaveLength(0);
  });
  it('rejects teleports, does not emit at rest, and caps particle counts', () => {
    expect(advanceAccessoryTrail([], { x: 1000, y: 0 }, { x: 0, y: 0 }, 100, true, 900)).toHaveLength(0);
    expect(advanceAccessoryTrail([], { x: 0, y: 0 }, { x: 0, y: 0 }, 100, true, 900)).toHaveLength(0);
    const points = Array.from({ length: 30 }, (_, x) => ({ x, y: 0, born: 50 }));
    expect(advanceAccessoryTrail(points, { x: 20, y: 0 }, { x: 0, y: 0 }, 100, true, 900, 18)).toHaveLength(18);
  });
});
