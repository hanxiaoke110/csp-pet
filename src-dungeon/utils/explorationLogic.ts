import { FOV, Map as ROTMap, Path, RNG } from 'rot-js';
import type { ExplorationEvent, ExplorationMapDefinition, ExplorationRegionId, GridPoint } from '../types/exploration';

export const FIRST_EXPLORATION_ID = 'season-2:dungeon-01:stage-01';
export const FIRST_EXPLORATION_SIZE = { width: 15, height: 11 } as const;

export interface ExplorationMapOptions {
  id: string;
  width?: number;
  height?: number;
  seed?: string;
}

export function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) || 1;
}

function distancesFrom(tiles: number[][], start: GridPoint): Map<string, number> {
  const distances = new Map<string, number>([[pointKey(start), 0]]);
  const queue: GridPoint[] = [start];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(pointKey(current)) || 0;
    for (const [dx, dy] of directions) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (tiles[next.y]?.[next.x] !== 0 || distances.has(pointKey(next))) continue;
      distances.set(pointKey(next), distance + 1);
      queue.push(next);
    }
  }
  return distances;
}

function regionForDistance(distance: number, maxDistance: number): ExplorationRegionId {
  if (distance <= maxDistance / 3) return 1;
  if (distance <= maxDistance * 2 / 3) return 2;
  return 3;
}

function chooseRegionPosition(
  candidates: Array<{ point: GridPoint; distance: number }>,
  regionId: ExplorationRegionId,
  maxDistance: number,
  excluded: Set<string>,
): GridPoint {
  const inRegion = candidates
    .filter(item => regionForDistance(item.distance, maxDistance) === regionId && !excluded.has(pointKey(item.point)))
    .sort((a, b) => b.distance - a.distance || a.point.y - b.point.y || a.point.x - b.point.x);
  const spaced = inRegion.find(item => [...excluded].every(key => {
    const [x, y] = key.split(',').map(Number);
    return Math.abs(x - item.point.x) + Math.abs(y - item.point.y) >= 3;
  })) || inRegion[0];
  if (!spaced) throw new Error(`天机阁第 ${regionId} 区事件点不足`);
  excluded.add(pointKey(spaced.point));
  return spaced.point;
}

export function generateExplorationMap(options: ExplorationMapOptions): ExplorationMapDefinition {
  const width = options.width || FIRST_EXPLORATION_SIZE.width;
  const height = options.height || FIRST_EXPLORATION_SIZE.height;
  const seedText = options.seed || options.id;
  const previousState = RNG.getState();
  RNG.setSeed(hashSeed(seedText));
  const tiles = Array.from({ length: height }, () => Array<number>(width).fill(1));
  new ROTMap.EllerMaze(width, height).create((x, y, value) => {
    tiles[y][x] = value === 0 ? 0 : 1;
  });
  RNG.setState(previousState);

  const floors: GridPoint[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (tiles[y][x] === 0) floors.push({ x, y });
    }
  }
  const start = floors.reduce((best, point) => (point.y > best.y || (point.y === best.y && point.x < best.x) ? point : best), floors[0]);
  const distances = distancesFrom(tiles, start);
  const reachable = floors
    .map(point => ({ point, distance: distances.get(pointKey(point)) ?? -1 }))
    .filter(item => item.distance >= 0);
  const exit = reachable.reduce((best, item) => item.distance > best.distance ? item : best, reachable[0]).point;
  const maxDistance = distances.get(pointKey(exit)) || 1;
  const excluded = new Set([pointKey(start), pointKey(exit)]);
  const eventPositions = ([1, 2, 3] as ExplorationRegionId[]).map(regionId => ({
    regionId,
    seal: chooseRegionPosition(reachable.filter(item => item.distance >= 3), regionId, maxDistance, excluded),
    optional: chooseRegionPosition(reachable.filter(item => item.distance >= 2), regionId, maxDistance, excluded),
  }));
  const clue = chooseRegionPosition(reachable.filter(item => item.distance >= 2), 1, maxDistance, excluded);
  const route = chooseRegionPosition(reachable.filter(item => item.distance >= 3), 2, maxDistance, excluded);
  const extra = chooseRegionPosition(reachable.filter(item => item.distance >= 4), 3, maxDistance, excluded);

  const regions = tiles.map((row, y) => row.map((tile, x) => {
    if (tile !== 0) return 0;
    return regionForDistance(distances.get(`${x},${y}`) || 0, maxDistance);
  }));

  const events: ExplorationEvent[] = [
    ...eventPositions.map(({ regionId, seal }, index) => ({ id: `seal-${index + 1}`, type: 'seal' as const, position: seal, questionIndex: index, regionId })),
    { id: 'clue-1', type: 'clue', position: clue, regionId: 1 },
    { id: 'merchant-1', type: 'merchant', position: eventPositions[0].optional, regionId: 1 },
    { id: 'route-1', type: 'route', position: route, regionId: 2 },
    { id: 'trap-1', type: 'trap', position: eventPositions[1].optional, regionId: 2 },
    { id: 'treasure-1', type: 'treasure', position: eventPositions[2].optional, regionId: 3 },
    { id: 'equipment-1', type: 'equipment', position: extra, regionId: 3 },
    { id: 'exit-1', type: 'exit', position: exit, regionId: 3 },
  ];
  return { id: options.id, width, height, tiles, regions, start, exit, events };
}

export function generateFirstExplorationMap(seedText = FIRST_EXPLORATION_ID): ExplorationMapDefinition {
  return generateExplorationMap({ id: FIRST_EXPLORATION_ID, seed: seedText, ...FIRST_EXPLORATION_SIZE });
}

export function getExplorationRegion(map: ExplorationMapDefinition, point: GridPoint): ExplorationRegionId {
  const value = map.regions[point.y]?.[point.x];
  return value === 2 || value === 3 ? value : 1;
}

export function getUnlockedExplorationRegion(
  map: ExplorationMapDefinition,
  resolvedEventIds: ReadonlySet<string>,
): ExplorationRegionId {
  const sealByRegion = new Map(
    map.events.filter(event => event.type === 'seal' && event.regionId).map(event => [event.regionId!, event.id]),
  );
  if (!resolvedEventIds.has(sealByRegion.get(1) || '')) return 1;
  if (!resolvedEventIds.has(sealByRegion.get(2) || '')) return 2;
  return 3;
}

export function findNextUnresolvedSeal(
  map: ExplorationMapDefinition,
  from: GridPoint,
  resolvedEventIds: ReadonlySet<string>,
): ExplorationEvent | undefined {
  return map.events
    .filter(event => event.type === 'seal' && !resolvedEventIds.has(event.id))
    .map(event => ({ event, distance: findPath(map, from, event.position).length }))
    .filter(item => item.distance > 0)
    .sort((a, b) => a.distance - b.distance)[0]?.event;
}

export function computeVisible(map: ExplorationMapDefinition, origin: GridPoint, radius = 2): Set<string> {
  const visible = new Set<string>();
  const fov = new FOV.PreciseShadowcasting((x, y) => map.tiles[y]?.[x] === 0, { topology: 4 });
  fov.compute(origin.x, origin.y, radius, (x, y) => {
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) visible.add(`${x},${y}`);
  });
  return visible;
}

export function findPath(map: ExplorationMapDefinition, from: GridPoint, to: GridPoint): GridPoint[] {
  const result: GridPoint[] = [];
  const astar = new Path.AStar(to.x, to.y, (x, y) => map.tiles[y]?.[x] === 0, { topology: 4 });
  astar.compute(from.x, from.y, (x, y) => result.push({ x, y }));
  return result;
}

export function findRevealedPath(
  map: ExplorationMapDefinition,
  from: GridPoint,
  to: GridPoint,
  revealed: ReadonlySet<string>,
): GridPoint[] {
  if (!revealed.has(pointKey(to)) || map.tiles[to.y]?.[to.x] !== 0) return [];
  const result: GridPoint[] = [];
  const astar = new Path.AStar(
    to.x,
    to.y,
    (x, y) => map.tiles[y]?.[x] === 0 && revealed.has(`${x},${y}`),
    { topology: 4 },
  );
  astar.compute(from.x, from.y, (x, y) => result.push({ x, y }));
  return result;
}

export function isAdjacent(a: GridPoint, b: GridPoint): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}
