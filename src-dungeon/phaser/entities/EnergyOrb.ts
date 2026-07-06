import Phaser from 'phaser';

export class EnergyOrb extends Phaser.GameObjects.Container {
  private orb: Phaser.GameObjects.Arc;
  private glow: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number = 12) {
    super(scene, x, y);

    // 光晕
    this.glow = scene.add.arc(0, 0, radius + 4, 0, 360, false, 0xffd700, 0);
    this.add(this.glow);

    // 球体
    this.orb = scene.add.arc(0, 0, radius, 0, 360, false, 0x333333);
    this.orb.setStrokeStyle(2, 0xffd700, 0.5);
    this.add(this.orb);

    scene.add.existing(this);
  }

  setOrbActive(active: boolean): this {
    this.orb.setFillStyle(active ? 0xffd700 : 0x333333);
    this.glow.setAlpha(active ? 0.6 : 0);

    this.scene.tweens.killTweensOf(this.glow);
    if (active) {
      this.glow.setScale(1);
      this.scene.tweens.add({
        targets: this.glow,
        scaleX: 1.3,
        scaleY: 1.3,
        alpha: 0,
        duration: 800,
        repeat: -1,
        ease: 'Sine.easeOut',
      });
    } else {
      this.glow.setScale(1);
      this.glow.setAlpha(0);
    }
    return this;
  }

  pulse(): this {
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 150,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    return this;
  }
}
