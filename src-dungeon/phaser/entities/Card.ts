import Phaser from 'phaser';
import type { SkillDefinition } from '../../data/skills';

const KNOWLEDGE_TAG_COLORS: Record<string, number> = {
  grammar: 0x4488ff,
  'control-flow': 0xff4444,
  'data-structure': 0x44ff88,
  algorithm: 0xffaa00,
};

export class Card extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private costText: Phaser.GameObjects.Text;
  private cooldownText: Phaser.GameObjects.Text;
  private skill: SkillDefinition;
  private isDisabled: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, skill: SkillDefinition) {
    super(scene, x, y);

    this.skill = skill;
    const color = KNOWLEDGE_TAG_COLORS[skill.knowledgeTag] || 0x888888;

    // 卡牌背景
    this.bg = scene.add.rectangle(0, 0, 90, 120, 0x1a1a2e);
    this.bg.setStrokeStyle(3, color, 1);
    this.add(this.bg);

    // 顶部装饰条
    const header = scene.add.rectangle(0, -45, 84, 20, color, 0.5);
    this.add(header);

    // 能量消耗
    this.costText = scene.add.text(-32, -52, `${skill.energyCost}⚡`, {
      fontSize: '14px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.add(this.costText);

    // 技能名
    this.nameText = scene.add.text(0, -10, skill.name, {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 80 },
    }).setOrigin(0.5);
    this.add(this.nameText);

    // 知识点标签
    const tagText = scene.add.text(0, 25, skill.knowledgeLabel, {
      fontSize: '10px',
      color: '#aaaaaa',
    }).setOrigin(0.5);
    this.add(tagText);

    // 冷却/次数状态
    this.cooldownText = scene.add.text(0, 48, '', {
      fontSize: '10px',
      color: '#ff4444',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add(this.cooldownText);

    // 交互
    this.setSize(90, 120);
    this.setInteractive();
    this.on('pointerover', () => this.onHover());
    this.on('pointerout', () => this.onOut());

    scene.add.existing(this);
  }

  getSkillId(): string {
    return this.skill.id;
  }

  setDisabled(disabled: boolean, reason?: string): void {
    this.isDisabled = disabled;
    this.setAlpha(disabled ? 0.5 : 1);
    this.cooldownText.setText(reason || '');
  }

  isDisabledState(): boolean {
    return this.isDisabled;
  }

  setCooldown(turns: number): void {
    if (turns > 0) {
      this.setDisabled(true, `冷却 ${turns}`);
    }
  }

  setUsesRemaining(used: number, max: number | null): void {
    if (max !== null && used >= max) {
      this.setDisabled(true, '次数耗尽');
    }
  }

  playSelectAnimation(): void {
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.1,
      scaleY: 1.1,
      y: this.y - 20,
      duration: 150,
      ease: 'Back.easeOut',
    });
  }

  playUseAnimation(onComplete: () => void): void {
    this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 200,
      ease: 'Back.easeIn',
      onComplete,
    });
  }

  private onHover(): void {
    if (this.isDisabled) return;
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.08,
      scaleY: 1.08,
      y: this.y - 8,
      duration: 100,
      ease: 'Sine.easeOut',
    });
  }

  private onOut(): void {
    if (this.isDisabled) return;
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1,
      scaleY: 1,
      y: this.y + 8,
      duration: 100,
      ease: 'Sine.easeOut',
    });
  }
}
