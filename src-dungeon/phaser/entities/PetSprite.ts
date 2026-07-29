import Phaser from 'phaser';
import type { PhaserPetConfig } from '../types';

export class PetSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private elementBadge: Phaser.GameObjects.Text;
  private levelText: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Ellipse;
  private readonly homeX: number;
  private readonly homeY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PhaserPetConfig) {
    super(scene, x, y);
    this.homeX = x;
    this.homeY = y;

    // 地面阴影
    this.shadow = scene.add.ellipse(0, 60, 120, 30, 0x000000, 0.3);
    this.add(this.shadow);

    // 宠物图：纹理存在用图，不存在生成 fallback 纹理（灰色圆），避免 missing 纹理报错/黑屏
    // sprite 始终是 Image，保证 setFlipX/setTint 等方法可用
    const textureExists = scene.textures.exists(config.textureKey);
    if (!textureExists) {
      if (!scene.textures.exists('petFallback')) {
        const g = scene.add.graphics();
        g.fillStyle(0x2a2a3e, 1);
        g.fillCircle(80, 80, 80);
        g.lineStyle(3, 0x4a4a6a, 1);
        g.strokeCircle(80, 80, 78);
        g.generateTexture('petFallback', 160, 160);
        g.destroy();
      }
    }
    this.sprite = scene.add.image(0, 0, textureExists ? config.textureKey : 'petFallback');
    this.sprite.setDisplaySize(160, 160);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setOrigin(0.5, 0.5);
    this.add(this.sprite);

    // 元素徽章
    this.elementBadge = scene.add.text(-60, -70, this.getElementEmoji(config.element), {
      fontSize: '24px',
    });
    this.add(this.elementBadge);

    // 等级
    this.levelText = scene.add.text(50, -70, `Lv.${config.level}`, {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.add(this.levelText);

    // 名字
    this.nameText = scene.add.text(0, 95, config.displayName, {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0);
    this.add(this.nameText);

    // 敌方镜像翻转
    if (!config.isPlayer) {
      this.sprite.setFlipX(true);
    }

    scene.add.existing(this);
  }

  playAttackAnimation(targetX: number, targetY: number, onComplete: () => void): void {
    this.scene.tweens.killTweensOf(this);
    this.resetToHome();
    const midX = (this.homeX + targetX) / 2;
    const midY = (this.homeY + targetY) / 2 - 40;

    this.scene.tweens.add({
      targets: this,
      x: midX,
      y: midY,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 150,
      ease: 'Sine.easeOut',
      yoyo: true,
      onComplete: () => {
        this.resetToHome();
        onComplete();
      },
    });
  }

  playHitAnimation(): void {
    this.scene.tweens.killTweensOf(this);
    this.resetToHome();
    this.scene.tweens.add({
      targets: this,
      x: this.homeX + (this.sprite.flipX ? -12 : 12),
      duration: 60,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onComplete: () => this.resetToHome(),
    });

    this.sprite.setTint(0xff0000);
    this.scene.time.delayedCall(200, () => {
      this.sprite.clearTint();
    });
  }

  playMissAnimation(): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0.5,
      duration: 100,
      yoyo: true,
      repeat: 1,
    });
  }

  playCelebrateAnimation(): void {
    this.scene.tweens.killTweensOf(this);
    this.resetToHome();
    this.scene.tweens.add({
      targets: this,
      y: this.homeY - 20,
      duration: 300,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.resetToHome();
      },
    });
  }

  playDefeatAnimation(onComplete?: () => void): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      angle: 90,
      duration: 600,
      ease: 'Power2',
      onComplete,
    });
  }

  private resetToHome(): void {
    this.x = this.homeX;
    this.y = this.homeY;
    this.setScale(1);
  }

  private getElementEmoji(element: string): string {
    const map: Record<string, string> = {
      fire: '🔴', wind: '🟢', earth: '🟫', water: '🔵', light: '🌟',
    };
    return map[element] || '❓';
  }
}
