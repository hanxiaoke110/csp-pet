import type { ExplorationEvent, ExplorationMapDefinition, GridPoint } from '../types/exploration';
import { findPath, getExplorationRegion, getUnlockedExplorationRegion, pointKey } from './explorationLogic';

export function findRecoverySeal(
  map: ExplorationMapDefinition, from: GridPoint, resolved: ReadonlySet<string>,
): ExplorationEvent | undefined {
  const unlocked = getUnlockedExplorationRegion(map, resolved);
  return map.events
    .filter(e => e.type === 'seal' && !resolved.has(e.id) && getExplorationRegion(map, e.position) <= unlocked)
    .map(event => ({ event, distance: findPath(map, from, event.position).length }))
    .filter(candidate => candidate.distance > 0)
    .sort((a, b) => a.distance - b.distance || a.event.id.localeCompare(b.event.id))[0]?.event;
}

export function findNearestSafeCell(
  map: ExplorationMapDefinition, from: GridPoint, resolved: ReadonlySet<string>,
): GridPoint | null {
  const unlocked = getUnlockedExplorationRegion(map, resolved);
  const blocked = new Set(map.events.filter(e => e.type === 'exit' || !resolved.has(e.id)).map(e => pointKey(e.position)));
  // Only cells reachable from the entrance within the currently unlocked regions qualify.
  const reachable = new Set<string>();
  const entranceQueue: GridPoint[] = [map.start];
  for (let index = 0; index < entranceQueue.length; index++) {
    const point = entranceQueue[index];
    const key = pointKey(point);
    if (reachable.has(key) || map.tiles[point.y]?.[point.x] !== 0 || getExplorationRegion(map, point) > unlocked) continue;
    reachable.add(key);
    entranceQueue.push(...neighbors(point));
  }
  const origin = map.tiles[from.y]?.[from.x] === 0 ? from : map.start;
  const queue: GridPoint[] = [origin];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    const key = pointKey(point);
    if (visited.has(key) || map.tiles[point.y]?.[point.x] !== 0) continue;
    visited.add(key);
    if (key !== pointKey(from) && reachable.has(key) && !blocked.has(key)) return point;
    queue.push(...neighbors(point));
  }
  return null;
}

function neighbors(point: GridPoint): GridPoint[] {
  return [
    { x: point.x, y: point.y - 1 }, { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y + 1 }, { x: point.x - 1, y: point.y },
  ];
}
