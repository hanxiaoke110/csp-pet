import { describe, expect, it, vi } from 'vitest';
import { PartnerCosmetics } from './PartnerCosmetics';
import { BUILTIN_ACCESSORY_CATALOG } from '../../../src/data/partnerAccessories';
vi.mock('phaser', () => {
  class Graphics {
    calls: string[] = []; scene: unknown;
    constructor(scene: unknown) { this.scene = scene; }
    once() { return this; } clear() { this.calls = []; return this; }
    destroy() { this.scene = null; }
  }
  for (const name of ['save', 'restore', 'translateCanvas', 'scaleCanvas', 'lineStyle', 'strokeEllipse', 'beginPath', 'moveTo', 'lineTo', 'strokePath', 'fillStyle', 'fillTriangle', 'lineBetween', 'fillCircle', 'fillRoundedRect', 'fillPoints', 'strokePoints', 'fillRect']) {
    Object.assign(Graphics.prototype, { [name]: function(this: Graphics) { this.calls.push(name); return this; } });
  }
  return { default: { GameObjects: { Graphics, Events: { DESTROY: 'destroy' } }, Scenes: { Events: { UPDATE: 'update' } }, Geom: { Point: class { constructor(public x: number, public y: number) {} } } } };
});
describe('trial accessory occlusion', () => {
  it.each(BUILTIN_ACCESSORY_CATALOG.items.filter(i => i.slot === 'halo'))('%s keeps every ground decoration behind the portrait', item => {
    const scene = { events: { on: vi.fn(), off: vi.fn() } };
    const rear: { calls: string[] }[] = [];
    const actor = { x: 0, y: 0, scaleX: 1, scaleY: 1, addAt: (g: { calls: string[] }, index: number) => { expect(index).toBe(1); rear.push(g); }, add: vi.fn() };
    const front = new PartnerCosmetics(scene as any, actor as any, [item]);
    expect(rear[0].calls).toContain('strokeEllipse');
    expect((front as any).calls).toEqual([]);
  });
  it.each(BUILTIN_ACCESSORY_CATALOG.items.filter(i => i.slot === 'orbit'))('%s draws supported companions without a renderer mismatch', item => {
    const scene = { events: { on: vi.fn(), off: vi.fn() } };
    const rear: { calls: string[] }[] = [];
    const actor = { x: 0, y: 0, scaleX: 1, scaleY: 1, addAt: (g: { calls: string[] }) => rear.push(g), add: vi.fn() };
    const front = new PartnerCosmetics(scene as any, actor as any, [item]);
    expect([...rear[0].calls, ...(front as any).calls].length).toBeGreaterThan(0);
    if (item.visual.primitive === 'wing') expect((front as any).calls).toEqual([]);
  });
});
