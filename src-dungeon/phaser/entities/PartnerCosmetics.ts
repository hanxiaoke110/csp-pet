import Phaser from 'phaser';
import type { PartnerAccessory } from '../../../src/types/partnerAccessory';
import { supportedAccessory } from '../../../src/data/partnerAccessories';
import { effectiveVisualMode, readBattleVisualMode } from '../../utils/battleVisuals';

/** Bounded graphics attached to the existing actor; never creates input surfaces. */
export class PartnerCosmetics extends Phaser.GameObjects.Graphics {
  private previousX: number;
  private previousY: number;
  private lastFrame = -100;
  private items: PartnerAccessory[];
  private actor: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, actor: Phaser.GameObjects.Container, items: PartnerAccessory[]) {
    super(scene);
    this.actor = actor; this.previousX = actor.x; this.previousY = actor.y;
    this.items = items.filter(supportedAccessory).slice(0, 3);
    actor.add(this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.drawFrame, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.drawFrame, this));
    this.drawFrame(0);
  }
  private drawFrame(time: number) {
    if (time - this.lastFrame < 32) return;
    this.lastFrame = time;
    const moving = Math.abs(this.actor.x - this.previousX) + Math.abs(this.actor.y - this.previousY) > .5;
    this.previousX = this.actor.x; this.previousY = this.actor.y;
    this.clear();
    if (typeof document !== 'undefined' && document.hidden) return;
    const reduced = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const simple = effectiveVisualMode(readBattleVisualMode(), reduced) === 'simple';
    for (const item of this.items) {
      const color = parseInt(item.visual.color.slice(1), 16); const accent = parseInt(item.visual.accent.slice(1), 16);
      this.lineStyle(2, color, .85); this.fillStyle(color, .9);
      if (item.slot === 'halo') {
        this.strokeEllipse(0, 70, 156, 30);
        if (item.visual.primitive === 'prism') { this.lineStyle(1, accent, .9); this.strokeTriangle(-78, 70, 0, 44, 78, 70); this.strokeTriangle(-78, 70, 0, 96, 78, 70); }
      } else if (item.slot === 'orbit') {
        for (let i = 0; i < item.visual.count; i++) {
          const phase = i * Math.PI * 2 / item.visual.count + (simple ? 0 : time / item.visual.durationMs * Math.PI * 2);
          const x = Math.cos(phase) * 98; const y = Math.sin(phase) * 40;
          if (item.visual.primitive === 'lantern') { this.fillRoundedRect(x - 8, y - 11, 16, 22, 6); this.lineStyle(1, accent, 1); this.lineBetween(x, y + 11, x, y + 18); }
          else { this.fillTriangle(x, y - 10, x - 8, y + 5, x + 8, y + 5); this.fillTriangle(x, y + 10, x - 8, y - 5, x + 8, y - 5); }
        }
      } else if (moving && !simple) {
        for (let i = 0; i < item.visual.count; i++) {
          this.fillStyle(i % 2 ? accent : color, .8 - i * .08);
          const x = 45 + i * 12; const y = 40 + i * 4;
          if (item.visual.primitive === 'pixel') this.fillRect(x, y, 7, 7);
          else { this.fillCircle(x, y, 4); this.lineStyle(2, color, .6); this.lineBetween(x, y, x + 17, y + 6); }
        }
      }
    }
  }
}
