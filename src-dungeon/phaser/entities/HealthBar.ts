import Phaser from 'phaser';

export class HealthBar extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private fill: Phaser.GameObjects.Rectangle;
  private text: Phaser.GameObjects.Text;
  private maxHp: number;
  private currentHp: number;
  private color: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    maxHp: number,
    currentHp: number,
    color: number = 0x00ff41
  ) {
    super(scene, x, y);

    this.maxHp = maxHp;
    this.currentHp = currentHp;
    this.color = color;

    // 背景
    this.bg = scene.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    this.bg.setStrokeStyle(2, 0xffffff, 0.3);
    this.add(this.bg);

    // 填充
    const fillWidth = width * (currentHp / maxHp);
    this.fill = scene.add.rectangle(-(width - fillWidth) / 2, 0, fillWidth, height - 4, color);
    this.add(this.fill);

    // 文字
    this.text = scene.add.text(0, 0, `${currentHp}/${maxHp}`, {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add(this.text);

    scene.add.existing(this);
  }

  updateHp(currentHp: number, maxHp?: number): void {
    if (maxHp !== undefined) {
      this.maxHp = maxHp;
    }
    this.currentHp = Math.max(0, currentHp);

    const width = this.bg.width;
    const ratio = this.maxHp > 0 ? this.currentHp / this.maxHp : 0;
    const fillWidth = width * ratio;

    this.fill.setSize(fillWidth, this.fill.height);
    this.fill.setPosition(-(width - fillWidth) / 2, 0);
    this.text.setText(`${Math.floor(this.currentHp)}/${this.maxHp}`);

    // 血量低时变红
    if (ratio < 0.3) {
      this.fill.setFillStyle(0xff3333);
    } else {
      this.fill.setFillStyle(this.color);
    }
  }
}
