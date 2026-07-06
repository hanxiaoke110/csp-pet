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
  generateEnemyIntent,
  resolveEnemyIntent,
  tickBurnStacks,
} from '../../utils/combatLogic';
import { SKILLS } from '../../data/skills';
import type { SkillDefinition } from '../../data/skills';


const MAX_ENERGY = 5;

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

  private state!: BattleSnapshot;
  private isProcessing: boolean = false;
  private pendingSkillId: string | null = null;
  private sceneBuilt: boolean = false;

  constructor() {
    super({ key: 'BattleScene' });
  }

  initBattle(data: BattleInitData, callback: BattleEventCallback): void {
    this.initData = data;
    this.onEvent = callback;

    // 初始化战斗快照
    this.state = {
      playerHp: data.playerPet.currentHp,
      playerMaxHp: data.playerPet.maxHp,
      enemyHp: data.enemyPet.currentHp,
      enemyMaxHp: data.enemyPet.maxHp,
      energy: data.initialEnergy - 1,
      maxEnergy: data.maxEnergy,
      shield: 0,
      combo: 0,
      round: 0,
      currentTurn: 'player',
      skillUsages: SKILLS.map(s => ({ skill: s, usedCount: 0, cooldownRemaining: 0 })),
      burnStacks: [],
      enemyIntent: null,
      enemyDefending: false,
    };

    // 加载宠物预览图，加载完成后再构建场景
    this.load.image('playerPet', data.playerPet.previewUrl);
    this.load.image('enemyPet', data.enemyPet.previewUrl);
    this.load.once('complete', () => {
      this.buildScene();
      this.startPlayerTurn();
    });
    this.load.start();
  }

  create(): void {
    // Phaser 会自动调用 create()，但我们在 initBattle() 中才构建场景
    // 如果 initData 未设置，说明是自动调用，直接返回
    if (!this.initData) return;
    this.buildScene();
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
        bg.setAlpha(0.3);
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
      this.executePlayerSkill(skill, true);
    } else {
      this.state.combo = 0;
      this.executePlayerSkill(skill, false);
    }

    this.comboCounter.setCombo(this.state.combo);
    this.pendingSkillId = null;
  }

  private executePlayerSkill(skill: SkillDefinition, isCorrect: boolean): void {
    const answerQuality = isCorrect ? 1.0 : 0.3;

    switch (skill.effectType) {
      case 'shield': {
        const shieldAmount = calculateShieldAmount(this.state.playerMaxHp, isCorrect);
        this.state.shield += shieldAmount;
        this.showDamageText(this.playerPet.x, this.playerPet.y - 80, `+${shieldAmount} 护盾`, 'heal');
        this.playerPet.playCelebrateAnimation();
        this.finishPlayerTurn();
        break;
      }

      case 'damage_dot': {
        const defenseMultiplier = this.state.enemyDefending ? 0.5 : 1;
        const damage = Math.floor(calculateDamage(
          this.toCombatPet(this.initData.playerPet, this.state.playerHp),
          this.toCombatPet(this.initData.enemyPet, this.state.enemyHp),
          skill.multiplier,
          answerQuality * defenseMultiplier,
          this.state.combo
        ));

        this.playerPet.playAttackAnimation(this.enemyPet.x, this.enemyPet.y, () => {
          this.applyDamageToEnemy(damage, isCorrect ? 'normal' : 'miss');
          this.enemyPet.playHitAnimation();

          if (isCorrect) {
            this.state.burnStacks.push({ damage: 3, turnsRemaining: 2, sourceSkillId: skill.id });
          }

          this.finishPlayerTurn();
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
          answerQuality * critMultiplier * defenseMultiplier,
          this.state.combo
        ));

        this.playerPet.playAttackAnimation(this.enemyPet.x, this.enemyPet.y, () => {
          this.applyDamageToEnemy(damage, isCorrect ? (isCrit ? 'crit' : 'normal') : 'miss');
          this.enemyPet.playHitAnimation();
          this.finishPlayerTurn();
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

      if (blocked) {
        this.showDamageText(this.playerPet.x, this.playerPet.y - 80, 'BLOCK!', 'blocked');
        this.playerPet.playCelebrateAnimation();
      } else {
        this.applyDamageToPlayer(damageTaken);
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
    this.state.enemyHp = Math.max(0, this.state.enemyHp - damage);
    this.enemyHpBar.updateHp(this.state.enemyHp);
    this.showDamageText(this.enemyPet.x, this.enemyPet.y - 80, `-${damage}`, type);
  }

  private applyDamageToPlayer(damage: number): void {
    this.state.playerHp = Math.max(0, this.state.playerHp - damage);
    this.playerHpBar.updateHp(this.state.playerHp);
    this.showDamageText(this.playerPet.x, this.playerPet.y - 80, `-${damage}`, 'normal');

    // 屏幕震动
    this.cameras.main.shake(150, 0.01);
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
