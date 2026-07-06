import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { SKILLS, getSkillById } from '../../data/skills';
import { pickQuestionsByTag } from '../../utils/questionLoader';
import { calculateStats } from '../../utils/combatLogic';
import { calculateAnswerReward, rollCritical, calculateBattleRating } from '../../utils/gameLogic';
import { createBattleGame, type BattlePhaserGame } from '../../phaser/BattlePhaserGame';
import type { BattleInitData, PhaserPetConfig, BattleEndResult } from '../../phaser/types';
import type { Question, DungeonDefinition, DungeonStage } from '../../types/dungeon';
import type { OwnedPet, PetElement, PetTier } from '../../../src/types/pet';
import { getPetTier, PET_BASE_STATS, TIER_MULTIPLIERS } from '../../../src/types/pet';
import { loadWebPet } from '../../utils/webPet';
import FableCard from '../shared/FableCard';
import fables from '../../data/fables.json';
import './BattleScreen.css';

// ─── Helpers ───

function loadActivePetFromStorage(): OwnedPet {
  const webPet = loadWebPet();
  if (webPet) return webPet;

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

function makePlayerPetConfig(): PhaserPetConfig {
  const raw = loadActivePetFromStorage();
  const base = PET_BASE_STATS[raw.speciesId] || PET_BASE_STATS.default;
  const tier = getPetTier(raw.speciesId);
  const stats = calculateStats(base, TIER_MULTIPLIERS[tier], raw.level);

  return {
    petId: raw.petId,
    displayName: raw.petName,
    speciesId: raw.speciesId,
    element: raw.element,
    level: raw.level,
    maxHp: stats.maxHp,
    currentHp: raw.battle?.currentHp ?? stats.maxHp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    isPlayer: true,
    previewUrl: `/pet-sprites/previews/${raw.speciesId}.png`,
    textureKey: 'playerPet',
  };
}

function makeEnemyPetConfig(dungeon: DungeonDefinition, stage: DungeonStage, isBoss: boolean): PhaserPetConfig {
  if (stage.enemyPet) {
    const cfg = stage.enemyPet;
    const speciesBase = PET_BASE_STATS[cfg.speciesId] || PET_BASE_STATS.default;
    const stats = calculateStats(speciesBase, TIER_MULTIPLIERS[cfg.tier], cfg.level);
    const maxHp = Math.floor(stats.maxHp * (cfg.maxHpBoost ?? 1));

    return {
      petId: `enemy-${cfg.speciesId}`,
      displayName: cfg.displayName,
      speciesId: cfg.speciesId,
      element: cfg.element,
      level: cfg.level,
      maxHp,
      currentHp: maxHp,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.speed,
      isPlayer: false,
      previewUrl: `/pet-sprites/previews/${cfg.speciesId}.png`,
      textureKey: 'enemyPet',
    };
  }

  // Fallback
  const level = isBoss ? 3 : 2;
  const tier: PetTier = isBoss ? 'rare' : 'common';
  const elements: PetElement[] = ['fire', 'wind', 'earth', 'water'];
  const element = elements[Math.floor(Math.random() * elements.length)];
  const stats = calculateStats(PET_BASE_STATS.default, TIER_MULTIPLIERS[tier], level);

  return {
    petId: 'enemy-fallback',
    displayName: isBoss ? dungeon.bossName : `${dungeon.guardianName}·随从`,
    speciesId: 'glitch-bot',
    element,
    level,
    maxHp: stats.maxHp,
    currentHp: stats.maxHp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    isPlayer: false,
    previewUrl: `/pet-sprites/previews/glitch-bot.png`,
    textureKey: 'enemyPet',
  };
}

// ─── Main component ───

export default function BattleScreen() {
  const { dungeonId, stageId } = useParams<{ dungeonId: string; stageId: string }>();
  const navigate = useNavigate();
  const store = useDungeonStore();
  const player = store.player;
  const dungeons = store.dungeons;
  const questionBank = store.questionBank;

  const dungeon = dungeons.find(d => d.id === dungeonId) as DungeonDefinition | undefined;
  const isBoss = !stageId || stageId === 'boss';
  const isUnlocked = useDungeonStore(s => s.isDungeonUnlocked);

  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<BattlePhaserGame | null>(null);
  const answerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 题目弹窗状态
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [activeFable, setActiveFable] = useState<typeof fables[0] | null>(null);

  // 累计战斗数据（用于最终结算）
  const statsRef = useRef({
    correctCount: 0,
    wrongCount: 0,
    comboCount: 0,
    expEarned: 0,
    goldEarned: 0,
    usedSkillIds: [] as string[],
    startTime: Date.now(),
  });

  // 敌我宠物配置
  const [playerConfig, enemyConfig] = useMemo(() => {
    const playerPet = makePlayerPetConfig();
    const stage: DungeonStage | undefined = isBoss
      ? { id: 'boss', name: 'Boss 战', description: '', questionIds: [], requiredCorrect: 0, hp: 5 }
      : dungeon?.stages.find(s => s.id === stageId);
    const enemyPet = dungeon && stage ? makeEnemyPetConfig(dungeon, stage, isBoss) : null;
    return [playerPet, enemyPet] as [PhaserPetConfig, PhaserPetConfig | null];
  }, [dungeonId, stageId, isBoss, dungeon]);

  // 守卫：未解锁或未注册
  useEffect(() => {
    if (dungeonId && !isUnlocked(dungeonId)) {
      navigate('/map');
      return;
    }
    if (!player.classCode || !player.deviceHash) {
      navigate('/register');
    }
  }, [dungeonId, player.classCode, player.deviceHash, isUnlocked, navigate]);

  // 防跳关
  useEffect(() => {
    if (!dungeonId) return;
    if (!isBoss && dungeon && stageId) {
      const stageIdx = dungeon.stages.findIndex(s => s.id === stageId);
      const dp = store.getDungeonProgress(dungeonId);
      if (dp && stageIdx >= 0 && stageIdx < dp.completedStages) {
        navigate(`/dungeon/${dungeonId}`);
        store.setView('dungeon-preview');
      }
    }
  }, [dungeon, stageId, isBoss, dungeonId, store, navigate]);

  // 初始化 Phaser 游戏
  useEffect(() => {
    if (!containerRef.current || !dungeonId || !enemyConfig) return;
    if (gameRef.current) return;

    // 消耗挑战次数
    const earnsRewards = store.canEarnRewards();
    if (earnsRewards) {
      store.useChallenge();
    }
    useDungeonStore.setState({ currentBattleEarnsRewards: earnsRewards });

    // 决定先手

    const initData: BattleInitData = {
      dungeonId,
      stageId: stageId || 'boss',
      isBoss,
      playerPet: playerConfig,
      enemyPet: enemyConfig,
      initialEnergy: 2,
      maxEnergy: 5,
      dungeonColor: dungeon?.color || '#1a1a2e',
      dungeonBgImage: dungeon?.bgImage,
      dungeonName: dungeon?.name || '潜龙秘境',
    };

    // 如果敌方先手，初始能量仍为 2，由 Phaser 内部处理
    // （当前简化：统一玩家先手开始，speed 只影响部分平衡加成）
    // TODO: 后续把 firstTurn 传给 Phaser，支持敌方先手

    statsRef.current = {
      correctCount: 0,
      wrongCount: 0,
      comboCount: 0,
      expEarned: 0,
      goldEarned: 0,
      usedSkillIds: [],
      startTime: Date.now(),
    };

    const game = createBattleGame(containerRef.current, initData, (event, data) => {
      handlePhaserEvent(event, data);
    });

    gameRef.current = game;

    return () => {
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = null;
      }
      game.destroy();
      gameRef.current = null;
    };
  }, [dungeonId, stageId, isBoss, enemyConfig, dungeon, playerConfig, store]);

  const handlePhaserEvent = useCallback((event: string, data: unknown) => {
    switch (event) {
      case 'skillSelected': {
        const { skillId } = data as { skillId: string };
        const skill = getSkillById(skillId);
        if (!skill) return;

        const questions = pickQuestionsByTag(questionBank, skill.knowledgeTag, 1);
        if (questions.length === 0) {
          // 无题时直接视为答错，避免卡死
          gameRef.current?.setAnswerResult({ skillId, isCorrect: false });
          return;
        }

        setSelectedSkillId(skillId);
        setCurrentQuestion(questions[0]);
        setSelectedOption(null);
        setSubmitted(false);
        setIsCorrect(null);
        break;
      }

      case 'battleEnd': {
        const result = data as BattleEndResult;
        handleBattleEnd(result);
        break;
      }
    }
  }, [questionBank]);

  const handleAnswer = useCallback((optionIndex: number) => {
    if (submitted || !currentQuestion || !selectedSkillId) return;

    setSelectedOption(optionIndex);
    setSubmitted(true);

    const correctIndex = currentQuestion.correctIndex ?? 0;
    const correct = optionIndex === correctIndex;
    setIsCorrect(correct);

    // 记录答题与奖励
    store.recordAnswer(correct);
    const newCombo = correct ? statsRef.current.comboCount + 1 : 0;
    const critical = correct ? rollCritical() : false;
    const rewards = calculateAnswerReward(correct, newCombo, critical);

    statsRef.current.comboCount = newCombo;
    statsRef.current.correctCount += correct ? 1 : 0;
    statsRef.current.wrongCount += correct ? 0 : 1;
    statsRef.current.expEarned += rewards.exp;
    statsRef.current.goldEarned += store.currentBattleEarnsRewards ? rewards.gold : 0;
    if (!statsRef.current.usedSkillIds.includes(selectedSkillId)) {
      statsRef.current.usedSkillIds.push(selectedSkillId);
    }

    store.addExp(rewards.exp);
    if (store.currentBattleEarnsRewards) {
      store.addGold(rewards.gold);
      store.addRankPoints(correct ? (critical ? 20 : 10) : 0);
    }
    store.checkRankUp();

    // 错题本 / 寓言
    if (!correct) {
      const kp = currentQuestion.knowledgePoint;
      store.addWeakPoint(kp);
      store.addToMistakeNotebook(currentQuestion.id);
      const matched = fables.find(f =>
        f.knowledgePoints.some(fkp => kp.includes(fkp) || fkp.includes(kp))
      );
      if (matched) setActiveFable(matched);
    }

    // 传给 Phaser 播放动画
    answerTimeoutRef.current = setTimeout(() => {
      if (!gameRef.current) return;
      gameRef.current.setAnswerResult({ skillId: selectedSkillId!, isCorrect: correct });
      setCurrentQuestion(null);
      setSelectedSkillId(null);
      setSelectedOption(null);
      setSubmitted(false);
      setIsCorrect(null);
      answerTimeoutRef.current = null;
    }, 400);
  }, [currentQuestion, selectedSkillId, submitted, store]);

  const handleBattleEnd = useCallback((result: BattleEndResult) => {
    const totalAnswered = statsRef.current.correctCount + statsRef.current.wrongCount;
    const playerHpRatio = result.playerMaxHp > 0 ? result.playerHp / result.playerMaxHp : 0;
    const expectedRounds = isBoss ? 30 : 20;
    const rating = result.isWon
      ? calculateBattleRating(
          statsRef.current.correctCount,
          totalAnswered,
          playerHpRatio,
          statsRef.current.usedSkillIds,
          result.roundCount,
          expectedRounds
        )
      : 'D';

    // 写入 battle 状态供 finalizeBattle 使用
    useDungeonStore.setState({
      view: isBoss ? 'boss' : 'battle',
      battle: {
        dungeonId: dungeonId!,
        stageId: stageId || 'boss',
        questions: [],
        currentQuestionIndex: 0,
        hp: result.playerHp,
        maxHp: result.playerMaxHp,
        correctCount: statsRef.current.correctCount,
        wrongCount: statsRef.current.wrongCount,
        comboCount: statsRef.current.comboCount,
        startTime: statsRef.current.startTime,
        isBoss,
        isFinished: true,
        isWon: result.isWon,
        expEarned: statsRef.current.expEarned,
        goldEarned: statsRef.current.goldEarned,
        rating,
        enemyHp: result.enemyHp,
        enemyMaxHp: result.enemyMaxHp,
        currentTurn: result.isWon ? 'player' : 'enemy',
        roundCount: result.roundCount,
        skillUsages: SKILLS.map(s => ({ skillId: s.id, usedCount: 0, cooldownRemaining: 0 })),
        usedSkillIds: statsRef.current.usedSkillIds,
        energy: 0,
        maxEnergy: 5,
        shield: 0,
        enemyIntent: null,
        burnStacks: [],
      },
    });

    store.finalizeBattle(dungeonId!, isBoss);
    navigate(isBoss ? `/reward/${dungeonId}` : `/reward/${dungeonId}?stage=${stageId}`);
    store.setView('reward');
  }, [dungeonId, stageId, isBoss, playerConfig, enemyConfig, store, navigate]);

  if (!dungeon || !enemyConfig) {
    return (
      <div className="loading-screen">
        <div className="loading-title">加载战斗中...</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0a0a0a' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 题目弹窗 */}
      {currentQuestion && (
        <div className="battle-question-overlay">
          <div className="battle-question-card">
            <div className="battle-question-banner">
              {selectedSkillId ? getSkillById(selectedSkillId)?.name : '施法中...'}
            </div>

            <div className="battle-question-text">{currentQuestion.question}</div>
            {currentQuestion.code && (
              <pre className="battle-question-code"><code>{currentQuestion.code}</code></pre>
            )}

            <div className="battle-options">
              {!currentQuestion.options || currentQuestion.options.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#ff4444', padding: '12px' }}>
                  该题目缺少选项，无法作答
                  <button
                    className="pixel-btn"
                    style={{ marginTop: '12px', width: '100%' }}
                    onClick={() => {
                      if (selectedSkillId) {
                        gameRef.current?.setAnswerResult({ skillId: selectedSkillId, isCorrect: false });
                      }
                      setCurrentQuestion(null);
                      setSelectedSkillId(null);
                    }}
                  >
                    继续
                  </button>
                </div>
              ) : (
                currentQuestion.options.map((opt, idx) => {
                  const clean = opt.replace(/^[A-D][.、]\s*/, '');
                  const letter = String.fromCharCode(65 + idx);
                  let btnClass = 'battle-option-btn';
                  if (submitted) {
                    if (idx === currentQuestion.correctIndex) btnClass += ' correct';
                    else if (idx === selectedOption) btnClass += ' wrong';
                    else btnClass += ' disabled';
                  }

                  return (
                    <button
                      key={idx}
                      className={btnClass}
                      disabled={submitted}
                      onClick={() => handleAnswer(idx)}
                    >
                      <span className="battle-option-letter">{letter}</span>
                      <span>{clean}</span>
                    </button>
                  );
                })
              )}
            </div>

            {submitted && (
              <div className={`battle-answer-feedback ${isCorrect ? 'correct' : 'wrong'}`}>
                {isCorrect ? '✅ 回答正确！技能完美释放' : '❌ 回答错误，技能施法失败'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 错题寓言 */}
      {activeFable && (
        <div className="battle-fable-overlay" onClick={() => setActiveFable(null)}>
          <div className="battle-fable-card" onClick={e => e.stopPropagation()}>
            <FableCard fable={activeFable} />
            <button className="pixel-btn" onClick={() => setActiveFable(null)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}
