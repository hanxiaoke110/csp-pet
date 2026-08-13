import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { SKILLS, getSkillById, type SkillDefinition } from '../../data/skills';
import { getTrustedQuestionImage, pickQuestionsByTag, pickBigMoveQuestions, pickFallbackChoiceQuestions, pickEmergencyQuestions, getDungeonDifficulty, loadQuestionBank } from '../../utils/questionLoader';
import { calculateStats, calculateTrialPlayerStats } from '../../utils/combatLogic';
import {
  applySchoolAnswerPassive,
  calculateAnswerReward,
  calculateBattleRating,
  getSchoolRankPointBonus,
  rollCritical,
} from '../../utils/gameLogic';
import { createBattleGame, type BattlePhaserGame } from '../../phaser/BattlePhaserGame';
import type { BattleInitData, PhaserPetConfig, BattleEndResult } from '../../phaser/types';
import type { Question, DungeonDefinition, DungeonStage } from '../../types/dungeon';
import type { OwnedPet, PetElement, PetTier } from '../../../src/types/pet';
import { PET_BASE_STATS, TIER_MULTIPLIERS } from '../../../src/types/pet';
import { loadWebPet } from '../../utils/webPet';
import { formatCppCode } from '../../utils/codeFormat';
import { isWorkshopPet, loadWorkshopThumbUrl } from '../../utils/petPreview';
import FableCard from '../shared/FableCard';
import KnowledgePointHelp from '../../../src/components/shared/KnowledgePointHelp';
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

// 题干代码高亮：识别题干里的 C++ 代码片段（if/for/while/continue/break/运算表达式等），
// 用等宽字体 + 高亮色渲染，避免代码和中文混在一起不美观。
const CODE_KEYWORDS = ['if','else','for','while','continue','break','cout','cin','return','int','char','double','void','main','bool','string','long','short','float'];

function normalizeQuestionAssetUrl(src: string): string {
  const localMatch = src.match(/\/public\/(course-data\/[^?#)]+)/);
  if (localMatch) return `/${localMatch[1]}`;
  return resolveQuestionImage(src) || src;
}

function highlightInlineCode(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];
  const nodes: ReactNode[] = [];
  // 匹配代码片段：字母/数字开头，连续的代码字符（含括号/分号/运算符/~等）
  const pattern = /[a-zA-Z0-9_][a-zA-Z0-9_%()<>=+\-*/;{}.\[\]!&|^~#]*/g;
  let lastIdx = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const code = m[0];
    // 只高亮含代码特征的片段：有运算符/括号/分号/等号，或是 C++ 关键词
    const hasOperators = /[();{}=<>+\-*/%&|^~#]/.test(code);
    const isKeyword = CODE_KEYWORDS.includes(code);
    // 排除纯数字或太短的
    const tooShort = code.length < 2 && !isKeyword;
    if (!hasOperators && !isKeyword) continue;
    if (tooShort) continue;
    if (m.index > lastIdx) nodes.push(text.slice(lastIdx, m.index));
    nodes.push(<code key={`${keyPrefix}-c${key++}`} className="stem-code">{code}</code>);
    lastIdx = m.index + code.length;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}

function renderBattleStem(stem: string): ReactNode[] {
  if (!stem) return [];
  const nodes: ReactNode[] = [];
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIdx = 0;
  let imgKey = 0;
  let m: RegExpExecArray | null;

  while ((m = imagePattern.exec(stem)) !== null) {
    if (m.index > lastIdx) {
      nodes.push(...highlightInlineCode(stem.slice(lastIdx, m.index), `t${imgKey}`));
    }
    nodes.push(
      <div key={`img-${imgKey}`} className="battle-stem-image-wrap">
        <BattleImage className="battle-stem-image" src={normalizeQuestionAssetUrl(m[2])} />
      </div>
    );
    imgKey++;
    lastIdx = m.index + m[0].length;
  }

  if (lastIdx < stem.length) {
    nodes.push(...highlightInlineCode(stem.slice(lastIdx), `t${imgKey}`));
  }
  return nodes;
}

function resolveQuestionImage(src?: string | null): string | null {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return src;
  return src.startsWith('/') ? src : `/${src.replace(/^\/+/, '')}`;
}

// 战斗题目图片：加载失败时降级提示，不让 broken image 破坏战斗 UI
function BattleImage({ src, className }: { src: string; className?: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div style={{ padding: '14px', color: '#94a3b8', fontSize: 13, textAlign: 'center', background: '#f8fafc', borderRadius: 8, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        🖼️ 图片加载失败，请稍后重试
      </div>
    );
  }
  return <img className={className} src={src} alt="" onError={() => setErrored(true)} />;
}

function makePlayerPetConfig(): PhaserPetConfig {
  const raw = loadActivePetFromStorage();
  const base = PET_BASE_STATS[raw.speciesId] || PET_BASE_STATS.default;

  // 使用潜龙闭关的玩家等级（而非宠物系统等级）计算战斗属性。
  // 宠物等级来自喂养系统，增长极慢（1-3 级），与副本敌人等级（1-10 级）完全不匹配。
  // 后期副本敌人属性指数膨胀，玩家会被一击秒杀且打不动敌人。
  const dungeonLevel = useDungeonStore.getState().player.playerLevel || 1;

  // 随潜龙等级提升战斗品质：LV1-2 普通(1.0) → LV3-4 稀有(1.3) → LV5+ 传说(1.6)
  let combatTier: PetTier;
  if (dungeonLevel >= 5) combatTier = 'legendary';
  else if (dungeonLevel >= 3) combatTier = 'rare';
  else combatTier = 'common';

  const stats = calculateTrialPlayerStats(
    base,
    TIER_MULTIPLIERS[combatTier],
    dungeonLevel,
    raw.level || 1,
  );

  return {
    petId: raw.petId,
    displayName: raw.petName,
    speciesId: raw.speciesId,
    element: raw.element,
    level: raw.level || 1,
    maxHp: stats.maxHp,
    // 试炼场使用独立战斗属性，不沿用宠物喂养体系的旧血量。
    currentHp: stats.maxHp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    isPlayer: true,
    previewUrl: `/pet-sprites/previews/${raw.speciesId}.png`,
    textureKey: 'playerPet',
  };
}

function getBossStage(dungeon?: DungeonDefinition): DungeonStage | undefined {
  return dungeon?.stages[dungeon.stages.length - 1];
}

function makeEnemyPetConfig(dungeon: DungeonDefinition, stage: DungeonStage, isBoss: boolean, playerPet?: PhaserPetConfig): PhaserPetConfig {
  if (stage.enemyPet) {
    const cfg = stage.enemyPet;
    const speciesBase = PET_BASE_STATS[cfg.speciesId] || PET_BASE_STATS.default;
    const stats = calculateStats(speciesBase, TIER_MULTIPLIERS[cfg.tier], cfg.level);
    const maxHp = Math.floor(stats.maxHp * (cfg.maxHpBoost ?? 1));

    const enemy: PhaserPetConfig = {
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
    return scaleBossForPlayer(enemy, playerPet, dungeon.id, isBoss);
  }

  // Fallback
  const level = isBoss ? 3 : 2;
  const tier: PetTier = isBoss ? 'rare' : 'common';
  const elements: PetElement[] = ['fire', 'wind', 'earth', 'water'];
  const element = elements[Math.floor(Math.random() * elements.length)];
  const stats = calculateStats(PET_BASE_STATS.default, TIER_MULTIPLIERS[tier], level);

  const enemy: PhaserPetConfig = {
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
  return scaleBossForPlayer(enemy, playerPet, dungeon.id, isBoss);
}

function scaleBossForPlayer(enemy: PhaserPetConfig, player: PhaserPetConfig | undefined, dungeonId: string, isBoss: boolean): PhaserPetConfig {
  if (!isBoss || !player) return enemy;
  const dungeonIndex = Math.max(1, Number(dungeonId.split('-')[1]) || 1);
  const normalTarget = Math.ceil(player.maxHp * Math.min(0.1, 0.06 + dungeonIndex * 0.005));
  // Enemy intents use attack - defense. Keeping the target after defense means
  // high-level player defense cannot reduce a late-game boss to one damage.
  const attack = Math.max(enemy.attack, player.defense + normalTarget);
  const level = Math.max(enemy.level, Math.max(1, player.level - 1));
  return { ...enemy, attack, level };
}

// ─── Main component ───

export default function BattleScreen() {
  const { dungeonId, stageId } = useParams<{ dungeonId: string; stageId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const store = useDungeonStore();
  const player = store.player;
  const dungeons = store.dungeons;
  const trialInventory = useDungeonStore(s => s.trialInventory);
  const consumeTrialItem = useDungeonStore(s => s.consumeTrialItem);

  const dungeon = dungeons.find(d => d.id === dungeonId) as DungeonDefinition | undefined;
  const isBoss = !stageId || stageId === 'boss';
  const isReplay = searchParams.get('replay') === '1';
  const isUnlocked = useDungeonStore(s => s.isDungeonUnlocked);

  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<BattlePhaserGame | null>(null);

  // 题目弹窗状态
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<{ skillId: string; isCorrect: boolean } | null>(null);
  const [activeFable, setActiveFable] = useState<typeof fables[0] | null>(null);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [battleNotice, setBattleNotice] = useState<string | null>(null);
  const [noticeSkillId, setNoticeSkillId] = useState<string | null>(null);
  const challengeConsumedRef = useRef(false);

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
      ? getBossStage(dungeon)
      : dungeon?.stages.find(s => s.id === stageId);
    const enemyPet = dungeon && stage ? makeEnemyPetConfig(dungeon, stage, isBoss, playerPet) : null;
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

  // 防跳关（依赖不含 store，避免反复触发；内部用 getState）
  useEffect(() => {
    if (!dungeonId) return;
    if (!isBoss && dungeon && stageId) {
      const stageIdx = dungeon.stages.findIndex(s => s.id === stageId);
      const s = useDungeonStore.getState();
      const dp = s.getDungeonProgress(dungeonId);
      if (!isReplay && dp && stageIdx >= 0 && stageIdx < dp.completedStages) {
        navigate(`/dungeon/${dungeonId}`);
        s.setView('dungeon-preview');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeon, stageId, isBoss, isReplay, dungeonId, navigate]);

  // 初始化 Phaser 游戏
  // 依赖不含 store：store 每次变化引用都变，放进依赖会导致 effect 反复 cleanup+重建 Phaser，
  // 而 Phaser 初始化又会触发 setState，形成死循环（Maximum update depth）。
  // effect 内部用 getState() 取最新 action，引用稳定。
  useEffect(() => {
    if (!containerRef.current || !dungeonId || !enemyConfig) return;
    if (gameRef.current) return;

    let cancelled = false;

    (async () => {
      const s = useDungeonStore.getState();
      // Reserve reward eligibility now, but only consume the weekly attempt after
      // the battle reaches settlement. Abandoning from the pause menu costs nothing.
      // A replay can consume a normal or purchased reward attempt. Otherwise the
      // paid "+1 reward attempt" becomes unusable after a student clears a stage.
      const earnsRewards = s.canEarnRewards();
      useDungeonStore.setState({ currentBattleEarnsRewards: earnsRewards });

      // 工坊宠物：异步加载 AppData 的 thumb 缩略图作为 preview（普通宠物用 public preview）
      let playerCfg = playerConfig;
      if (isWorkshopPet(playerCfg.speciesId)) {
        const thumbUrl = await loadWorkshopThumbUrl(playerCfg.speciesId);
        if (thumbUrl) {
          playerCfg = { ...playerCfg, previewUrl: thumbUrl, textureKey: 'playerPetThumb' };
        }
      }

      if (cancelled) return;

      const initData: BattleInitData = {
        dungeonId,
        stageId: stageId || 'boss',
        isBoss,
        playerPet: playerCfg,
        enemyPet: enemyConfig,
        initialEnergy: 2,
        maxEnergy: 5,
        dungeonColor: dungeon?.color || '#1a1a2e',
        dungeonBgImage: dungeon?.bgImage,
        dungeonName: dungeon?.name || '潜龙秘境',
      };

      statsRef.current = {
        correctCount: 0,
        wrongCount: 0,
        comboCount: 0,
        expEarned: 0,
        goldEarned: 0,
        usedSkillIds: [],
        startTime: Date.now(),
      };

      const game = createBattleGame(containerRef.current!, initData, (event, data) => {
        handlePhaserEvent(event, data);
      });

      if (cancelled) {
        game.destroy();
        return;
      }
      gameRef.current = game;
    })();

    return () => {
      cancelled = true;
      if (gameRef.current) {
        gameRef.current.destroy();
        gameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeonId, stageId, isBoss, isReplay, enemyConfig, dungeon, playerConfig]);

  // 暂停/恢复 Phaser 场景：DungeonEmbed 暂停弹窗通过 window 事件触发，真暂停（冻结 update/计时器），而非仅 CSS 遮罩
  useEffect(() => {
    const onPause = () => gameRef.current?.pause();
    const onResume = () => gameRef.current?.resume();
    window.addEventListener('dungeon-pause', onPause);
    window.addEventListener('dungeon-resume', onResume);
    return () => {
      window.removeEventListener('dungeon-pause', onPause);
      window.removeEventListener('dungeon-resume', onResume);
    };
  }, []);

  // 技能 → 题目：知识点匹配优先，大招回退选择题，最后兜底任意可用选择题
  const pickSkillQuestions = useCallback((skill: SkillDefinition, bank: Question[]): Question[] => {
    const isBigMove = skill.id === 'skill-4';
    const diffRange = getDungeonDifficulty(dungeonId || '');
    let questions = isBigMove
      ? pickBigMoveQuestions(bank, 1)
      : pickQuestionsByTag(bank, skill.knowledgeTag, 1, diffRange);
    if (questions.length === 0) {
      // 大招无 reading/fillBlank 题时回退到普通选择题
      const fallback = isBigMove ? pickQuestionsByTag(bank, skill.knowledgeTag, 1, diffRange) : [];
      questions.push(...fallback);
    }
    if (questions.length === 0) {
      // 知识点/难度覆盖缺口：兜底任意可用选择题，避免技能完全无法使用
      questions = pickFallbackChoiceQuestions(bank, 1, diffRange);
    }
    if (questions.length === 0) {
      // 最后使用随安装包发布的人工核对题，网络或缓存异常也不会卡住战斗。
      questions = pickEmergencyQuestions(skill.knowledgeTag, 1, diffRange);
    }
    return questions;
  }, [dungeonId]);

  const handlePhaserEvent = useCallback(async (event: string, data: unknown) => {
    switch (event) {
      case 'skillSelected': {
        const { skillId } = data as { skillId: string };
        const skill = getSkillById(skillId);
        if (!skill) return;

        // Read the store at click time. Phaser is intentionally created once, so
        // a captured initial empty question bank would otherwise persist all battle.
        let latestBank = useDungeonStore.getState().questionBank;
        let questions = pickSkillQuestions(skill, latestBank);

        if (questions.length === 0) {
          // 题库可能还在准备：现场重载一次再试（命中缓存很快），
          // 避免“点了技能只弹提示、重选也永远失败”。
          try {
            const reloaded = await loadQuestionBank();
            if (reloaded.length > 0) {
              useDungeonStore.getState().setQuestionBank(reloaded);
              latestBank = reloaded;
              questions = pickSkillQuestions(skill, latestBank);
            }
          } catch { /* 重载失败则按当前空库处理 */ }
        }

        if (questions.length === 0) {
          gameRef.current?.cancelPendingSkill();
          setPendingAnswer(null);
          setCurrentQuestion(null);
          setSelectedSkillId(null);
          setNoticeSkillId(skillId);
          setBattleNotice('题库正在准备中，请稍后重新选择技能。');
          return;
        }

        setSelectedSkillId(skillId);
        setCurrentQuestion(questions[0]);
        setSelectedOption(null);
        setSubmitted(false);
        setIsCorrect(null);
        setPendingAnswer(null);
        setHintRevealed(false);
        break;
      }

      case 'battleEnd': {
        const result = data as BattleEndResult;
        handleBattleEnd(result);
        break;
      }
    }
  }, [pickSkillQuestions]);

  // “重试”按钮：重新加载题库后，让 Phaser 重新走一遍选技能流程（含能量/冷却/次数校验）
  const retryFailedSkill = useCallback(async () => {
    const skillId = noticeSkillId;
    setBattleNotice(null);
    setNoticeSkillId(null);
    if (!skillId) return;
    const skill = getSkillById(skillId);
    if (!skill) return;
    try {
      const reloaded = await loadQuestionBank();
      if (reloaded.length > 0) useDungeonStore.getState().setQuestionBank(reloaded);
    } catch { /* 重载失败则按当前库判断 */ }
    const bank = useDungeonStore.getState().questionBank;
    if (pickSkillQuestions(skill, bank).length === 0) {
      setNoticeSkillId(skillId);
      setBattleNotice('题库暂时不可用，请稍后再试。');
      return;
    }
    gameRef.current?.retrySkill(skillId);
  }, [noticeSkillId, pickSkillQuestions]);

  const handleAnswer = useCallback((optionIndex: number) => {
    if (submitted || !currentQuestion || !selectedSkillId) return;

    setSelectedOption(optionIndex);
    setSubmitted(true);

    const correctIndex = currentQuestion.correctIndex ?? 0;
    const correct = optionIndex === correctIndex;
    setIsCorrect(correct);

    const earnsRewards = store.currentBattleEarnsRewards;
    // 记录答题与奖励：重打只用于冲评级，不累计总答题/连击/经验/金币/段位，避免刷榜。
    if (earnsRewards) store.recordAnswer(correct);
    const newCombo = correct ? statsRef.current.comboCount + 1 : 0;
    const critical = correct ? rollCritical(player.school) : false;
    const baseReward = calculateAnswerReward(correct, newCombo, critical);
    // 流派被动每日上限：仅答对时消耗每日额度并应用 EXP/金 被动加成（防刷），达上限或答错只发基础奖励
    // 段位/暴击被动不由此处限制（段位已由 weeklyChallenges 5次/周限制，暴击为战斗机制非资源）
    const passiveAllowed = correct && earnsRewards ? store.bumpSchoolPassiveDaily() : false;
    const rewards = passiveAllowed
      ? applySchoolAnswerPassive(player.school, baseReward, {
          combo: newCombo,
          questionType: currentQuestion.type,
          knowledgePoint: currentQuestion.knowledgePoint,
        })
      : baseReward;

    statsRef.current.comboCount = newCombo;
    statsRef.current.correctCount += correct ? 1 : 0;
    statsRef.current.wrongCount += correct ? 0 : 1;
    statsRef.current.expEarned += earnsRewards ? rewards.exp : 0;
    statsRef.current.goldEarned += earnsRewards ? rewards.gold : 0;
    if (!statsRef.current.usedSkillIds.includes(selectedSkillId)) {
      statsRef.current.usedSkillIds.push(selectedSkillId);
    }

    if (earnsRewards) {
      store.addExp(rewards.exp);
      store.addRankPoints(correct ? (critical ? 20 : 10) + getSchoolRankPointBonus(player.school, correct) : 0);
      store.checkRankUp();
    }

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

    // 等学生读完解析后手动继续，再传给 Phaser 播放技能/伤害动画。
    setPendingAnswer({ skillId: selectedSkillId, isCorrect: correct });
  }, [currentQuestion, selectedSkillId, submitted, store]);

  const continueAfterAnswer = useCallback(() => {
    if (!pendingAnswer) return;
    gameRef.current?.setAnswerResult(pendingAnswer);
    setCurrentQuestion(null);
    setSelectedSkillId(null);
    setSelectedOption(null);
    setSubmitted(false);
    setIsCorrect(null);
    setPendingAnswer(null);
  }, [pendingAnswer]);

  const handleBattleEnd = useCallback((result: BattleEndResult) => {
    const latestStore = useDungeonStore.getState();
    if (latestStore.currentBattleEarnsRewards && !challengeConsumedRef.current) {
      challengeConsumedRef.current = true;
      latestStore.useChallenge();
    }
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
      {battleNotice && (
        <div style={{ position: 'fixed', top: 84, left: '50%', transform: 'translateX(-50%)', zIndex: 1002, padding: '10px 16px', background: '#3b1d1d', border: '1px solid #ef4444', color: '#fecaca', fontSize: 13 }}>
          {battleNotice}
          {noticeSkillId && (
            <button onClick={() => void retryFailedSkill()} style={{ marginLeft: 12, border: 0, background: '#ef4444', color: '#fff', cursor: 'pointer', padding: '3px 10px', borderRadius: 4 }}>重试</button>
          )}
          <button onClick={() => setBattleNotice(null)} style={{ marginLeft: 12, border: 0, background: 'transparent', color: '#fff', cursor: 'pointer' }}>知道了</button>
        </div>
      )}

      {/* 题目弹窗 */}
      {currentQuestion && (
        <div className="battle-question-overlay">
          <div className="battle-question-card">
            <div className="battle-question-banner">
              {selectedSkillId ? getSkillById(selectedSkillId)?.name : '施法中...'}
            </div>

            {!submitted && (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginBottom: '10px' }}>
                <button
                  className="pixel-btn"
                  disabled={trialInventory.hintTickets <= 0 || hintRevealed}
                  onClick={() => {
                    if (consumeTrialItem('hint-ticket')) setHintRevealed(true);
                  }}
                  style={{ fontSize: '10px', padding: '5px 8px' }}
                >
                  💡 提示券 {trialInventory.hintTickets}
                </button>
                <button
                  className="pixel-btn"
                  disabled={trialInventory.healingPotions <= 0}
                  onClick={() => {
                    if (consumeTrialItem('healing-potion')) gameRef.current?.healPlayer(35);
                  }}
                  style={{ fontSize: '10px', padding: '5px 8px' }}
                >
                  🧪 回血 {trialInventory.healingPotions}
                </button>
              </div>
            )}

            {hintRevealed && (
              <div style={{ marginBottom: '10px', padding: '8px 10px', fontSize: '12px', color: '#fde68a', background: 'rgba(245,158,11,0.14)', border: '1px solid #d97706' }}>
                提示：先抓住「{currentQuestion.knowledgePoint || '题干中的关键条件'}」，再逐项排除与条件不符的选项。
              </div>
            )}

            <div className="battle-question-text">{renderBattleStem(currentQuestion.question)}</div>
            {currentQuestion.code && (
              <pre className="battle-question-code"><code>{formatCppCode(currentQuestion.code)}</code></pre>
            )}
            {getTrustedQuestionImage(currentQuestion) && resolveQuestionImage(getTrustedQuestionImage(currentQuestion)) && (
              <div className="battle-question-image-wrap">
                <BattleImage
                  key={getTrustedQuestionImage(currentQuestion)!}
                  className="battle-question-image"
                  src={resolveQuestionImage(getTrustedQuestionImage(currentQuestion))!}
                />
              </div>
            )}

            <div className={`battle-options${selectedOption !== null ? ' has-selection' : ''}`}>
              {!currentQuestion.options || currentQuestion.options.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#ff4444', padding: '12px' }}>
                  该题目缺少选项，无法作答
                  <button
                    className="pixel-btn"
                    style={{ marginTop: '12px', width: '100%' }}
                    onClick={() => {
                      gameRef.current?.cancelPendingSkill();
                      setCurrentQuestion(null);
                      setSelectedSkillId(null);
                      setBattleNotice('这道题目暂时无法作答，技能没有消耗。');
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
                  } else if (idx === selectedOption) {
                    btnClass += ' selected';
                  }

                  return (
                    <button
                      key={idx}
                      className={btnClass}
                      disabled={submitted}
                      onClick={() => setSelectedOption(idx)}
                    >
                      <span className="battle-option-letter">{letter}</span>
                      <span>{clean}</span>
                    </button>
                  );
                })
              )}
            </div>

            {!submitted && currentQuestion.options && currentQuestion.options.length > 0 && (
              <button
                className="pixel-btn battle-submit-btn"
                disabled={selectedOption === null}
                onClick={() => {
                  if (selectedOption !== null) handleAnswer(selectedOption);
                }}
              >
                {selectedOption === null ? '先选择一个选项' : `提交答案（${String.fromCharCode(65 + selectedOption)}）`}
              </button>
            )}

            {submitted && (
              <div className={`battle-answer-feedback ${isCorrect ? 'correct' : 'wrong'}`}>
                <div>{isCorrect ? '✅ 回答正确！技能完美释放' : '❌ 回答错误，技能施法失败'}</div>
                {selectedOption !== null && currentQuestion.correctIndex !== undefined && (
                  <div className="battle-answer-detail">
                    正确答案：{String.fromCharCode(65 + currentQuestion.correctIndex)}
                    {selectedOption !== currentQuestion.correctIndex
                      ? `；你的选择：${String.fromCharCode(65 + selectedOption)}`
                      : ''}
                  </div>
                )}
                {currentQuestion.explanation ? (
                  <div className="battle-answer-explanation">
                    {currentQuestion.explanation}
                  </div>
                ) : (
                  <div className="battle-answer-explanation muted">
                    这道题暂时没有详细解析，可以先看正确答案，再继续战斗。
                  </div>
                )}
                {!isCorrect && currentQuestion && (
                  <KnowledgePointHelp questionId={currentQuestion.id} isCorrect={false} />
                )}
                <button className="pixel-btn battle-continue-btn" onClick={continueAfterAnswer}>
                  继续战斗
                </button>
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
