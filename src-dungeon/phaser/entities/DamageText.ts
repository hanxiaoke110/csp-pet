import Phaser from 'phaser';

export type DamageTextType = 'normal' | 'crit' | 'miss' | 'heal' | 'blocked';

export class DamageText extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, value: string, type: DamageTextType = 'normal') {
    super(scene, x, y);

    const config = this.getStyle(type);
    const text = scene.add.text(0, 0, value, {
      fontSize: config.size,
      color: config.color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.add(text);

    scene.add.existing(this);

    // 上浮动画
    scene.tweens.add({
      targets: this,
      y: y - 60,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => this.destroy(),
    });

    // 缩放动画
    scene.tweens.add({
      targets: text,
      scaleX: type === 'crit' ? 1.5 : 1.1,
      scaleY: type === 'crit' ? 1.5 : 1.1,
      duration: 150,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  private getStyle(type: DamageTextType): { color: string; size: string } {
    switch (type) {
      case 'crit': return { color: '#ffaa00', size: '28px' };
      case 'miss': return { color: '#888888', size: '22px' };
      case 'heal': return { color: '#00ff41', size: '22px' };
      case 'blocked': return { color: '#4488ff', size: '20px' };
      default: return { color: '#ffffff', size: '24px' };
    }
  }
}
