import Phaser from 'phaser';
import type { SkillDefinition } from '../../data/skills';
import type { PhaserSkillCard } from '../types';
import { Card } from './Card';

export class CardHand extends Phaser.GameObjects.Container {
  private cards: Card[] = [];
  private onCardSelect: (skillId: string) => void;
  private skillCards: PhaserSkillCard[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, onCardSelect: (skillId: string) => void) {
    super(scene, x, y);
    this.onCardSelect = onCardSelect;
    scene.add.existing(this);
  }

  setSkills(skills: SkillDefinition[], usages: PhaserSkillCard[]): void {
    // 清空旧卡牌
    this.cards.forEach(c => c.destroy());
    this.cards = [];
    this.skillCards = usages;

    const cardWidth = 90;
    const gap = 20;
    const totalWidth = skills.length * cardWidth + (skills.length - 1) * gap;
    const startX = -totalWidth / 2 + cardWidth / 2;

    skills.forEach((skill, index) => {
      const card = new Card(this.scene, startX + index * (cardWidth + gap), 0, skill);
      card.on('pointerdown', () => this.handleCardClick(card));
      this.add(card);
      this.cards.push(card);
    });

    this.updateCardStates();
  }

  updateCardStates(energy?: number, isPlayerTurn?: boolean): void {
    this.cards.forEach(card => {
      const usage = this.skillCards.find(u => u.skill.id === card.getSkillId());
      if (!usage) return;

      const skill = usage.skill;
      let disabled = false;
      let reason = '';

      if (isPlayerTurn === false) {
        disabled = true;
        reason = '敌方回合';
      } else if (energy !== undefined && energy < skill.energyCost) {
        disabled = true;
        reason = '能量不足';
      } else if (usage.cooldownRemaining > 0) {
        disabled = true;
        reason = `冷却 ${usage.cooldownRemaining}`;
      } else if (skill.maxUsesPerBattle !== null && usage.usedCount >= skill.maxUsesPerBattle) {
        disabled = true;
        reason = '次数耗尽';
      }

      card.setDisabled(disabled, reason);
    });
  }

  private handleCardClick(card: Card): void {
    const usage = this.skillCards.find(u => u.skill.id === card.getSkillId());
    if (!usage || card.isDisabledState()) return;

    card.playSelectAnimation();
    this.onCardSelect(card.getSkillId());
  }
}
