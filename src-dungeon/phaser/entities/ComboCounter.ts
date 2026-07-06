import Phaser from 'phaser';

export class ComboCounter extends Phaser.GameObjects.Container {
  private flame: Phaser.GameObjects.Text;
  private countText: Phaser.GameObjects.Text;
  private bonusText: Phaser.GameObjects.Text;
  private combo: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.setAlpha(0);

    this.flame = scene.add.text(-20, 0, '🔥', { fontSize: '28px' }).setOrigin(0.5);
    this.add(this.flame);

    this.countText = scene.add.text(10, -4, 'x0', {
      fontSize: '28px',
      color: '#ff8800',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.add(this.countText);

    this.bonusText = scene.add.text(0, 22, '+0%', {
      fontSize: '12px',
      color: '#ffaa44',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add(this.bonusText);

    scene.add.existing(this);
  }

  setCombo(combo: number): void {
    const oldCombo = this.combo;
    this.combo = combo;

    if (combo > 0) {
      this.setAlpha(1);
      this.countText.setText(`x${combo}`);
      const bonus = Math.min(combo * 10, 50);
      this.bonusText.setText(`+${bonus}% 伤害`);

      if (combo > oldCombo) {
        this.scene.tweens.add({
          targets: this,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 120,
          yoyo: true,
          ease: 'Back.easeOut',
        });
      }
    } else {
      // 连击清零动画
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        angle: 20,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          this.setAngle(0);
        },
      });
    }
  }
}
