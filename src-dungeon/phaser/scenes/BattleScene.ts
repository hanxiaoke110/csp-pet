import Phaser from 'phaser';
import type {
  BattleInitData,
  SkillSelectResult,
  PhaserSkillCard,
} from '../types';
import type { BattleEventCallback } from '../BattlePhaserGame';
import type { EnemyIntent, BurnStack } from '../../types/dungeon';
import { PetSprite } from '../entities/PetSprite';
import { HealthBar } from '../entities/HealthBar';
import { EnergyOrb } from '../entities/EnergyOrb';
import { CardHand } from '../entities/CardHand';
import { TurnIndicator } from '../entities/TurnIndicator';
import { ComboCounter } from '../entities/ComboCounter';
import { IntentBubble } from '../entities/IntentBubble';
import { DamageText, type DamageTextType } from '../entities/DamageText';
import {
  calculateDamage,
  calculateShieldAmount,
  getElementRelation,
  generateEnemyIntent,
  resolveEnemyIntent,
  tickBurnStacks,
} from '../../utils/combatLogic';
import { SKILLS } from '../../data/skills';
import type { SkillDefinition } from '../../data/skills';
import { TRIAL_EQUIPMENT } from '../../data/explorationItems';
import { getTrialCombatProfile, type TrialCombatProfile } from '../../utils/trialEquipmentEffects';


const MAX_ENERGY = 5;
const BOSS_MAX_DAMAGE_RATIO = 0.45;

interface BattleSnapshot {
  playerHp: number;
  playerMaxHp: number;
  enemyHp: number;
  enemyMaxHp: number;
  energy: number;
  maxEnergy: number;
  shield: number;
  combo: number;
  round: number;
  currentTurn: 'player' | 'enemy';
  skillUsages: PhaserSkillCard[];
  burnStacks: BurnStack[];
  enemyIntent: EnemyIntent | null;
  enemyDefending: boolean;
}

export class BattleScene extends Phaser.Scene {
  private initData!: BattleInitData;
  private onEvent!: BattleEventCallback;

  private playerPet!: PetSprite;
  private enemyPet!: PetSprite;
  private playerHpBar!: HealthBar;
  private enemyHpBar!: HealthBar;
  private energyOrbs: EnergyOrb[] = [];
  private cardHand!: CardHand;
  private turnIndicator!: TurnIndicator;
  private comboCounter!: ComboCounter;
  private intentBubble!: IntentBubble;
  private roundText!: Phaser.GameObjects.Text;
  private equipmentStatusText?: Phaser.GameObjects.Text;

  private state!: BattleSnapshot;
  private isProcessing: boolean = false;
  private pendingSkillId: string | null = null;
  private sceneBuilt: boolean = false;
  private equipmentProfile!: TrialCombatProfile;
  private correctShieldTriggers = 0;
  private attackBoostTriggers = 0;
  private comboBoostTriggers = 0;
  private firstHpReductionUsed = false;
  private lowHpRecoveryUsed = false;

  constructor() {
    super({ key: 'BattleScene' });
  }

  // Phaser 标准生命周期：scene.start(data) → init(data) → preload() → create()
  // 之前用 scene.add(false) + 手动 initBattle，导致 load 不工作（scene 未启动），黑屏。
  init(data: { initData: BattleInitData; onEvent: BattleEventCallback }): void {
    this.initData = data.initData;
    this.onEvent = data.onEvent;
    this.equipmentProfile = getTrialCombatProfile(data.initData.trialLoadout?.weaponId, data.initData.trialLoadout?.armorId);
    this.correctShieldTriggers = 0;
    this.attackBoostTriggers = 0;
    this.comboBoostTriggers = 0;
    this.firstHpReductionUsed = false;
    this.lowHpRecoveryUsed = false;
    const initialShield = Math.max(0, Math.floor(data.initData.playerPet.maxHp * this.equipmentProfile.initialShieldRatio));

    // 初始化战斗快照
    this.state = {
      playerHp: data.initData.playerPet.currentHp,
      playerMaxHp: data.initData.playerPet.maxHp,
      enemyHp: data.initData.enemyPet.currentHp,
      enemyMaxHp: data.initData.enemyPet.maxHp,
      energy: data.initData.initialEnergy - 1,
      maxEnergy: data.initData.maxEnergy,
      shield: initialShield,
      combo: 0,
      round: 0,
      currentTurn: 'player',
      skillUsages: SKILLS.map(s => ({ skill: s, usedCount: 0, cooldownRemaining: 0 })),
      burnStacks: [],
      enemyIntent: null,
      enemyDefending: false,
    };
  }

  preload(): void {
    // scene 启动后 load 才工作；用 config.textureKey 作为纹理 key（工坊宠物用 playerPetThumb 区分）
    this.load.image(this.initData.playerPet.textureKey, this.initData.playerPet.previewUrl);
    this.load.image(this.initData.enemyPet.textureKey, this.initData.enemyPet.previewUrl);
  }

  create(): void {
    // preload 完成后自动调用，构建场景并开始第一回合
    this.buildScene();
    this.startPlayerTurn();
  }

  private buildScene(): void {
    if (this.sceneBuilt) return;
    this.sceneBuilt = true;

    const { width, height } = this.scale;

    // 背景：渐变或图片
    this.createBackground();

    // 标题
    this.add.text(width / 2, 16, this.initData.dungeonName, {
      fontSize: '16px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    // 回合指示器
    this.turnIndicator = new TurnIndicator(this, width / 2, 48);

    // 回合数
    this.roundText = this.add.text(width / 2, 72, `第 ${this.state?.round || 1} 回合`, {
      fontSize: '12px',
      color: '#aaaaaa',
    }).setOrigin(0.5, 0);

    this.createElementRelationLabel();

    // 敌方宠物（左侧）
    this.enemyPet = new PetSprite(this, 220, 180, this.initData.enemyPet);

    // 敌方血条
    this.enemyHpBar = new HealthBar(this, 220, 265, 180, 18, this.initData.enemyPet.maxHp, this.initData.enemyPet.currentHp, 0xff4444);

    // 敌方意图气泡
    this.intentBubble = new IntentBubble(this, 220, 90);

    // 我方宠物（右侧）
    this.playerPet = new PetSprite(this, width - 220, 200, this.initData.playerPet);

    // 我方血条
    this.playerHpBar = new HealthBar(this, width - 220, 285, 180, 18, this.initData.playerPet.maxHp, this.initData.playerPet.currentHp, 0x00ff41);

    this.createEquipmentLabel();
    if (this.state.shield > 0) this.showTraitText(`护甲生效：+${this.state.shield} 护盾`, '#7dd3fc');

    // 能量球
    this.createEnergyOrbs();

    // 连击计数器
    this.comboCounter = new ComboCounter(this, width - 80, 80);

    // 卡牌手牌
    this.cardHand = new CardHand(this, width / 2, height - 70, (skillId) => this.onSkillSelected(skillId));
    this.cardHand.setSkills(SKILLS, this.state.skillUsages);
  }

  private createBackground(): void {
    const { width, height } = this.scale;
    const color = this.initData.dungeonColor || '#1a1a2e';

    // 先用纯色渐变背景，后续可替换为图片
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(
      parseInt(color.replace('#', '0x')),
      parseInt(color.replace('#', '0x')),
      0x0a0a0a,
      0x0a0a0a,
      0.4,
      0.4,
      1,
      1
    );
    graphics.fillRect(0, 0, width, height);

    // 如果有背景图则加载
    if (this.initData.dungeonBgImage) {
      this.load.image('dungeonBg', this.initData.dungeonBgImage);
      this.load.once('complete', () => {
        const bg = this.add.image(width / 2, height / 2, 'dungeonBg');
        bg.setDisplaySize(width, height);
        bg.setAlpha(0.92);
        bg.setDepth(-1);
      });
      this.load.start();
    }
  }

  private createEnergyOrbs(): void {
    const { width } = this.scale;
    const startX = width - 220 - 60;
    const y = 315;

    for (let i = 0; i < MAX_ENERGY; i++) {
      const orb = new EnergyOrb(this, startX + i * 28, y, 10);
      this.energyOrbs.push(orb);
    }
    this.updateEnergyDisplay();
  }

  private updateEnergyDisplay(): void {
    this.energyOrbs.forEach((orb, index) => {
      orb.setOrbActive(index < this.state.energy);
    });
  }

  private startPlayerTurn(): void {
    this.state.currentTurn = 'player';
    this.state.round++;
    this.roundText.setText(`第 ${this.state.round} 回合`);

    // 50 回合上限判定
    if (this.state.round > 50) {
      const playerRatio = this.state.playerHp / this.state.playerMaxHp;
      const enemyRatio = this.state.enemyHp / this.state.enemyMaxHp;
      this.endBattle(playerRatio >= enemyRatio);
      return;
    }

    // 能量回复
    this.state.energy = Math.min(this.state.maxEnergy, this.state.energy + 1);
    this.updateEnergyDisplay();

    // 冷却减少
    this.state.skillUsages.forEach(u => {
      if (u.cooldownRemaining > 0) u.cooldownRemaining--;
    });

    // 灼烧结算（敌方受灼烧伤害）
    if (this.state.burnStacks.length > 0) {
      const { totalDamage, remaining } = tickBurnStacks(this.state.burnStacks);
      this.state.burnStacks = remaining;
      if (totalDamage > 0) {
        this.applyDamageToEnemy(totalDamage, 'normal');
        this.showDamageText(this.enemyPet.x, this.enemyPet.y - 80, `-${totalDamage} 灼烧`, 'normal');
      }
    }

    this.turnIndicator.setTurn(true);
    this.cardHand.updateCardStates(this.state.energy, true);

    // 生成敌方意图
    this.state.enemyIntent = generateEnemyIntent(
      this.state.enemyHp / this.state.enemyMaxHp,
      this.state.playerHp / this.state.playerMaxHp,
      this.initData.enemyPet.attack
    );
    this.intentBubble.showIntent(this.state.enemyIntent);

    this.isProcessing = false;
  }

  private onSkillSelected(skillId: string): void {
    if (this.isProcessing || this.state.currentTurn !== 'player') return;

    const usage = this.state.skillUsages.find(u => u.skill.id === skillId);
    const skill = usage?.skill;
    if (!skill || !usage) return;

    // 二次校验
    if (this.state.energy < skill.energyCost) return;
    if (usage.cooldownRemaining > 0) return;
    if (skill.maxUsesPerBattle !== null && usage.usedCount >= skill.maxUsesPerBattle) return;

    this.isProcessing = true;
    this.pendingSkillId = skillId;

    // 通知 React 显示题目
    this.onEvent('skillSelected', { skillId });
  }

  /** React 侧“重试”时重新进入选技能流程：复用能量/冷却/次数等完整校验 */
  retrySkill(skillId: string): void {
    this.onSkillSelected(skillId);
  }

  handleAnswerResult(result: SkillSelectResult): void {
    if (!this.pendingSkillId || this.pendingSkillId !== result.skillId) return;

    const usage = this.state.skillUsages.find(u => u.skill.id === this.pendingSkillId);
    if (!usage) return;

    const skill = usage.skill;

    // 二次校验：防止 React 侧竞速/重复回调导致状态异常
    if (this.state.energy < skill.energyCost) return;
    if (usage.cooldownRemaining > 0) return;
    if (skill.maxUsesPerBattle !== null && usage.usedCount >= skill.maxUsesPerBattle) return;

    // 消耗能量
    this.state.energy -= skill.energyCost;
    this.updateEnergyDisplay();

    // 更新使用次数和冷却
    usage.usedCount++;
    usage.cooldownRemaining = skill.cooldown;

    if (result.isCorrect) {
      this.state.combo++;
      this.applyPlayerElementTrait();
      this.applyCorrectEquipmentEffect();
      this.executePlayerSkill(skill, true);
    } else {
      this.state.combo = 0;
      this.executePlayerSkill(skill, false);
    }

    this.comboCounter.setCombo(this.state.combo);
    this.pendingSkillId = null;
  }

  /** Abort a question that could not be rendered without charging the player. */
  cancelPendingSkill(): void {
    if (!this.pendingSkillId) return;
    this.pendingSkillId = null;
    this.isProcessing = false;
    this.cardHand.updateCardStates(this.state.energy, true);
  }

  private executePlayerSkill(skill: SkillDefinition, isCorrect: boolean): void {
    const answerQuality = isCorrect ? 1.0 : 0.3;
    const equipmentMultiplier = skill.effectType === 'shield' ? 1 : this.getEquipmentDamageMultiplier(isCorrect);

    switch (skill.effectType) {
      case 'shield': {
        const shieldAmount = calculateShieldAmount(this.state.playerMaxHp, isCorrect);
        this.playSkillEffect(skill, () => {
          this.state.shield += shieldAmount;
          this.updateEquipmentStatus();
          this.showDamageText(this.playerPet.x, this.playerPet.y - 80, `+${shieldAmount} 护盾`, 'heal');
          this.playerPet.playCelebrateAnimation();
          this.finishPlayerTurn();
        });
        break;
      }

      case 'damage_dot': {
        const defenseMultiplier = this.state.enemyDefending ? 0.5 : 1;
        const damage = Math.floor(calculateDamage(
          this.toCombatPet(this.initData.playerPet, this.state.playerHp),
          this.toCombatPet(this.initData.enemyPet, this.state.enemyHp),
          skill.multiplier,
          answerQuality * defenseMultiplier * this.getFireDamageBoost(isCorrect) * equipmentMultiplier,
          this.state.combo
        ));

        this.playerPet.playAttackAnimation(this.enemyPet.x, this.enemyPet.y, () => {
          this.playSkillEffect(skill, () => {
            this.applyDamageToEnemy(damage, isCorrect ? 'normal' : 'miss');
            this.enemyPet.playHitAnimation();

            if (isCorrect) {
              this.state.burnStacks.push({ damage: 3, turnsRemaining: 2, sourceSkillId: skill.id });
            }

            this.finishPlayerTurn();
          });
        });
        break;
      }

      case 'damage':
      default: {
        const isCrit = isCorrect && Math.random() < 0.15;
        const critMultiplier = isCrit ? 1.5 : 1;
        const defenseMultiplier = this.state.enemyDefending ? 0.5 : 1;
        const damage = Math.floor(calculateDamage(
          this.toCombatPet(this.initData.playerPet, this.state.playerHp),
          this.toCombatPet(this.initData.enemyPet, this.state.enemyHp),
          skill.multiplier,
          answerQuality * critMultiplier * defenseMultiplier * this.getFireDamageBoost(isCorrect) * equipmentMultiplier,
          this.state.combo
        ));

        this.playerPet.playAttackAnimation(this.enemyPet.x, this.enemyPet.y, () => {
          this.playSkillEffect(skill, () => {
            this.applyDamageToEnemy(damage, isCorrect ? (isCrit ? 'crit' : 'normal') : 'miss');
            this.enemyPet.playHitAnimation();
            this.finishPlayerTurn();
          });
        });
        break;
      }
    }

    this.cardHand.updateCardStates(this.state.energy, false);
  }

  private finishPlayerTurn(): void {
    // 清除敌方防御姿态（只生效一次）
    this.state.enemyDefending = false;

    // 检查敌方死亡
    if (this.state.enemyHp <= 0) {
      this.endBattle(true);
      return;
    }

    // 切换敌方回合
    this.time.delayedCall(500, () => {
      this.startEnemyTurn();
    });
  }

  private createElementRelationLabel(): void {
    const { width } = this.scale;
    const playerElement = this.getElementInfo(this.initData.playerPet.element);
    const enemyElement = this.getElementInfo(this.initData.enemyPet.element);
    const relation = getElementRelation(this.initData.playerPet.element, this.initData.enemyPet.element);
    const relationText = relation === 'advantage' ? '克制' : relation === 'disadvantage' ? '被克制' : '势均力敌';
    const color = relation === 'advantage' ? '#6ee7b7' : relation === 'disadvantage' ? '#fca5a5' : '#cbd5e1';
    this.add.text(width / 2, 94, `${playerElement.icon}${playerElement.name}  ${relationText}  ${enemyElement.icon}${enemyElement.name}`, {
      fontSize: '13px',
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(10);
  }

  private createEquipmentLabel(): void {
    if (!this.initData.trialLoadout?.weaponId && !this.initData.trialLoadout?.armorId && !this.initData.trialLoadout?.artifactId) return;
    this.equipmentStatusText = this.add.text(this.scale.width / 2, 116, '', {
      fontSize: '10px', color: '#f8d477', align: 'center', lineSpacing: 3, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(10);
    this.updateEquipmentStatus();
  }

  private updateEquipmentStatus(): void {
    if (!this.equipmentStatusText) return;
    const weaponId = this.initData.trialLoadout?.weaponId;
    const armorId = this.initData.trialLoadout?.armorId;
    const artifactId = this.initData.trialLoadout?.artifactId;
    const parts: string[] = [];
    if (weaponId) {
      const name = TRIAL_EQUIPMENT[weaponId]?.name || '武器';
      if (this.equipmentProfile.comboThreeLimit > 0) parts.push(`${name}：三连追击 ${this.comboBoostTriggers}/${this.equipmentProfile.comboThreeLimit}`);
      else if (this.equipmentProfile.correctShieldLimit > 0) parts.push(`${name}：答对触发 ${Math.max(this.correctShieldTriggers, this.attackBoostTriggers)}/${this.equipmentProfile.correctShieldLimit}`);
      else parts.push(`${name}：本场生效`);
    }
    if (armorId) {
      const name = TRIAL_EQUIPMENT[armorId]?.name || '护甲';
      if (this.equipmentProfile.firstHpHitReduction > 0) parts.push(`${name}：首次减伤${this.firstHpReductionUsed ? '已触发' : '可用'}`);
      else if (this.equipmentProfile.lowHpShieldRatio > 0) parts.push(`${name}：低生命恢复${this.lowHpRecoveryUsed ? '已触发' : '可用'}`);
      else if (this.equipmentProfile.shieldedElementBoost > 0) parts.push(`${name}：护盾增伤${this.state.shield > 0 ? '生效中' : '已暂停'}`);
      else parts.push(`${name}：开场护盾已生效`);
    }
    if (artifactId) parts.push(`${TRIAL_EQUIPMENT[artifactId]?.name || '法器'}：仅普通迷宫生效`);
    this.equipmentStatusText.setText(parts.join('　|　'));
  }

  private applyCorrectEquipmentEffect(): void {
    const profile = this.equipmentProfile;
    if (profile.correctShieldRatio <= 0 || this.correctShieldTriggers >= profile.correctShieldLimit) return;
    const amount = Math.max(1, Math.floor(this.state.playerMaxHp * profile.correctShieldRatio));
    this.correctShieldTriggers++;
    this.state.shield += amount;
    this.updateEquipmentStatus();
    this.showTraitText(`装备触发：+${amount} 护盾（${this.correctShieldTriggers}/${profile.correctShieldLimit}）`, '#67e8f9');
  }

  private getEquipmentDamageMultiplier(isCorrect: boolean): number {
    if (!isCorrect) return 1;
    const profile = this.equipmentProfile;
    let multiplier = 1;
    if (profile.nextAttackBoost > 0 && this.attackBoostTriggers < profile.correctShieldLimit) {
      this.attackBoostTriggers++;
      multiplier += profile.nextAttackBoost;
      this.showTraitText(`武器增幅 +${Math.round(profile.nextAttackBoost * 100)}%（${this.attackBoostTriggers}/${profile.correctShieldLimit}）`, '#fcd34d');
      this.updateEquipmentStatus();
    }
    if (profile.shieldedElementBoost > 0 && this.state.shield > 0 && ['water', 'earth'].includes(this.initData.playerPet.element)) {
      multiplier += profile.shieldedElementBoost;
      this.showTraitText('玄鳞铠：伤害 +8%', '#93c5fd');
    }
    if (profile.comboThreeBoost > 0 && this.state.combo > 0 && this.state.combo % 3 === 0 && this.comboBoostTriggers < profile.comboThreeLimit) {
      this.comboBoostTriggers++;
      multiplier += profile.comboThreeBoost;
      this.showTraitText(`三连追击 +${Math.round(profile.comboThreeBoost * 100)}%（${this.comboBoostTriggers}/${profile.comboThreeLimit}）`, '#f0abfc');
      this.updateEquipmentStatus();
    }
    return multiplier;
  }

  private getFireDamageBoost(isCorrect: boolean): number {
    return isCorrect && this.initData.playerPet.element === 'fire' ? 1.08 : 1;
  }

  private applyPlayerElementTrait(): void {
    const element = this.initData.playerPet.element;
    if (element === 'earth') {
      const amount = Math.max(1, Math.floor(this.state.playerMaxHp * 0.03));
      this.state.shield += amount;
      this.updateEquipmentStatus();
      this.showTraitText(`地之守护 +${amount} 护盾`, '#d6a66a');
      return;
    }
    if (element === 'fire') {
      this.showTraitText('火之锋芒：伤害 +8%', '#fb7185');
      return;
    }
    if (this.state.combo === 0 || this.state.combo % 3 !== 0) return;
    if (element === 'wind') {
      this.state.skillUsages.forEach(usage => {
        usage.cooldownRemaining = Math.max(0, usage.cooldownRemaining - 1);
      });
      this.showTraitText('风之迅捷：冷却 -1', '#86efac');
    } else if (element === 'water') {
      this.state.energy = Math.min(this.state.maxEnergy, this.state.energy + 1);
      this.updateEnergyDisplay();
      this.showTraitText('水之回响：能量 +1', '#7dd3fc');
    } else if (element === 'light') {
      const amount = Math.max(1, Math.floor(this.state.playerMaxHp * 0.04));
      this.healPlayer(amount);
      this.showTraitText('光之复苏：恢复生命', '#fde68a');
    }
  }

  private showTraitText(text: string, color: string): void {
    const label = this.add.text(this.playerPet.x, this.playerPet.y - 112, text, {
      fontSize: '13px',
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: label, y: label.y - 24, alpha: 0, duration: 850, onComplete: () => label.destroy() });
  }

  private playSkillEffect(skill: SkillDefinition, onImpact: () => void): void {
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 80 : 280;
    const graphics = this.add.graphics().setDepth(25);

    if (skill.id === 'skill-2') {
      graphics.fillStyle(0xff7a18, 1);
      graphics.fillCircle(0, 0, 14);
      graphics.lineStyle(4, 0xffd166, 0.9);
      graphics.strokeCircle(0, 0, 18);
      graphics.setPosition(this.playerPet.x - 40, this.playerPet.y - 10);
      this.tweens.add({
        targets: graphics,
        x: this.enemyPet.x,
        y: this.enemyPet.y,
        scale: 1.35,
        duration,
        ease: 'Quad.easeIn',
        onComplete: () => { graphics.destroy(); onImpact(); },
      });
      return;
    }

    if (skill.id === 'skill-3') {
      graphics.lineStyle(8, 0x38bdf8, 0.9);
      graphics.strokeCircle(0, 0, 72);
      graphics.lineStyle(3, 0xffffff, 0.75);
      graphics.strokeCircle(0, 0, 58);
      graphics.setPosition(this.playerPet.x, this.playerPet.y);
      this.tweens.add({
        targets: graphics,
        scale: 1.2,
        alpha: 0.2,
        duration,
        onComplete: () => { graphics.destroy(); onImpact(); },
      });
      return;
    }

    if (skill.id === 'skill-4') {
      graphics.lineStyle(7, 0xa855f7, 0.95);
      graphics.strokeCircle(0, 0, 24);
      graphics.lineStyle(4, 0xf0abfc, 0.8);
      graphics.strokeCircle(0, 0, 48);
      graphics.strokeCircle(0, 0, 76);
      graphics.setPosition(this.enemyPet.x, this.enemyPet.y);
      graphics.setScale(0.35);
      this.tweens.add({
        targets: graphics,
        scale: 1.35,
        angle: 120,
        alpha: 0,
        duration: reduceMotion ? 100 : 360,
        ease: 'Cubic.easeOut',
        onComplete: () => { graphics.destroy(); onImpact(); },
      });
      return;
    }

    graphics.lineStyle(8, 0x67e8f9, 0.95);
    graphics.lineBetween(this.playerPet.x - 35, this.playerPet.y, this.enemyPet.x + 35, this.enemyPet.y);
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.lineBetween(this.playerPet.x - 35, this.playerPet.y, this.enemyPet.x + 35, this.enemyPet.y);
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: reduceMotion ? 60 : 180,
      onComplete: () => { graphics.destroy(); onImpact(); },
    });
  }

  private getElementInfo(element: string): { icon: string; name: string } {
    const map: Record<string, { icon: string; name: string }> = {
      earth: { icon: '🟫', name: '地' },
      fire: { icon: '🔴', name: '火' },
      wind: { icon: '🟢', name: '风' },
      water: { icon: '🔵', name: '水' },
      light: { icon: '🌟', name: '光' },
    };
    return map[element] || { icon: '❓', name: '未知' };
  }

  private startEnemyTurn(): void {
    this.state.currentTurn = 'enemy';
    this.turnIndicator.setTurn(false);
    this.cardHand.updateCardStates(this.state.energy, false);
    this.intentBubble.hide();

    this.time.delayedCall(800, () => {
      this.executeEnemyTurn();
    });
  }

  private executeEnemyTurn(): void {
    const intent = this.state.enemyIntent;
    if (!intent) return;

    if (intent.type === 'defend') {
      // 防御：下回合玩家伤害减半
      this.state.enemyDefending = true;
      this.showDamageText(this.enemyPet.x, this.enemyPet.y - 100, '防御姿态', 'blocked');
      this.enemyPet.playCelebrateAnimation();
      this.time.delayedCall(800, () => this.startPlayerTurn());
      return;
    }

    // 攻击
    this.enemyPet.playAttackAnimation(this.playerPet.x, this.playerPet.y, () => {
      const { damageTaken, remainingShield, blocked } = resolveEnemyIntent(
        intent,
        this.toCombatPet(this.initData.enemyPet, this.state.enemyHp),
        this.toCombatPet(this.initData.playerPet, this.state.playerHp),
        this.state.shield
      );

      this.state.shield = remainingShield;
      this.updateEquipmentStatus();

      if (blocked) {
        this.showDamageText(this.playerPet.x, this.playerPet.y - 80, 'BLOCK!', 'blocked');
        this.playerPet.playCelebrateAnimation();
      } else {
        let finalDamage = damageTaken;
        if (!this.firstHpReductionUsed && this.equipmentProfile.firstHpHitReduction > 0 && finalDamage > 0) {
          finalDamage = Math.max(1, Math.floor(finalDamage * (1 - this.equipmentProfile.firstHpHitReduction)));
          this.firstHpReductionUsed = true;
          this.updateEquipmentStatus();
          this.showTraitText(`护甲减伤 ${Math.round(this.equipmentProfile.firstHpHitReduction * 100)}%`, '#93c5fd');
        }
        this.applyDamageToPlayer(finalDamage);
        this.playerPet.playHitAnimation();
      }

      // 检查玩家死亡
      if (this.state.playerHp <= 0) {
        this.endBattle(false);
      } else {
        this.time.delayedCall(600, () => this.startPlayerTurn());
      }
    });
  }

  private applyDamageToEnemy(damage: number, type: 'normal' | 'crit' | 'miss'): void {
    const cappedDamage = this.capPlayerDamage(damage);
    if (cappedDamage <= 0) return;
    this.state.enemyHp = Math.max(0, this.state.enemyHp - cappedDamage);
    this.enemyHpBar.updateHp(this.state.enemyHp);
    this.showDamageText(this.enemyPet.x, this.enemyPet.y - 80, `-${cappedDamage}`, type);
  }

  private capPlayerDamage(damage: number): number {
    if (!this.initData.isBoss) return damage;

    const maxDamage = Math.max(1, Math.floor(this.state.enemyMaxHp * BOSS_MAX_DAMAGE_RATIO));
    return Math.min(damage, maxDamage);
  }

  private applyDamageToPlayer(damage: number): void {
    this.state.playerHp = Math.max(0, this.state.playerHp - damage);
    this.playerHpBar.updateHp(this.state.playerHp);
    this.showDamageText(this.playerPet.x, this.playerPet.y - 80, `-${damage}`, 'normal');

    if (!this.lowHpRecoveryUsed && this.state.playerHp > 0 && this.state.playerHp / this.state.playerMaxHp < 0.4 && this.equipmentProfile.lowHpShieldRatio > 0) {
      this.lowHpRecoveryUsed = true;
      const shield = Math.max(1, Math.floor(this.state.playerMaxHp * this.equipmentProfile.lowHpShieldRatio));
      const heal = Math.max(1, Math.floor(this.state.playerMaxHp * this.equipmentProfile.lowHpHealRatio));
      this.state.shield += shield;
      this.healPlayer(heal);
      this.updateEquipmentStatus();
      this.showTraitText(`玄武圣铠：恢复生命并获得 ${shield} 护盾`, '#fde68a');
    }

    // 屏幕震动
    this.cameras.main.shake(150, 0.01);
  }

  public healPlayer(amount: number): void {
    if (this.state.playerHp <= 0 || amount <= 0) return;
    const healed = Math.min(amount, this.state.playerMaxHp - this.state.playerHp);
    if (healed <= 0) return;
    this.state.playerHp += healed;
    this.playerHpBar.updateHp(this.state.playerHp);
    this.showDamageText(this.playerPet.x, this.playerPet.y - 80, `+${healed}`, 'heal');
  }

  private showDamageText(x: number, y: number, text: string, type: DamageTextType): void {
    new DamageText(this, x, y, text, type);
  }

  private endBattle(isWon: boolean): void {
    this.isProcessing = true;

    if (isWon) {
      this.enemyPet.playDefeatAnimation();
      this.playerPet.playCelebrateAnimation();
    } else {
      this.playerPet.playDefeatAnimation();
    }

    this.time.delayedCall(1200, () => {
      this.onEvent('battleEnd', {
        isWon,
        expEarned: 0, // 由 React 根据战斗表现计算
        goldEarned: 0,
        rating: 'D',
        correctCount: 0,
        wrongCount: 0,
        comboCount: this.state.combo,
        roundCount: this.state.round,
        usedSkillIds: this.state.skillUsages.filter(u => u.usedCount > 0).map(u => u.skill.id),
        playerHp: this.state.playerHp,
        playerMaxHp: this.state.playerMaxHp,
        enemyHp: this.state.enemyHp,
        enemyMaxHp: this.state.enemyMaxHp,
      });
    });
  }

  private toCombatPet(config: BattleInitData['playerPet'], currentHp: number) {
    return {
      maxHp: config.maxHp,
      currentHp,
      attack: config.attack,
      defense: config.defense,
      speed: config.speed,
      element: config.element,
      level: config.level,
    };
  }
}
