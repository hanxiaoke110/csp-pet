import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { playElementAttack } from './ElementAttackEffect';

vi.mock('phaser', () => ({ default: {
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  Geom: { Point: class { constructor(public x: number, public y: number) {} } },
} }));

// Scene clock/renderer are system boundaries. Exercise the real effect orchestration
// with callbacks held until the scene advances, including callbacks after cancellation.
function sceneHarness() {
  const callbacks: (() => void)[] = [];
  const graphics = {
    setDepth: vi.fn().mockReturnThis(), setPosition: vi.fn().mockReturnThis(), setScale: vi.fn().mockReturnThis(),
    clear: vi.fn(), lineStyle: vi.fn(), fillStyle: vi.fn(), strokeCircle: vi.fn(), fillCircle: vi.fn(),
    fillTriangle: vi.fn(), arc: vi.fn(), strokePath: vi.fn(), beginPath: vi.fn(), fillPoints: vi.fn(), lineBetween: vi.fn(), destroy: vi.fn(),
  };
  let active = true;
  const scene = {
    events: new EventEmitter(), sys: { isActive: () => active }, add: { graphics: () => graphics },
    tweens: { add: ({ onComplete }: { onComplete?: () => void }) => { if (onComplete) callbacks.push(onComplete); }, killTweensOf: vi.fn() },
    time: { delayedCall: (_ms: number, callback: () => void) => { callbacks.push(callback); return { remove: vi.fn() }; } },
  };
  return { scene: scene as unknown as Phaser.Scene, graphics, callbacks,
    shutdown: () => { active = false; scene.events.emit('shutdown'); },
    flush: () => { for (let i = 0; callbacks.length && i < 20; i++) callbacks.shift()!(); },
  };
}

describe('element attacks', () => {
  it.each(['fire', 'water', 'wind', 'earth', 'light'] as const)('runs %s windup, travel and impact exactly once', element => {
    const harness = sceneHarness();
    const impact = vi.fn();
    const cancel = playElementAttack(harness.scene, element, { x: 100, y: 200 }, { x: 900, y: 200 }, impact);
    expect(impact).not.toHaveBeenCalled();
    harness.flush(); cancel();
    expect(impact).toHaveBeenCalledTimes(1);
    expect(harness.graphics.destroy).toHaveBeenCalledTimes(1);
    expect(harness.scene.events.listenerCount('shutdown')).toBe(0);
  });
  it('cancels stale tween callbacks after scene shutdown without dealing damage', () => {
    const harness = sceneHarness(); const impact = vi.fn();
    playElementAttack(harness.scene, 'fire', { x: 100, y: 200 }, { x: 900, y: 200 }, impact);
    harness.shutdown(); harness.flush();
    expect(impact).not.toHaveBeenCalled();
    expect(harness.graphics.destroy).toHaveBeenCalledTimes(1);
    expect(harness.graphics.clear).toHaveBeenCalledTimes(1);
  });
  it('keeps shield effects on their caster', () => {
    const harness = sceneHarness(); const impact = vi.fn();
    playElementAttack(harness.scene, 'water', { x: 100, y: 200 }, { x: 100, y: 200 }, impact, true);
    harness.flush();
    expect(harness.graphics.strokeCircle).toHaveBeenCalledWith(0, 0, 82);
    expect(impact).toHaveBeenCalledOnce();
  });
});
