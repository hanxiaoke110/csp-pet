import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { playElementAttack } from './ElementAttackEffect';
import { writeBattleVisualMode } from '../../utils/battleVisuals';
import { writePerformanceMode } from '../../../src/lib/performanceMode';

vi.mock('phaser', () => ({ default: {
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  Geom: { Point: class { constructor(public x: number, public y: number) {} } },
} }));

// Scene clock/renderer are system boundaries. Exercise the real effect orchestration
// with callbacks held until the scene advances, including callbacks after cancellation.
function sceneHarness() {
  type Task = { at: number; run: () => void; removed: boolean; target?: unknown };
  const tasks: Task[] = [];
  let clock = 0, paused = false;
  const schedule = (ms: number, run: () => void, target?: unknown) => {
    const task = { at: clock + ms, run, removed: false, target }; tasks.push(task);
    return { remove: vi.fn(() => { task.removed = true; }) };
  };
  const advance = (ms: number) => {
    if (paused) return;
    const end = clock + ms;
    for (let count = 0; count < 100; count++) {
      const task = tasks.filter(task => !task.removed && task.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!task) break;
      clock = task.at; task.removed = true; task.run();
    }
    clock = end;
  };
  const graphics = {
    setDepth: vi.fn().mockReturnThis(), setPosition: vi.fn().mockReturnThis(), setScale: vi.fn().mockReturnThis(),
    clear: vi.fn(), lineStyle: vi.fn(), fillStyle: vi.fn(), strokeCircle: vi.fn(), fillCircle: vi.fn(),
    fillTriangle: vi.fn(), arc: vi.fn(), strokePath: vi.fn(), beginPath: vi.fn(), fillPoints: vi.fn(), lineBetween: vi.fn(), destroy: vi.fn(),
  };
  let active = true;
  const scene = {
    events: new EventEmitter(), sys: { isActive: () => active && !paused }, add: { graphics: () => graphics },
    tweens: {
      add: ({ onComplete, duration, targets }: { onComplete?: () => void; duration: number; targets: unknown }) => { if (onComplete) schedule(duration, onComplete, targets); },
      killTweensOf: vi.fn((target: unknown) => { tasks.forEach(task => { if (task.target === target) task.removed = true; }); }),
    },
    time: { delayedCall: (ms: number, callback: () => void) => schedule(ms, callback) },
  };
  return { scene: scene as unknown as Phaser.Scene, graphics, advance,
    pause: () => { paused = true; }, resume: () => { paused = false; },
    shutdown: () => { active = false; scene.events.emit('shutdown'); },
    flush: () => advance(10_000),
    flushStale: () => tasks.slice().forEach(task => task.run()),
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
    harness.shutdown(); harness.flush(); harness.flushStale();
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

const modes = ['full', 'simple', 'economy', 'reduced'] as const;
function selectMode(mode: typeof modes[number]) {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: mode === 'reduced' }) });
  writePerformanceMode(mode === 'economy' ? 'economy' : 'standard');
  writeBattleVisualMode(mode === 'simple' ? 'simple' : 'full');
}
afterEach(() => { writePerformanceMode('standard'); writeBattleVisualMode('full'); vi.unstubAllGlobals(); });
const timingCases = modes.flatMap(mode => [false, true].map(shield => ({ mode, shield, delay: shield ? 180 : 280 })));
describe('authoritative skill impact timing', () => {
  it.each(timingCases)('$mode shield=$shield resolves at $delay scene ms and freezes at the pause boundary', ({ mode, shield, delay }) => {
    selectMode(mode);
    const harness = sceneHarness(); const impact = vi.fn();
    playElementAttack(harness.scene, 'fire', { x: 100, y: 200 }, { x: 900, y: 200 }, impact, shield);
    harness.advance(delay - 1); expect(impact).not.toHaveBeenCalled();
    harness.pause(); harness.advance(10_000); expect(impact).not.toHaveBeenCalled();
    harness.resume(); harness.advance(1); expect(impact).toHaveBeenCalledOnce();
    harness.flush(); harness.flushStale(); expect(impact).toHaveBeenCalledOnce();
  });
  it.each(timingCases)('$mode shield=$shield cancels the pending skill immediately before its impact', ({ mode, shield, delay }) => {
    selectMode(mode);
    const harness = sceneHarness(); const impact = vi.fn();
    const cancel = playElementAttack(harness.scene, 'water', { x: 100, y: 200 }, { x: 900, y: 200 }, impact, shield);
    harness.advance(delay - 1); cancel(); harness.advance(1); harness.flushStale();
    expect(impact).not.toHaveBeenCalled(); expect(harness.graphics.destroy).toHaveBeenCalledOnce();
  });
});
