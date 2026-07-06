import Phaser from 'phaser';
import type { EnemyIntent } from '../types';
import { INTENT_CONFIG } from '../types';

export class IntentBubble extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private iconText: Phaser.GameObjects.Text;
  private labelText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.setAlpha(0);

    this.bg = scene.add.rectangle(0, 0, 110, 36, 0x000000, 0.8);
    this.bg.setStrokeStyle(2, 0xffffff, 0.5);
    this.add(this.bg);

    this.iconText = scene.add.text(-36, 0, '⚔️', { fontSize: '18px' }).setOrigin(0.5);
    this.add(this.iconText);

    this.labelText = scene.add.text(8, 0, '普通攻击', {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add(this.labelText);

    scene.add.existing(this);
  }

  showIntent(intent: EnemyIntent): void {
    const config = INTENT_CONFIG[intent.type];
    this.iconText.setText(config.icon);
    this.labelText.setText(config.label);
    this.labelText.setColor(config.color);
    this.bg.setStrokeStyle(2, parseInt(config.color.replace('#', '0x')), 0.8);

    this.setAlpha(1);
    this.setScale(1);

    // 清除旧呼吸动画，避免叠加
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  hide(): void {
    this.scene.tweens.killTweensOf(this);
    this.setScale(1);
    this.setAlpha(0);
  }
}
