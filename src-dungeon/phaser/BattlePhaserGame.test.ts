import { afterEach, expect, it, vi } from 'vitest';
import { createBattleGame } from './BattlePhaserGame';
import type { BattleInitData } from './types';

vi.mock('./scenes/BattleScene', () => ({ BattleScene: class {} }));
vi.mock('phaser', () => ({ default: {
  CANVAS: 1, Scale: { FIT: 1, CENTER_BOTH: 1 },
  Game: class {
    scale = { refresh: vi.fn(), setGameSize: vi.fn() };
    events = { once: vi.fn() };
    destroy = vi.fn();
  },
} }));
afterEach(() => vi.unstubAllGlobals());
it('refreshes fitted CSS dimensions when container size changes within the same backing resolution', () => {
  let resize!: () => void;
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  vi.stubGlobal('window', { devicePixelRatio: 1, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  let width = 800;
  const container = { getBoundingClientRect: () => ({ width, height: 400 }) } as HTMLElement;
  const battle = createBattleGame(container, {} as BattleInitData, () => {});
  width = 640;
  resize();
  expect(battle.game.scale.refresh).toHaveBeenCalledOnce();
  expect(battle.game.scale.setGameSize).not.toHaveBeenCalled();
  resize();
  expect(battle.game.scale.refresh).toHaveBeenCalledOnce();
  battle.destroy();
});
