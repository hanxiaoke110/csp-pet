import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { SKILLS, getSkillById } from '../../data/skills';
import { pickQuestionsByTag } from '../../utils/questionLoader';
import { calculateDamage, determineFirstAttacker, calculateStats } from '../../utils/combatLogic';
import { calculateAnswerReward, rollCritical, getRankName, calculateBattleRating } from '../../utils/gameLogic';
import { SkillTooltip } from './SkillTooltip';
import { TutorialOverlay } from './TutorialOverlay';
import { ElementGuide } from './ElementGuide';
import FableCard from '../shared/FableCard';
import fables from '../../data/fables.json';
import type { Question, DungeonDefinition, DungeonStage, SkillUsage } from '../../types/dungeon';
import type { OwnedPet, PetElement, PetTier } from '../../../src/types/pet';
import { ELEMENT_EMOJI, getPetTier, getPetConfig, PET_BASE_STATS, TIER_MULTIPLIERS } from '../../../src/types/pet';
import type { CombatPet } from '../../utils/combatLogic';
import { loadWebPet } from '../../utils/webPet';

// ─── Helpers ───

function loadActivePetFromStorage(): OwnedPet {
  // 优先读 Web 专属宠物（Web 端注册时赠送，localStorage 存储）
  const webPet = loadWebPet();
  if (webPet) return webPet;

  // 桌面 App 同源场景：读桌宠数据
  try {
    const raw = localStorage.getItem('csp_pet_data');
    if (raw) {
      const data = JSON.parse(raw);
      const activePetId = data.activePetId;
      if (activePetId && Array.isArray(data.ownedPets)) {
        const pet = data.ownedPets.find((p: OwnedPet) => p.petId === activePetId);
        if (pet) return pet;
      }
    }
  } catch { /* ignore */ }

  // Fallback starter pet so the battle can still run
  return {
    petId: 'fallback',
    petName: '卡皮',
    speciesId: 'capi',
    element: 'earth',
    renderType: '2d',
    modelPath: '/pet-sprites/2d/capi.json',
    level: 1,
    exp: 0,
    expToNext: 100,
    hunger: 100,
    mood: 80,
    affection: 50,
    lastFedAt: null,
    obtainedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function ensureBattleStats(pet: OwnedPet): OwnedPet {
  if (pet.battle) return pet;
  const base = PET_BASE_STATS[pet.speciesId] || PET_BASE_STATS.default;
  const tier = getPetTier(pet.speciesId);
  const stats = calculateStats(base, TIER_MULTIPLIERS[tier], pet.level);
  const { level, ...baseStats } = stats;
  return {
    ...pet,
    battle: { ...baseStats, currentHp: baseStats.maxHp },
  };
}

function makeCombatPet(pet: OwnedPet): CombatPet {
  const withStats = ensureBattleStats(pet);
  const b = withStats.battle!;
  return {
    maxHp: b.maxHp,
    currentHp: b.currentHp,
    attack: b.attack,
    defense: b.defense,
    speed: b.speed,
    element: pet.element,
    level: pet.level,
  };
}

function generateEnemyPet(dungeon: DungeonDefinition, stage: DungeonStage, isBoss: boolean): CombatPet {
  if (stage.enemyPet) {
    const cfg = stage.enemyPet;
    const speciesBase = PET_BASE_STATS[cfg.speciesId] || PET_BASE_STATS.default;
    const stats = calculateStats(speciesBase, TIER_MULTIPLIERS[cfg.tier], cfg.level);
    const { level, ...baseStats } = stats;
    const maxHp = Math.floor(baseStats.maxHp * (cfg.maxHpBoost ?? 1));
    return {
      ...baseStats,
      maxHp,
      currentHp: maxHp,
      element: cfg.element,
      level: cfg.level,
    };
  }

  // Fallback: random enemy when stage has no config
  const level = isBoss ? 5 : 3;
  const tier: PetTier = isBoss ? 'legendary' : 'rare';
  const elements: PetElement[] = ['fire', 'wind', 'earth', 'water'];
  const element = elements[Math.floor(Math.random() * elements.length)];
  const base = PET_BASE_STATS.default;
  const stats = calculateStats(base, TIER_MULTIPLIERS[tier], level);
  const { level: _level, ...baseStats } = stats;
  return {
    ...baseStats,
    currentHp: baseStats.maxHp,
    element,
    level,
  };
}

// ─── Sub-components ───

function BattlePetSprite({ element, size = 120 }: { element: PetElement; size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 12,
      border: '3px solid var(--border-pixel)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.3)',
      fontSize: size * 0.5,
    }}>
      {ELEMENT_EMOJI[element] || '❓'}
    </div>
  );
}

// ─── Main component ───

export default function BattleScreen() {
  const { dungeonId, stageId } = useParams<{ dungeonId: string; stageId: string }>();
  const navigate = useNavigate();
  const store = useDungeonStore();
  const battle = store.battle;
  const player = store.player;
  const dungeons = store.dungeons;
  const questionBank = store.questionBank;

  const dungeon = dungeons.find(d => d.id === dungeonId) as DungeonDefinition | undefined;
  const isBoss = !stageId || stageId === 'boss';
  const isUnlocked = useDungeonStore(s => s.isDungeonUnlocked);

  // UI state
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showEffect, setShowEffect] = useState<'correct' | 'wrong' | 'critical' | null>(null);
  const [shakeClass, setShakeClass] = useState('');
  const [activeFable, setActiveFable] = useState<typeof fables[0] | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [isEnemyAttacking, setIsEnemyAttacking] = useState(false);
  const [hoveredSkillId, setHoveredSkillId] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showElementGuide, setShowElementGuide] = useState(false);

  // Derived combat pets —— 依赖只用稳定值（dungeonId/stageId/isBoss），避免每帧重算导致敌方元素跳变
  const [playerPet, enemyPet] = useMemo(() => {
    const rawPet = loadActivePetFromStorage();
    const playerPet = makeCombatPet(rawPet);
    // Boss 战无对应 stage 记录，构造虚拟 stage 走 isBoss fallback 分支
    const stage: DungeonStage | undefined = isBoss
      ? { id: 'boss', name: 'Boss 战', description: '', questionIds: [], requiredCorrect: 0, hp: 5 }
      : dungeon?.stages.find(s => s.id === stageId);
    const enemyPet = dungeon && stage ? generateEnemyPet(dungeon, stage, isBoss) : null;
    return [playerPet, enemyPet] as [CombatPet, CombatPet | null];
  }, [dungeonId, stageId, isBoss, dungeon]);

  // Guard: redirect if dungeon is locked
  useEffect(() => {
    if (dungeonId && !isUnlocked(dungeonId)) {
      navigate('/map');
    }
  }, [dungeonId]);

  // Initialize battle state
  useEffect(() => {
    if (!dungeonId || !enemyPet) return;
    if (battle && battle.dungeonId === dungeonId && battle.stageId === (stageId || 'boss')) return;

    const firstTurn = determineFirstAttacker(playerPet, enemyPet);
    const skillUsages: SkillUsage[] = SKILLS.map(s => ({
      skillId: s.id,
      usedCount: 0,
      cooldownRemaining: 0,
    }));

    const earnsRewards = store.canEarnRewards();
    if (earnsRewards) {
      store.useChallenge();
    }

    useDungeonStore.setState({
      view: isBoss ? 'boss' : 'battle',
      currentBattleEarnsRewards: earnsRewards,
      battle: {
        dungeonId,
        stageId: stageId || 'boss',
        questions: [],
        currentQuestionIndex: 0,
        hp: playerPet.currentHp,
        maxHp: playerPet.maxHp,
        correctCount: 0,
        wrongCount: 0,
        comboCount: 0,
        startTime: Date.now(),
        isBoss,
        isFinished: false,
        isWon: false,
        expEarned: 0,
        goldEarned: 0,
        rating: 'D',
        enemyHp: enemyPet.currentHp,
        enemyMaxHp: enemyPet.maxHp,
        currentTurn: firstTurn,
        roundCount: 1,
        skillUsages,
        usedSkillIds: [],
      },
    });
  }, [dungeonId, stageId, playerPet, enemyPet, isBoss, battle, store]);

  // Enemy turn
  useEffect(() => {
    if (!battle || battle.isFinished || battle.currentTurn !== 'enemy' || !enemyPet) return;

    setIsEnemyAttacking(true);
    const timer = setTimeout(() => {
      // 50-round cap: resolve before enemy attacks
      if (battle.roundCount >= 50) {
        const playerRatio = battle.hp / battle.maxHp;
        const enemyRatio = battle.enemyHp / battle.enemyMaxHp;
        const capWon = playerRatio >= enemyRatio;
        const totalQuestions = Math.max(1, battle.correctCount + battle.wrongCount);
        const expectedRounds = isBoss ? 30 : 20;
        const capRating = capWon
          ? calculateBattleRating(battle.correctCount, totalQuestions, playerRatio, battle.usedSkillIds, battle.roundCount, expectedRounds)
          : 'D';
        useDungeonStore.setState({
          battle: {
            ...battle,
            isFinished: true,
            isWon: capWon,
            rating: capRating,
          },
        });
        store.finalizeBattle(dungeonId!, isBoss);
        setIsEnemyAttacking(false);
        navigate(isBoss ? `/reward/${dungeonId}` : `/reward/${dungeonId}?stage=${stageId}`);
        store.setView('reward');
        return;
      }

      const damage = calculateDamage(enemyPet, playerPet, 1.0, 1.0);
      const newHp = Math.max(0, battle.hp - damage);
      setLogMessages(prev => [...prev.slice(-4), `🐲 ${isBoss ? dungeon?.bossName : dungeon?.guardianName} 发动攻击，造成 ${damage} 点伤害！`]);

      if (newHp <= 0) {
        useDungeonStore.setState({
          battle: {
            ...battle,
            hp: 0,
            isFinished: true,
            isWon: false,
            rating: 'D',
          },
        });
        store.finalizeBattle(dungeonId!, isBoss);
        setIsEnemyAttacking(false);
        navigate(isBoss ? `/reward/${dungeonId}` : `/reward/${dungeonId}?stage=${stageId}`);
        store.setView('reward');
        return;
      } else {
        // New player turn: reduce all cooldowns by 1
        const newSkillUsages = battle.skillUsages.map(su => ({
          ...su,
          cooldownRemaining: Math.max(0, su.cooldownRemaining - 1),
        }));
        useDungeonStore.setState({
          battle: {
            ...battle,
            hp: newHp,
            currentTurn: 'player',
            roundCount: battle.roundCount + 1,
            skillUsages: newSkillUsages,
          },
        });
      }
      setIsEnemyAttacking(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, [battle?.currentTurn, battle?.isFinished, enemyPet, playerPet, dungeon, isBoss]);

  const handleCloseTutorial = useCallback(() => {
    setShowTutorial(false);
    localStorage.setItem('zhizi_tutorial_seen', 'true');
  }, []);

  useEffect(() => {
    if (!battle || battle.isFinished) return;
    const seen = localStorage.getItem('zhizi_tutorial_seen') === 'true';
    if (!seen) {
      setShowTutorial(true);
    }
  }, [battle?.dungeonId, battle?.stageId]);

  const handleSelectSkill = useCallback((skillId: string) => {
    if (!battle || battle.currentTurn !== 'player' || currentQuestion) return;
    const skill = getSkillById(skillId);
    if (!skill) return;

    const usage = battle.skillUsages.find(s => s.skillId === skillId);
    if (usage && usage.cooldownRemaining > 0) return;
    if (skill.maxUsesPerBattle !== null && usage && usage.usedCount >= skill.maxUsesPerBattle) return;

    const questions = pickQuestionsByTag(questionBank, skill.knowledgeTag, 1);
    if (questions.length === 0) {
      setLogMessages(prev => [...prev.slice(-4), '⚠️ 该知识点暂无题目，换个技能试试']);
      return;
    }

    setSelectedSkillId(skillId);
    setCurrentQuestion(questions[0]);
    setSelectedOption(null);
    setSubmitted(false);
    setShowEffect(null);
  }, [battle, currentQuestion, questionBank]);

  const handleAnswer = useCallback((optionIndex: number) => {
    if (submitted || !battle || !currentQuestion || !selectedSkillId || !enemyPet) return;

    setSelectedOption(optionIndex);
    setSubmitted(true);

    const skill = getSkillById(selectedSkillId);
    const correctIndex = currentQuestion.correctIndex ?? 0;
    const isCorrect = optionIndex === correctIndex;

    // Player stats & rewards
    store.recordAnswer(isCorrect);
    const newCombo = isCorrect ? battle.comboCount + 1 : 0;
    const critical = isCorrect ? rollCritical() : false;
    const rewards = calculateAnswerReward(isCorrect, newCombo, critical);

    store.addExp(rewards.exp);
    if (store.currentBattleEarnsRewards) {
      store.addGold(rewards.gold);
      store.addRankPoints(isCorrect ? (critical ? 20 : 10) : 0);
    }
    store.checkRankUp();

    // Damage calculation
    const answerQuality = isCorrect ? 1.0 : 0.6;
    const multiplier = skill ? skill.multiplier : 1.0;
    const damage = calculateDamage(playerPet, enemyPet, multiplier, answerQuality);
    const newEnemyHp = Math.max(0, battle.enemyHp - damage);

    // Skill usage bookkeeping
    const newSkillUsages = battle.skillUsages.map(su => {
      if (su.skillId !== selectedSkillId) return su;
      return {
        ...su,
        usedCount: su.usedCount + 1,
        cooldownRemaining: skill ? skill.cooldown : 0,
      };
    });
    const newUsedSkillIds = skill && !battle.usedSkillIds.includes(skill.id)
      ? [...battle.usedSkillIds, skill.id]
      : battle.usedSkillIds;

    // Visual effects & weak points
    if (isCorrect) {
      setShowEffect(critical ? 'critical' : 'correct');
      setShakeClass('');
    } else {
      setShowEffect('wrong');
      setShakeClass('shake');
      setTimeout(() => setShakeClass(''), 300);
      const kp = currentQuestion.knowledgePoint;
      store.addWeakPoint(kp);
      store.addToMistakeNotebook(currentQuestion.id);
      const matched = fables.find(f =>
        f.knowledgePoints.some(fkp => kp.includes(fkp) || fkp.includes(kp))
      );
      if (matched) setActiveFable(matched);
    }

    setLogMessages(prev => [
      ...prev.slice(-4),
      isCorrect
        ? `✅ 回答正确！${skill?.name || '攻击'} 造成 ${damage} 点伤害${critical ? '（暴击！EXP 翻倍）' : ''}`
        : `❌ 回答错误，${skill?.name || '攻击'} 只造成 ${damage} 点伤害`,
    ]);

    setTimeout(() => {
      if (newEnemyHp <= 0) {
        const newCorrectCount = battle.correctCount + (isCorrect ? 1 : 0);
        const newWrongCount = battle.wrongCount + (isCorrect ? 0 : 1);
        const totalQuestions = Math.max(1, newCorrectCount + newWrongCount);
        const remainingHpRatio = battle.hp / battle.maxHp;
        const expectedRounds = isBoss ? 30 : 20;
        const rating = calculateBattleRating(newCorrectCount, totalQuestions, remainingHpRatio, newUsedSkillIds, battle.roundCount, expectedRounds);
        useDungeonStore.setState({
          battle: {
            ...battle,
            enemyHp: 0,
            correctCount: newCorrectCount,
            wrongCount: newWrongCount,
            comboCount: newCombo,
            isFinished: true,
            isWon: true,
            expEarned: battle.expEarned + rewards.exp,
            goldEarned: battle.goldEarned + (store.currentBattleEarnsRewards ? rewards.gold : 0),
            rating,
            skillUsages: newSkillUsages,
            usedSkillIds: newUsedSkillIds,
          },
        });
        // 结算（发通关奖励 + 更新进度 + 徽章 + 存档 + 服务端同步）在跳转前完成，关窗不丢
        store.finalizeBattle(dungeonId!, isBoss);
        navigate(isBoss ? `/reward/${dungeonId}` : `/reward/${dungeonId}?stage=${stageId}`);
        store.setView('reward');
      } else {
        const newCorrectCount = battle.correctCount + (isCorrect ? 1 : 0);
        const newWrongCount = battle.wrongCount + (isCorrect ? 0 : 1);

        // 50-round cap: judge by remaining HP ratio
        if (battle.roundCount >= 50) {
          const playerRatio = battle.hp / battle.maxHp;
          const enemyRatio = newEnemyHp / battle.enemyMaxHp;
          const capWon = playerRatio >= enemyRatio;
          const totalQuestions = Math.max(1, newCorrectCount + newWrongCount);
          const expectedRounds = isBoss ? 30 : 20;
          const capRating = capWon
            ? calculateBattleRating(newCorrectCount, totalQuestions, playerRatio, newUsedSkillIds, battle.roundCount, expectedRounds)
            : 'D';
          useDungeonStore.setState({
            battle: {
              ...battle,
              enemyHp: newEnemyHp,
              correctCount: newCorrectCount,
              wrongCount: newWrongCount,
              comboCount: newCombo,
              isFinished: true,
              isWon: capWon,
              expEarned: battle.expEarned + rewards.exp,
              goldEarned: battle.goldEarned + (store.currentBattleEarnsRewards ? rewards.gold : 0),
              rating: capRating,
              skillUsages: newSkillUsages,
              usedSkillIds: newUsedSkillIds,
            },
          });
          store.finalizeBattle(dungeonId!, isBoss);
          navigate(isBoss ? `/reward/${dungeonId}` : `/reward/${dungeonId}?stage=${stageId}`);
          store.setView('reward');
          return;
        }

        useDungeonStore.setState({
          battle: {
            ...battle,
            enemyHp: newEnemyHp,
            correctCount: newCorrectCount,
            wrongCount: newWrongCount,
            comboCount: newCombo,
            expEarned: battle.expEarned + rewards.exp,
            goldEarned: battle.goldEarned + (store.currentBattleEarnsRewards ? rewards.gold : 0),
            currentTurn: 'enemy',
            skillUsages: newSkillUsages,
            usedSkillIds: newUsedSkillIds,
          },
        });
        setSelectedSkillId(null);
        setCurrentQuestion(null);
        setSelectedOption(null);
        setSubmitted(false);
        setShowEffect(null);
        setActiveFable(null);
        store.saveToLocalStorage();
      }
    }, isCorrect ? 800 : 1500);
  }, [submitted, battle, currentQuestion, selectedSkillId, enemyPet, playerPet, dungeonId, stageId, isBoss]);

  // Loading state
  if (!battle || !enemyPet || !dungeon) {
    return (
      <div className="loading-screen">
        <div className="loading-title">⚔️ 准备战斗...</div>
        <div className="loading-bar-container">
          <div className="loading-bar-fill" />
        </div>
      </div>
    );
  }

  const rankName = getRankName(player.school, player.rankTier);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0a0a, #1a0a0a, #0a0a0a)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Status bar */}
      <div className="status-bar" style={{ borderBottomColor: isBoss ? 'var(--hp-red)' : 'var(--border-pixel)' }}>
        <div className="status-item">
          <span className="status-label">{dungeon.icon} {dungeon.name}</span>
        </div>
        <div className="status-item">
          <span className="status-label">回合</span>
          <span className="status-value">{battle.roundCount}</span>
        </div>
        <div className="status-item">
          <span className="status-value" style={{
            color: battle.currentTurn === 'player' ? 'var(--hp-green)' : 'var(--hp-red)',
          }}>
            {battle.currentTurn === 'player' ? '你的回合' : '敌方回合'}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">连击</span>
          <span className="status-value" style={{
            color: battle.comboCount >= 5 ? 'var(--crit-yellow)' : 'var(--text-light)',
          }}>
            {battle.comboCount}
          </span>
        </div>
        <button
          className="pixel-btn"
          onClick={() => setShowElementGuide(true)}
          style={{ padding: '6px 10px', fontSize: '11px', marginLeft: 'auto' }}
        >
          📖 元素手册
        </button>
      </div>

      {/* Battle area */}
      <div className="battle-arena" style={{ flex: 1, padding: '20px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        {/* First-round dialog */}
        {battle.roundCount === 1 && (
          <div className="dialog-box" style={{ marginBottom: '20px', animation: 'fadeIn 0.5s ease' }}>
            <div className="dialog-speaker">
              {isBoss ? dungeon.bossName : dungeon.guardianName}
            </div>
            <div className="dialog-text">
              {isBoss ? dungeon.bossDescription : dungeon.guardianLine}
            </div>
          </div>
        )}

        {/* Combatants */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          {/* Player */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <BattlePetSprite element={playerPet.element} />
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-light)' }}>
              Lv.{playerPet.level} · {rankName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              HP {battle.hp}/{battle.maxHp}
            </div>
            <div className="pixel-progress" style={{ width: '120px', height: '10px', margin: '6px auto' }}>
              <div className="pixel-progress-fill hp" style={{
                width: `${(battle.hp / battle.maxHp) * 100}%`,
                background: battle.hp <= battle.maxHp * 0.3 ? 'var(--hp-red)' : 'var(--hp-green)',
              }} />
            </div>
          </div>

          {/* VS */}
          <div style={{ fontSize: '24px', color: 'var(--gold)', fontFamily: 'var(--pixel-font)' }}>VS</div>

          {/* Enemy */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <BattlePetSprite element={enemyPet.element} />
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-light)' }}>
              {isBoss ? dungeon.bossName : dungeon.guardianName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              HP {battle.enemyHp}/{battle.enemyMaxHp}
            </div>
            <div className="pixel-progress" style={{ width: '120px', height: '10px', margin: '6px auto' }}>
              <div className="pixel-progress-fill hp" style={{
                width: `${(battle.enemyHp / battle.enemyMaxHp) * 100}%`,
                background: 'var(--hp-red)',
              }} />
            </div>
          </div>
        </div>

        {/* Battle log */}
        {logMessages.length > 0 && (
          <div className="dialog-box" style={{ marginBottom: '16px', minHeight: '60px' }}>
            <div className="dialog-speaker">战斗记录</div>
            <div className="dialog-text">
              {logMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: '2px' }}>{m}</div>
              ))}
            </div>
          </div>
        )}

        {/* Question panel */}
        {currentQuestion && (
          <div className={`pixel-card question-panel ${shakeClass}`} style={{
            borderColor: showEffect === 'correct' ? 'var(--hp-green)' :
                         showEffect === 'critical' ? 'var(--crit-yellow)' :
                         showEffect === 'wrong' ? 'var(--hp-red)' : 'var(--border-pixel)',
            marginBottom: '16px',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '12px',
              fontSize: '11px',
              color: 'var(--text-dim)',
            }}>
              <span>{currentQuestion.year}年 CSP-{currentQuestion.group}</span>
              <span>{currentQuestion.knowledgePoint} · 难度 {currentQuestion.difficulty}</span>
            </div>

            <div style={{
              fontSize: '15px',
              lineHeight: 1.8,
              marginBottom: '16px',
              color: 'var(--text-light)',
            }}>
              <div dangerouslySetInnerHTML={{
                __html: currentQuestion.question
                  .replace(/\n/g, '<br/>')
                  .replace(/`([^`]+)`/g, '<code style="background:#1a1a2e;padding:2px 6px;border:1px solid #333;font-family:monospace;color:#00ff41;">$1</code>')
              }} />
            </div>

            {currentQuestion.code && (
              <pre style={{
                background: '#0a0a14',
                border: '2px solid #333',
                padding: '12px',
                fontSize: '13px',
                lineHeight: 1.5,
                overflow: 'auto',
                color: '#00ff41',
                fontFamily: 'monospace',
                marginBottom: '16px',
              }}>
                {currentQuestion.code}
              </pre>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(currentQuestion.options || []).map((option, idx) => {
                const correctIdx = currentQuestion.correctIndex ?? 0;
                const optionLabel = String.fromCharCode(65 + idx);
                let optionClass = 'pixel-btn option-btn';
                if (submitted) {
                  if (idx === correctIdx) optionClass += ' option-correct';
                  else if (idx === selectedOption) optionClass += ' option-wrong';
                  else optionClass += ' option-dimmed';
                } else if (idx === selectedOption) {
                  optionClass += ' option-selected';
                }

                return (
                  <button
                    key={idx}
                    className={optionClass}
                    onClick={() => handleAnswer(idx)}
                    disabled={submitted}
                    style={{
                      textAlign: 'left',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <span style={{
                      fontFamily: 'var(--pixel-font)',
                      fontSize: '12px',
                      color: submitted && idx === correctIdx ? 'var(--hp-green)' :
                             submitted && idx === selectedOption && idx !== correctIdx ? 'var(--hp-red)' :
                             'var(--text-dim)',
                      minWidth: '20px',
                    }}>
                      {optionLabel}.
                    </span>
                    <span style={{ flex: 1, fontSize: '14px' }}>
                      {option.replace(/^[A-D][.、]\s*/, '')}
                    </span>
                  </button>
                );
              })}
            </div>

            {submitted && activeFable && selectedOption !== (currentQuestion.correctIndex ?? 0) && (
              <FableCard fable={activeFable} onClose={() => setActiveFable(null)} />
            )}

            {submitted && currentQuestion.explanation && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: selectedOption === (currentQuestion.correctIndex ?? 0) ? 'rgba(0,255,65,0.08)' : 'rgba(255,51,51,0.08)',
                border: `2px solid ${selectedOption === (currentQuestion.correctIndex ?? 0) ? 'var(--hp-green)' : 'var(--hp-red)'}`,
              }}>
                <strong style={{ color: selectedOption === (currentQuestion.correctIndex ?? 0) ? 'var(--hp-green)' : 'var(--hp-red)' }}>
                  {selectedOption === (currentQuestion.correctIndex ?? 0) ? '✅ 回答正确！' : '❌ 回答错误'}
                </strong>
                <div style={{ marginTop: '6px', color: 'var(--text-dim)' }}>
                  {currentQuestion.explanation}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Skill buttons */}
        {!currentQuestion && battle.currentTurn === 'player' && !battle.isFinished && (
          <div className="skill-bar">
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px' }}>
              选择一个技能（答对题目即可完整释放，答错也有 60% 伤害）：
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {SKILLS.map(skill => {
                const usage = battle.skillUsages.find(s => s.skillId === skill.id);
                const cooldownRemaining = usage?.cooldownRemaining || 0;
                const usesLeft = skill.maxUsesPerBattle !== null
                  ? Math.max(0, skill.maxUsesPerBattle - (usage?.usedCount || 0))
                  : null;
                const disabled = cooldownRemaining > 0 || (usesLeft !== null && usesLeft <= 0);

                return (
                  <div
                    key={skill.id}
                    style={{ position: 'relative' }}
                    onMouseEnter={() => setHoveredSkillId(skill.id)}
                    onMouseLeave={() => setHoveredSkillId(null)}
                  >
                    <button
                      className="pixel-btn"
                      disabled={disabled}
                      onClick={() => handleSelectSkill(skill.id)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        textAlign: 'left',
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{skill.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {skill.knowledgeLabel} · {skill.multiplier}×
                      </div>
                      {cooldownRemaining > 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--hp-red)', marginTop: '2px' }}>
                          冷却 {cooldownRemaining} 回合
                        </div>
                      )}
                      {usesLeft !== null && usesLeft <= 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--hp-red)', marginTop: '2px' }}>
                          次数已用尽
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {hoveredSkillId && (() => {
              const skill = getSkillById(hoveredSkillId);
              const usage = battle.skillUsages.find(s => s.skillId === hoveredSkillId);
              if (!skill) return null;
              return (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  background: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: '4px',
                }}>
                  <SkillTooltip
                    skill={skill}
                    cooldownRemaining={usage?.cooldownRemaining || 0}
                    usesLeft={skill.maxUsesPerBattle !== null
                      ? Math.max(0, skill.maxUsesPerBattle - (usage?.usedCount || 0))
                      : null}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {isEnemyAttacking && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: 'var(--hp-red)',
            fontSize: '14px',
          }}>
            敌方正在蓄力攻击...
          </div>
        )}
      </div>

      <style>{`
        .option-btn {
          width: 100%;
          border: 2px solid #333 !important;
          transition: all 0.15s;
        }
        .option-btn:hover:not(:disabled) {
          border-color: var(--gold) !important;
          background: #1a1a3e;
        }
        .option-selected {
          border-color: var(--gold) !important;
          background: #1a1a3e;
        }
        .option-correct {
          border-color: var(--hp-green) !important;
          background: rgba(0,255,65,0.1) !important;
        }
        .option-wrong {
          border-color: var(--hp-red) !important;
          background: rgba(255,51,51,0.1) !important;
        }
        .option-dimmed {
          opacity: 0.5;
        }
      `}</style>
      {showTutorial && <TutorialOverlay onClose={handleCloseTutorial} />}
      {showElementGuide && <ElementGuide onClose={() => setShowElementGuide(false)} />}
    </div>
  );
}
