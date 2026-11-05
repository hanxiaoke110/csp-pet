import Phaser from 'phaser';
import type { PartnerAccessory } from '../../../src/types/partnerAccessory';
import { supportedAccessory } from '../../../src/data/partnerAccessories';
import { advanceAccessoryTrail, orbitPoint, type AccessoryTrailPoint } from '../../../src/utils/partnerAccessoryMotion';
import { accessoryGlyphShapes, accessoryInk, haloMotif, type AccessoryShape } from '../../../src/utils/partnerAccessoryArtwork';
import { effectiveVisualMode, readBattleVisualMode } from '../../utils/battleVisuals';

/** Rear graphics precede the portrait; the front layer stays clear of its face. */
export class PartnerCosmetics extends Phaser.GameObjects.Graphics {
  private previous: { x: number; y: number };
  private lastFrame = -100;
  private items: PartnerAccessory[];
  private actor: Phaser.GameObjects.Container;
  private rear: Phaser.GameObjects.Graphics;
  private history: AccessoryTrailPoint[] = [];
  private groundY: number;
  constructor(scene: Phaser.Scene, actor: Phaser.GameObjects.Container, items: PartnerAccessory[], groundY = 90) {
    super(scene);
    this.actor = actor; this.previous = { x: actor.x, y: actor.y };
    this.groundY = groundY;
    this.items = items.filter(supportedAccessory).slice(0, 3);
    this.rear = new Phaser.GameObjects.Graphics(scene);
    actor.addAt(this.rear, 1); actor.add(this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.drawFrame, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.drawFrame, this);
      this.history = []; if (this.rear.scene) this.rear.destroy();
    });
    this.drawFrame(0);
  }
  private drawArtwork(g: Phaser.GameObjects.Graphics, item: PartnerAccessory, shapes: readonly AccessoryShape[], x: number, y: number, width: number, height = width, alpha = 1) {
    for (const shape of shapes) {
      const points = shape.points.map(p => new Phaser.Geom.Point(x + (p[0] - 50) * width / 100, y + (p[1] - 50) * height / 100));
      if (shape.fill !== 'none') { g.fillStyle(parseInt(accessoryInk(shape.fill, item.visual.color, item.visual.accent).slice(1), 16), alpha); g.fillPoints(points, shape.closed); }
      if (shape.stroke !== 'none') { g.lineStyle(Math.max(.65, shape.width * width / 100), parseInt(accessoryInk(shape.stroke, item.visual.color, item.visual.accent).slice(1), 16), alpha); g.strokePoints(points, shape.closed); }
    }
  }
  private drawFrame(time: number) {
    if (time - this.lastFrame < 32) return;
    this.lastFrame = time;
    const position = { x: this.actor.x, y: this.actor.y };
    const moving = Math.hypot(position.x - this.previous.x, position.y - this.previous.y) > .5;
    this.clear(); this.rear.clear();
    if (typeof document !== 'undefined' && document.hidden) { this.history = []; this.previous = position; return; }
    const reduced = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const simple = effectiveVisualMode(readBattleVisualMode(), reduced) === 'simple';
    const trail = this.items.find(i => i.slot === 'trail');
    this.history = trail && !simple ? advanceAccessoryTrail(this.history, position, this.previous, time, moving, Math.min(1200, trail.visual.durationMs), Math.min(24, trail.visual.count * 3)) : [];
    this.previous = position;
    for (const item of this.items) {
      const color = parseInt(item.visual.color.slice(1), 16), accent = parseInt(item.visual.accent.slice(1), 16);
      if (item.slot === 'halo') {
        const g = this.rear;
        // Scale the halo locally; position remains anchored at the feet.
        const haloSize = item.visual.size || 1;
        g.save(); g.translateCanvas(0, this.groundY - 78); g.translateCanvas(0, 78); g.scaleCanvas(haloSize, haloSize); g.translateCanvas(0, -78);
        // The entire floor decal belongs behind the portrait, not just its rear arc.
        g.lineStyle(10, color, .16); g.strokeEllipse(0, 78, 190, 43);
        g.lineStyle(5, 0x15394c, .85); g.strokeEllipse(0, 78, 190, 43);
        g.lineStyle(2.5, color, 1); g.strokeEllipse(0, 78, 190, 43);
        this.drawArtwork(g, item, haloMotif(item.visual.primitive, simple ? 0 : time, item.visual.durationMs), 0, 78, 190, 43);
        if (item.visual.primitive === 'prism') {
          const phase = simple ? 0 : time / item.visual.durationMs * Math.PI * 2;
          g.lineStyle(2, accent, .95);
          for (let ring = 0; ring < 2; ring++) {
            g.beginPath();
            for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI * 2 + phase * (ring ? -1 : 1) + ring * Math.PI / 4, x = Math.cos(a) * 83, y = 78 + Math.sin(a) * 17; if (!i) g.moveTo(x, y); else g.lineTo(x, y); }
            g.strokePath();
          }
          for (let i = 0; i < 8; i++) { const a = phase + i * Math.PI / 4; g.lineBetween(Math.cos(a) * 98, 78 + Math.sin(a) * 24, Math.cos(a) * 106, 78 + Math.sin(a) * 28); }
          g.fillStyle(accent, 1); g.fillTriangle(-104, 76, -96, 68, -96, 84); g.fillTriangle(104, 76, 96, 68, 96, 84);
        }
        g.restore();
      } else if (item.slot === 'orbit') {
        for (let i = 0; i < item.visual.count; i++) {
          const point = orbitPoint(simple ? 0 : time, i, item.visual.count, item.visual.durationMs, item.visual.primitive);
          const x = (point.x - 100) * 1.3, y = point.y - 110, size = point.scale * (item.visual.size || 1) * 1.25;
          const g = point.front ? this : this.rear;
          if (item.visual.primitive !== 'wing') { g.fillStyle(color, .14); g.fillCircle(x, y, 21 * size); }
          const glyph = accessoryGlyphShapes(item.visual.primitive);
          if (glyph) {
            this.drawArtwork(g, item, glyph, x, y, (item.visual.primitive === 'wing' ? 184 : 38) * size, undefined, point.front ? 1 : .85);
          } else if (item.visual.primitive === 'lantern') {
            g.fillStyle(color, 1); g.fillRoundedRect(x - 10 * size, y - 14 * size, 20 * size, 28 * size, 7 * size);
            g.lineStyle(2, accent, 1); g.lineBetween(x, y - 20 * size, x, y + 21 * size); g.lineBetween(x - 7 * size, y - 11 * size, x + 7 * size, y - 11 * size);
          } else {
            const points = Array.from({ length: 10 }, (_, n) => { const angle = n * Math.PI / 5 - Math.PI / 2, radius = (n % 2 ? 6 : 14) * size; return new Phaser.Geom.Point(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius); });
            g.fillStyle(color, 1); g.fillPoints(points, true); g.lineStyle(1.5, 0x8f6428, 1); g.strokePoints(points, true); g.fillStyle(accent, 1); g.fillCircle(x - 2, y - 3, 2);
          }
        }
      } else if (!simple) {
        for (let i = 0; i < this.history.length; i++) {
          const p = this.history[i], life = Math.max(0, 1 - (time - p.born) / Math.min(1200, item.visual.durationMs));
          const x = (p.x - position.x) / (this.actor.scaleX || 1) - (p.direction || 0) * 70, y = (p.y - position.y) / (this.actor.scaleY || 1) + 92;
          this.rear.fillStyle(i % 2 ? accent : color, life);
          const size = item.visual.size || 1;
          const glyph = accessoryGlyphShapes(item.visual.primitive);
          if (glyph) {
            if (i % 3 !== 0) continue;
            this.drawArtwork(this.rear, item, glyph, x, y + Math.sin(p.born / 110) * 9 - (1 - life) * 18, (16 + life * 10) * size, undefined, life);
          }
          else if (item.visual.primitive === 'pixel') this.rear.fillRect(x, y - i % 3 * 5, (3 + life * 7) * size, (3 + life * 7) * size);
          else { this.rear.fillCircle(x, y, (1 + life * 5) * size); this.rear.lineStyle(2, accent, life); this.rear.lineBetween(x, y, x + 9 * life * size, y - 4); }
        }
      }
    }
  }
}
