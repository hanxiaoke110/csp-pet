/** Shared, renderer-independent geometry. All coordinates use a 200px stage. */
export function orbitPoint(time: number, index: number, count: number, duration: number, primitive?: string) {
  // Wing pairs stay anchored behind the shoulders, never sweep across the face.
  if (primitive === 'wing') return { x: 100, y: 100, scale: 1 + Math.sin(time / duration * Math.PI * 2) * .035, front: false };
  const angle = time / duration * Math.PI * 2 + index * Math.PI * 2 / count;
  const depth = Math.sin(angle);
  return { x: 100 + Math.cos(angle) * 86, y: 106 + depth * 32, scale: .78 + (depth + 1) * .16, front: depth >= 0 };
}
export interface AccessoryTrailPoint { x: number; y: number; born: number; direction?: number }
export function advanceAccessoryTrail(points: AccessoryTrailPoint[], position: { x: number; y: number }, previous: { x: number; y: number }, time: number, emitting: boolean, lifetime: number, limit = 18) {
  const alive = points.filter(p => time - p.born < lifetime && time >= p.born);
  const distance = Math.hypot(position.x - previous.x, position.y - previous.y);
  // Teleports and restoring window positions must not paint a screen-wide streak.
  if (emitting && distance >= 2 && distance < 180) {
    const steps = Math.min(4, Math.ceil(distance / 8));
    for (let i = 1; i <= steps; i++) alive.push({ x: previous.x + (position.x - previous.x) * i / steps, y: previous.y + (position.y - previous.y) * i / steps, born: time, direction: Math.sign(position.x - previous.x) });
  }
  return alive.slice(-limit);
}
