import Phaser from 'phaser';

export class TurnIndicator extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.bg = scene.add.rectangle(0, 0, 160, 32, 0x000000, 0.6);
    this.bg.setStrokeStyle(2, 0xffd700, 0.5);
    this.add(this.bg);

    this.text = scene.add.text(0, 0, '我方回合', {
      fontSize: '16px',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add(this.text);

    scene.add.existing(this);
  }

  setTurn(isPlayerTurn: boolean): void {
    this.text.setText(isPlayerTurn ? '我方回合' : '敌方回合');
    this.text.setColor(isPlayerTurn ? '#ffd700' : '#ff4444');
    this.bg.setStrokeStyle(2, isPlayerTurn ? 0xffd700 : 0xff4444, 0.5);

    this.scene.tweens.add({
      targets: this,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 150,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }
}
