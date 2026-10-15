import Phaser from 'phaser';
import type { PetElement } from '../../../src/types/pet';
import { createImpactLifecycle, effectiveVisualMode, readBattleVisualMode } from '../../utils/battleVisuals';

const COLORS: Record<PetElement, number> = { fire: 0xff8534, water: 0x4dcfff, wind: 0x8ce3ad, earth: 0xd4aa70, light: 0xffec91 };
type Point = { x: number; y: number };

/** All animation work belongs to the scene clock: pause freezes it, shutdown cancels it. */
export function playElementAttack(scene: Phaser.Scene, element: PetElement, source: Point, target: Point, onImpact: () => void, shield = false): () => void {
  const lifecycle = createImpactLifecycle(() => { if (scene.sys.isActive()) onImpact(); });
  const reduced = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const simple = effectiveVisualMode(readBattleVisualMode(), reduced) === 'simple';
  const color = COLORS[element];
  const graphics = scene.add.graphics().setDepth(25);
  const timers: Phaser.Time.TimerEvent[] = [];
  let ended = false;
  const cleanup = () => {
    if (ended) return;
    ended = true;
    lifecycle.cancel();
    timers.forEach(timer => timer.remove(false));
    scene.tweens.killTweensOf(graphics);
    graphics.destroy();
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  const draw = (phase: 'windup' | 'projectile' | 'impact') => {
    graphics.clear();
    graphics.lineStyle(3, color, 0.95);
    graphics.fillStyle(color, 0.9);
    if (shield) {
      graphics.strokeCircle(0, 0, phase === 'windup' ? 48 : 82);
      graphics.lineStyle(2, 0xffffff, 0.7); graphics.strokeCircle(0, 0, 68);
    } else if (element === 'fire') {
      graphics.fillTriangle(-25, 12, 0, -30, 24, 12);
      graphics.fillCircle(0, 9, 22);
      graphics.fillStyle(0xffe5a0, 1); graphics.fillTriangle(-10, 15, 0, -8, 12, 15);
    } else if (element === 'water') {
      graphics.fillCircle(0, 4, 22); graphics.fillTriangle(-20, -2, 0, -32, 20, -2);
      graphics.lineStyle(3, 0xd6f7ff, 0.9); graphics.arc(0, 5, 14, 0.3, 2.7); graphics.strokePath();
    } else if (element === 'wind') {
      for (let i = 0; i < 3; i++) { graphics.beginPath(); graphics.arc(i * 10 - 10, i * 12 - 12, 23, -1.9, 1.2); graphics.strokePath(); }
    } else if (element === 'earth') {
      graphics.fillPoints([new Phaser.Geom.Point(-25, 12), new Phaser.Geom.Point(-14, -18), new Phaser.Geom.Point(10, -28), new Phaser.Geom.Point(28, 5), new Phaser.Geom.Point(9, 24)], true);
      graphics.lineStyle(3, 0xf6deb1, 1); graphics.lineBetween(-11, -11, 9, -18);
    } else {
      graphics.fillTriangle(0, -32, -13, 8, 13, 8); graphics.fillTriangle(0, 32, -13, -8, 13, -8);
      graphics.fillTriangle(-32, 0, 8, -12, 8, 12); graphics.fillTriangle(32, 0, -8, -12, -8, 12);
    }
    if (phase === 'impact' && !shield) {
      graphics.lineStyle(3, color, 0.9);
      for (let i = 0; i < (simple ? 4 : 8); i++) {
        const angle = i * Math.PI / (simple ? 2 : 4);
        graphics.lineBetween(Math.cos(angle) * 36, Math.sin(angle) * 36, Math.cos(angle) * 62, Math.sin(angle) * 62);
      }
    }
  };
  graphics.setPosition(source.x, source.y).setScale(simple ? 0.8 : 0.55);
  draw('windup');
  const impact = () => {
    if (ended) return;
    graphics.setPosition(target.x, target.y).setScale(1);
    draw('impact');
    lifecycle.impact();
    scene.tweens.add({ targets: graphics, alpha: 0, scale: simple ? 1 : 1.45, duration: simple ? 80 : 150, onComplete: cleanup });
  };
  if (simple) timers.push(scene.time.delayedCall(80, impact));
  else {
    scene.tweens.add({ targets: graphics, scale: 1.1, duration: 90 });
    timers.push(scene.time.delayedCall(90, () => {
      if (ended) return;
      draw('projectile');
      scene.tweens.add({ targets: graphics, x: target.x, y: target.y, duration: shield ? 90 : 190, ease: 'Sine.easeIn', onComplete: impact });
    }));
  }
  return cleanup;
}
