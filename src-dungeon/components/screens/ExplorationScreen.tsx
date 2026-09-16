import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Backpack, CircleHelp, Footprints, Gem, MapPinned, ScrollText, Shield, ShieldCheck, Swords, X } from 'lucide-react';
import { useDungeonStore } from '../../stores/dungeonStore';
import { useExplorationStore } from '../../stores/explorationStore';
import { useTrialEquipmentStore } from '../../stores/trialEquipmentStore';
import { EQUIPMENT_CATEGORY_LABELS, TRIAL_EQUIPMENT, RARITY_LABELS, getEquipmentResetDescription } from '../../data/explorationItems';
import { EXPLORATION_STAGE_CONFIGS, getExplorationEquipment, getExplorationStageConfig } from '../../data/explorationStages';
import type { ExplorationStageConfig } from '../../data/explorationStages';
import { getExplorationTheme } from '../../data/explorationThemes';
import type { ExplorationEvent, ExplorationRouteChoice, GridPoint } from '../../types/exploration';
import type { Question } from '../../types/dungeon';
import {
  computeVisible,
  findNextUnresolvedSeal,
  findRevealedPath,
  generateExplorationMap,
  getExplorationRegion,
  getUnlockedExplorationRegion,
  isAdjacent,
  pointKey,
} from '../../utils/explorationLogic';
import { isUsableChoiceQuestion, pickStagePlanQuestions } from '../../utils/questionLoader';
import { formatChoiceOption } from '../../utils/questionDisplay';
import { findArtifactPreviewTarget } from '../../utils/trialEquipmentEffects';

const EVENT_ICONS: Record<ExplorationEvent['type'], string> = {
  seal: '/dungeon-exploration/items/knowledge-seal.webp',
  clue: '/dungeon-exploration/items/heavenly-slip.webp',
  route: '/dungeon-exploration/items/route-fork.webp',
  treasure: '/dungeon-exploration/items/treasure-chest.webp',
  equipment: '/dungeon-exploration/weapons/xuanwu-hammer-common.webp',
  merchant: '/dungeon-exploration/items/merchant.webp',
  trap: '/dungeon-exploration/items/trap.webp',
  exit: '/dungeon-exploration/items/exit-gate.webp',
};

const EVENT_LABELS: Record<ExplorationEvent['type'], string> = {
  seal: '知识封印', clue: '天机玉简', route: '灵脉岔路', treasure: '玄甲宝箱', equipment: '兵器遗藏', merchant: '游方商人', trap: '机关陷阱', exit: '天机出口',
};

const HELP_EVENTS = [
  ['seal', '知识封印', '本区必做题目，答错也可继续并自动加入错题本。'],
  ['clue', '天机玉简', '标记最近封印并提示知识点，不会直接打开道路。'],
  ['route', '灵脉岔路', '只能选择一次，稳妥路线和试炼路线都能通关。'],
  ['treasure', '玄甲宝箱', '获得待结算金币与经验，抵达出口才到账。'],
  ['equipment', '兵器遗藏', '获得试炼装备，效果和范围可在背包查看。'],
  ['merchant', '游方商人', '提供探索道具；首通相遇会赠送净化玉符。'],
  ['trap', '机关陷阱', '施加临时减益，不会永久扣除智子属性。'],
  ['exit', '天机出口', '三道封印全部解除后，在这里统一结算。'],
] as const;

function loadImages(paths: string[]): Record<string, HTMLImageElement> {
  const images: Record<string, HTMLImageElement> = {};
  for (const path of paths) {
    const image = new Image();
    image.src = path;
    images[path] = image;
  }
  return images;
}

function chooseExplorationQuestions(bank: Question[], config: ExplorationStageConfig): Question[] {
  const planned = pickStagePlanQuestions(bank, config.dungeonId, config.stageId, 3)
    .filter(isUsableChoiceQuestion);
  if (planned.length >= 3) return planned.slice(0, 3);
  const fallback = bank.filter(isUsableChoiceQuestion).filter(question => !planned.some(item => item.id === question.id));
  return [...planned, ...fallback].slice(0, 3);
}

function HelpModal({ config, onClose, onOpenGuide }: { config: ExplorationStageConfig; onClose: () => void; onOpenGuide: () => void }) {
  const equipment = getExplorationEquipment(config);
  return (
    <div className="explore-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="explore-modal explore-help-modal" role="dialog" aria-modal="true" aria-labelledby="explore-help-title">
        <button className="explore-icon-button explore-modal-close" onClick={onClose} aria-label="关闭说明"><X size={20} /></button>
        <div className="explore-modal-kicker">探索规则</div>
        <h2 id="explore-help-title">揭开迷雾，解除三道知识封印</h2>
        <div className="explore-rule-grid">
          <div><strong>道路与迷雾</strong><span>明亮地面是当前可见道路，暗色地面是走过的道路，两者都可点击自动前往；凸起石墙和浓雾不可点击。</span></div>
          <div><strong>题目</strong><span>三道封印都要作答；答错不会卡关，会记录到错题本。</span></div>
          <div><strong>三区</strong><span>依次穿过{config.regionNames.join('、')}；每一区都有一道必做封印。</span></div>
          <div><strong>玉简</strong><span>找到天机玉简会标记最近一道未解封印，并提前提示其考查知识点。</span></div>
          <div><strong>岔路</strong><span>稳妥路线直接获得少量金币；试炼路线缩小视野，到下一道封印答对可得更多奖励。</span></div>
          <div><strong>奖励</strong><span>地图内奖励先暂存，到达出口后一次性结算，不会重复发放。</span></div>
          <div><strong>装备</strong><span>装备标明生效范围。武器、护甲和法器的首件收获会自动装备，可在右侧背包切换。</span></div>
          <div><strong>道具</strong><span>在背包中点击“使用”。没有适用状态时按钮会禁用，不会误消耗。</span></div>
          <div><strong>品级来源</strong><span>每关掉落与品级均为固定配置，没有抽卡、概率或暗池。本关固定掉落：{RARITY_LABELS[equipment.rarity]}「{equipment.name}」。</span></div>
          <div><strong>重复装备</strong><span>不会占用背包；自动转化为器魂碎片：普通 2、稀有 5、史诗 12、传说 25。</span></div>
        </div>
        <div className="explore-help-subtitle">地图事件</div>
        <div className="explore-event-guide">
          {HELP_EVENTS.map(([type, label, description]) => <div key={type}><img src={type === 'equipment' ? equipment.icon : EVENT_ICONS[type]} alt="" /><span><strong>{label}</strong><small>{description}</small></span></div>)}
        </div>
        <p className="explore-help-note">每个普通关卡的首通探索均免费。可以中途返回，每关的位置、题目与迷雾分别自动保存。</p>
        <div className="explore-modal-actions"><button className="explore-action" onClick={onOpenGuide}>装备与道具图鉴</button><button className="explore-action primary" onClick={onClose}>开始探索</button></div>
      </section>
    </div>
  );
}

function EquipmentGuideModal({ focusId, onClose }: { focusId: string; onClose: () => void }) {
  const entries = Object.values(TRIAL_EQUIPMENT).sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId));
  return (
    <div className="explore-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="explore-modal equipment-guide-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-guide-title">
        <button className="explore-icon-button explore-modal-close" onClick={onClose} aria-label="关闭图鉴"><X size={20} /></button>
        <div className="explore-modal-kicker">规则透明 · 无抽卡</div>
        <h2 id="equipment-guide-title">装备与道具图鉴</h2>
        <p className="equipment-guide-rule">40 个普通关卡各有一件固定首通装备。品级由关卡配置决定，不随机、不抽卡；重复装备会自动转化为器魂碎片。</p>
        <div className="equipment-guide-grid">
          {entries.map(definition => {
            const sources = EXPLORATION_STAGE_CONFIGS.filter(stage => stage.equipmentId === definition.id);
            const sourceText = sources.length > 0
              ? `固定来源：${sources.map(stage => `${stage.dungeonName}${stage.stageName}`).join('、')}`
              : definition.id === 'cleansing-talisman'
                ? '固定来源：每张首通迷宫的游方商人首次赠礼'
                : '来源：旧版探索存档保留物品';
            return <article key={definition.id} className={`equipment-guide-item rarity-${definition.rarity} ${definition.id === focusId ? 'focused' : ''}`}>
              <img src={definition.icon} alt="" />
              <div><small>{RARITY_LABELS[definition.rarity]} · {EQUIPMENT_CATEGORY_LABELS[definition.category]}</small><strong>{definition.name}</strong><p>{definition.description}</p><span>生效范围：{definition.scope}</span><span>失效与重置：{getEquipmentResetDescription(definition)}</span><em>{sourceText}</em></div>
            </article>;
          })}
        </div>
      </section>
    </div>
  );
}

interface EventModalProps {
  config: ExplorationStageConfig;
  event: ExplorationEvent;
  question?: Question;
  sealsSolved: number;
  onResolve: (correct?: boolean) => void;
  onChooseRoute: (choice: ExplorationRouteChoice) => void;
  onClose: () => void;
  onFinish: () => void;
  clueTarget?: ExplorationEvent;
  clueTopic?: string;
}

function EventModal({ config, event, question, sealsSolved, onResolve, onChooseRoute, onClose, onFinish, clueTarget, clueTopic }: EventModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const correct = selected === question?.correctIndex;
  const exitReady = sealsSolved >= 3;
  const equipment = getExplorationEquipment(config);
  const eventIcon = event.type === 'equipment' ? equipment.icon : EVENT_ICONS[event.type];

  return (
    <div className="explore-modal-backdrop">
      <section className={`explore-modal event-${event.type}`} role="dialog" aria-modal="true">
        <button className="explore-icon-button explore-modal-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        <img className="explore-event-art" src={eventIcon} alt="" />
        <div className="explore-modal-kicker">{EVENT_LABELS[event.type]}</div>

        {event.type === 'seal' && question && (
          <>
            <h2>校验{question.knowledgePoint || '数字根基'}</h2>
            <p className="explore-question-stem">{question.question}</p>
            <div className="explore-options">
              {question.options!.map((option, index) => (
                <button
                  key={`${question.id}-${index}`}
                  className={`explore-option ${selected === index ? 'selected' : ''} ${answered && index === question.correctIndex ? 'correct' : ''} ${answered && selected === index && !correct ? 'wrong' : ''}`}
                  onClick={() => !answered && setSelected(index)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>{formatChoiceOption(option)}
                </button>
              ))}
            </div>
            {!answered ? (
              <button className="explore-action primary" disabled={selected === null} onClick={() => setAnswered(true)}>提交答案</button>
            ) : (
              <>
                <div className={`explore-answer ${correct ? 'is-correct' : 'is-wrong'}`}>
                  <strong>{correct ? '封印解除' : '答案已记录'}</strong>
                  <span>{correct ? '灵脉响应，出口封印减弱了一层。' : `正确答案是 ${String.fromCharCode(65 + (question.correctIndex || 0))}。本题已加入错题本，但仍可继续探索。`}</span>
                  {question.explanation && <small>{question.explanation}</small>}
                </div>
                <button className="explore-action primary" onClick={() => onResolve(correct)}>继续探索</button>
              </>
            )}
          </>
        )}

        {event.type === 'clue' && <SimpleEvent title="玉简映出灵脉" text={clueTarget ? `最近的未解封印已标记在迷雾中，考查方向：${clueTopic || '计算机基础'}。标记只提示方位，不会替你穿过墙壁。` : '三道知识封印均已找到，玉简化为 3 点试炼 EXP。'} action="记下线索" onClick={() => onResolve()} />}
        {event.type === 'route' && (
          <>
            <h2>选择前往{config.regionNames[2]}的路线</h2>
            <p className="explore-event-copy">选择会立即保存，本次探索不能反复切换。两条路线都能正常通关。</p>
            <div className="explore-route-options">
              <button onClick={() => onChooseRoute('safe')}><Shield size={28} /><span><strong>稳妥通道</strong><small>视野不变，立即暂存 {config.rewards.safeRouteCoins} 金币</small></span></button>
              <button className="challenge" onClick={() => onChooseRoute('challenge')}><Swords size={28} /><span><strong>试炼通道</strong><small>视野暂时缩小；下一道封印答对暂存 {config.rewards.challengeRouteCoins} 金币</small></span></button>
            </div>
          </>
        )}
        {event.type === 'treasure' && <SimpleEvent title="秘境宝箱开启" text={`获得 ${config.rewards.treasureCoins} 通用金币与 ${config.rewards.treasureExp} 试炼 EXP。奖励将在出口统一结算。`} action="收入行囊" onClick={() => onResolve()} />}
        {event.type === 'equipment' && <SimpleEvent title={`发现${equipment.name}`} text={`${RARITY_LABELS[equipment.rarity]} · ${EQUIPMENT_CATEGORY_LABELS[equipment.category]}。${equipment.description} 生效范围：${equipment.scope} 失效与重置：${getEquipmentResetDescription(equipment)}`} action="收入行囊" onClick={() => onResolve()} />}
        {event.type === 'merchant' && <SimpleEvent title="游方商人的见面礼" text="商人赠予一枚净化玉符，可清除探索中的一次临时减益。" action="收下玉符" onClick={() => onResolve()} />}
        {event.type === 'trap' && <SimpleEvent title="触发错位机关" text="获得临时减益“迷雾侵扰”：周围可见范围缩小。可继续探索，也可在背包使用净化玉符立即解除。" action="继续探索" onClick={() => onResolve()} />}
        {event.type === 'exit' && (
          <>
            <h2>{exitReady ? '天机出口已开启' : '出口仍被封印'}</h2>
            <p className="explore-event-copy">
              {exitReady ? '三道知识封印均已解除。现在离开将结算本次发现的金币、经验与装备。' : `还需完成 ${3 - sealsSolved} 道知识封印。沿未探索的通路继续寻找。`}
            </p>
            <button className={`explore-action ${exitReady ? 'primary' : ''}`} onClick={exitReady ? onFinish : onClose}>
              {exitReady ? '完成探索并结算' : '继续寻找封印'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function SimpleEvent({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return <><h2>{title}</h2><p className="explore-event-copy">{text}</p><button className="explore-action primary" onClick={onClick}>{action}</button></>;
}

export default function ExplorationScreen() {
  const { dungeonId, stageId } = useParams<{ dungeonId: string; stageId: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const walkTokenRef = useRef(0);
  const questionBank = useDungeonStore(state => state.questionBank);
  const dungeonProgress = useDungeonStore(state => state.dungeonProgress);
  const current = useExplorationStore(state => state.current);
  const load = useExplorationStore(state => state.load);
  const move = useExplorationStore(state => state.move);
  const resolveEvent = useExplorationStore(state => state.resolveEvent);
  const dismissEvent = useExplorationStore(state => state.dismissEvent);
  const previewEvent = useExplorationStore(state => state.previewEvent);
  const chooseRoute = useExplorationStore(state => state.chooseRoute);
  const clearDebuff = useExplorationStore(state => state.clearDebuff);
  const markCompleted = useExplorationStore(state => state.markCompleted);
  const markSettled = useExplorationStore(state => state.markSettled);
  const ownedItems = useTrialEquipmentStore(state => state.ownedItems);
  const equippedWeaponId = useTrialEquipmentStore(state => state.equippedWeaponId);
  const equippedArmorId = useTrialEquipmentStore(state => state.equippedArmorId);
  const equippedArtifactId = useTrialEquipmentStore(state => state.equippedArtifactId);
  const soulFragments = useTrialEquipmentStore(state => state.soulFragments);
  const loadEquipment = useTrialEquipmentStore(state => state.load);
  const grantItem = useTrialEquipmentStore(state => state.grantItem);
  const consumeItem = useTrialEquipmentStore(state => state.consumeItem);
  const equipItem = useTrialEquipmentStore(state => state.equipItem);
  const [activeEvent, setActiveEvent] = useState<ExplorationEvent | null>(null);
  const [showHelp, setShowHelp] = useState(() => localStorage.getItem('csp_exploration_tutorial_seen') !== '1');
  const [showBackpack, setShowBackpack] = useState(false);
  const [guideFocusId, setGuideFocusId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [imagesReady, setImagesReady] = useState(0);
  const [autoWalking, setAutoWalking] = useState(false);
  const config = useMemo(() => getExplorationStageConfig(dungeonId, stageId), [dungeonId, stageId]);
  const activeConfig = config || EXPLORATION_STAGE_CONFIGS[0];
  const isCorrectRoute = Boolean(config);
  const previewUnlocked = import.meta.env.DEV && new URLSearchParams(window.location.search).has('explorationPreview');
  const stageNumber = Number(activeConfig.stageId.match(/stage-(\d+)$/)?.[1] || 0);
  const stageUnlocked = previewUnlocked || Boolean(config && (dungeonProgress.find(progress => progress.dungeonId === activeConfig.dungeonId)?.completedStages || 0) >= stageNumber);
  const map = useMemo(() => generateExplorationMap({ id: activeConfig.mapId, width: activeConfig.width, height: activeConfig.height }), [activeConfig]);
  const theme = useMemo(() => getExplorationTheme(dungeonId || 'dungeon-01'), [dungeonId]);
  const equipment = useMemo(() => getExplorationEquipment(activeConfig), [activeConfig]);
  const equippedArtifactDefinitionId = useMemo(() => ownedItems.find(item => item.id === equippedArtifactId)?.definitionId, [ownedItems, equippedArtifactId]);
  const eventIcons = useMemo(() => ({ ...EVENT_ICONS, equipment: equipment.icon }), [equipment]);
  const selectedQuestions = useMemo(() => config ? chooseExplorationQuestions(questionBank, activeConfig) : [], [questionBank, config, activeConfig]);
  const imagePaths = useMemo(() => [...Object.values(eventIcons), theme.surface], [eventIcons, theme.surface]);
  const images = useMemo(() => loadImages(imagePaths), [imagePaths]);

  useEffect(() => {
    if (!config || !isCorrectRoute || !stageUnlocked || selectedQuestions.length < 3) return;
    load(map, selectedQuestions.map(question => question.id));
    loadEquipment();
  }, [config, isCorrectRoute, stageUnlocked, selectedQuestions, load, loadEquipment, map]);

  useEffect(() => {
    let mounted = true;
    Object.values(images).forEach(image => {
      const done = () => mounted && setImagesReady(value => value + 1);
      if (image.complete) done();
      else image.addEventListener('load', done, { once: true });
    });
    return () => { mounted = false; };
  }, [images]);

  useEffect(() => {
    if (!current || current.mapId !== map.id || current.completed || !equippedArtifactDefinitionId) return;
    const marker = 'artifact-effect:preview-used';
    if (current.previewedEventIds.includes(marker)) return;
    const target = findArtifactPreviewTarget(map, current.position, new Set(current.resolvedEventIds), equippedArtifactDefinitionId);
    if (target) {
      previewEvent(target.id);
      setNotice(`${TRIAL_EQUIPMENT[equippedArtifactDefinitionId].name}生效：已预览${EVENT_LABELS[target.type]}方向`);
    }
    previewEvent(marker);
  }, [current, equippedArtifactDefinitionId, map, previewEvent]);

  const activeQuestionIndex = activeEvent?.questionIndex;
  const currentQuestion = activeQuestionIndex === undefined || !current
    ? undefined
    : questionBank.find(question => question.id === current.questionIds[activeQuestionIndex]);
  const visible = useMemo(
    () => current ? computeVisible(map, current.position, current.activeDebuffs.some(item => item === 'fogged-vision' || item === 'challenge-route') ? 1 : 2) : new Set<string>(),
    [current, map],
  );
  const currentRegion = current ? getExplorationRegion(map, current.position) : 1;

  const eventAt = useCallback((position: GridPoint) => map.events.find(event => pointKey(event.position) === pointKey(position)), [map]);

  useEffect(() => {
    if (!current || current.mapId !== map.id || current.completed || activeEvent) return;
    const event = eventAt(current.position);
    if (event && !current.resolvedEventIds.includes(event.id) && current.dismissedEventId !== event.id) setActiveEvent(event);
  }, [current, eventAt, activeEvent]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cell = Math.min(canvas.width / map.width, canvas.height / map.height);
    const ox = (canvas.width - cell * map.width) / 2;
    const oy = (canvas.height - cell * map.height) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme.fog;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const surface = images[theme.surface];
    if (surface?.complete) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(surface, ox, oy, cell * map.width, cell * map.height);
      ctx.globalAlpha = 1;
    }
    const revealed = new Set(current.revealed);
    const clearerPaths = equippedArtifactDefinitionId === 'compass-common' || equippedArtifactDefinitionId === 'path-compass';
    const fogLayer = ctx.createRadialGradient(
      ox + cell * map.width * .38,
      oy + cell * map.height * .42,
      cell,
      ox + cell * map.width * .5,
      oy + cell * map.height * .5,
      cell * Math.max(map.width, map.height) * .72,
    );
    fogLayer.addColorStop(0, 'rgba(18, 48, 48, .95)');
    fogLayer.addColorStop(.52, 'rgba(4, 19, 20, .98)');
    fogLayer.addColorStop(1, theme.fog);
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const key = `${x},${y}`;
        const isFloor = map.tiles[y][x] === 0;
        const isVisible = visible.has(key);
        const wasRevealed = revealed.has(key);
        const tileX = ox + x * cell;
        const tileY = oy + y * cell;
        if (!wasRevealed && !isVisible) {
          ctx.fillStyle = fogLayer;
          ctx.fillRect(tileX, tileY, cell + .5, cell + .5);
          const touchesKnown = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => revealed.has(`${x + dx},${y + dy}`) || visible.has(`${x + dx},${y + dy}`));
          if (touchesKnown) {
            ctx.strokeStyle = `${theme.fogEdge}66`;
            ctx.lineWidth = Math.max(1, cell * .035);
            ctx.strokeRect(tileX + 1, tileY + 1, cell - 2, cell - 2);
          }
        } else if (isFloor) {
          const regionId = map.regions[y]?.[x] as 1 | 2 | 3;
          const tint = theme.regionTints[regionId] || theme.regionTints[1];
          ctx.fillStyle = isVisible ? tint.visible : tint.revealed;
          ctx.fillRect(tileX, tileY, cell + .5, cell + .5);
          ctx.strokeStyle = isVisible ? 'rgba(184, 241, 221, .42)' : clearerPaths ? 'rgba(129, 235, 210, .58)' : 'rgba(99, 170, 156, .22)';
          ctx.lineWidth = clearerPaths && !isVisible ? Math.max(1.5, cell * .04) : 1;
          ctx.strokeRect(tileX + 1.5, tileY + 1.5, cell - 3, cell - 3);
          if (isVisible) {
            ctx.strokeStyle = 'rgba(230, 255, 244, .18)';
            ctx.beginPath();
            ctx.moveTo(tileX + 4, tileY + 4);
            ctx.lineTo(tileX + cell - 4, tileY + 4);
            ctx.stroke();
          }
        } else {
          const wall = ctx.createLinearGradient(tileX, tileY, tileX + cell, tileY + cell);
          wall.addColorStop(0, isVisible ? theme.wallEdge : theme.wallTop);
          wall.addColorStop(.24, theme.wallTop);
          wall.addColorStop(1, theme.fog);
          ctx.fillStyle = wall;
          ctx.fillRect(tileX + 1, tileY + 1, cell - 2, cell - 2);
          ctx.strokeStyle = isVisible ? `${theme.wallEdge}cc` : `${theme.wallEdge}55`;
          ctx.lineWidth = Math.max(1, cell * .035);
          ctx.strokeRect(tileX + 2, tileY + 2, cell - 5, cell - 5);
          ctx.fillStyle = 'rgba(0, 0, 0, .38)';
          ctx.fillRect(tileX + cell * .78, tileY + 4, cell * .16, cell - 8);
          ctx.fillRect(tileX + 4, tileY + cell * .78, cell - 8, cell * .16);
          ctx.strokeStyle = 'rgba(215, 235, 224, .12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          if ((x + y) % 2 === 0) {
            ctx.moveTo(tileX + cell * .16, tileY + cell * .52);
            ctx.lineTo(tileX + cell * .72, tileY + cell * .52);
          } else {
            ctx.moveTo(tileX + cell * .5, tileY + cell * .16);
            ctx.lineTo(tileX + cell * .5, tileY + cell * .72);
          }
          ctx.stroke();
        }
      }
    }
    for (const event of map.events) {
      const key = pointKey(event.position);
      const isPreviewed = current.previewedEventIds.includes(event.id);
      if (!revealed.has(key) && !visible.has(key) && !isPreviewed) continue;
      if (current.resolvedEventIds.includes(event.id) && event.type !== 'exit') continue;
      const image = images[eventIcons[event.type]];
      if (image?.complete) {
        const size = cell * (event.type === 'exit' ? 1.05 : 0.82);
        if (isPreviewed && !revealed.has(key) && !visible.has(key)) {
          const cx = ox + event.position.x * cell + cell / 2;
          const cy = oy + event.position.y * cell + cell / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.48, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(244, 199, 92, .19)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 224, 137, .8)';
          ctx.stroke();
        }
        ctx.globalAlpha = visible.has(key) ? 1 : (isPreviewed ? 0.82 : 0.48);
        ctx.drawImage(image, ox + event.position.x * cell + (cell - size) / 2, oy + event.position.y * cell + (cell - size) / 2, size, size);
        ctx.globalAlpha = 1;
      }
    }
    const px = ox + current.position.x * cell + cell / 2;
    const py = oy + current.position.y * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#f4c75c';
    ctx.fill();
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.strokeStyle = '#fff3c4';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(244,199,92,.38)';
    ctx.stroke();
  }, [current, equippedArtifactDefinitionId, eventIcons, images, imagesReady, map, theme, visible]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => () => { walkTokenRef.current += 1; }, []);

  const tryMove = useCallback(async (target: GridPoint, singleStep = false) => {
    const progress = useExplorationStore.getState().current;
    if (!progress || activeEvent || progress.completed || autoWalking) return;
    if (map.tiles[target.y]?.[target.x] !== 0) {
      setNotice('这里是墙壁，请选择发光的通路');
      return;
    }
    if (singleStep && !isAdjacent(progress.position, target)) return;
    const path = singleStep
      ? [progress.position, target]
      : findRevealedPath(map, progress.position, target, new Set(progress.revealed));
    if (path.length < 2) {
      if (pointKey(progress.position) !== pointKey(target)) setNotice('只能前往已经照亮并连通的通路');
      return;
    }

    const token = walkTokenRef.current + 1;
    walkTokenRef.current = token;
    setAutoWalking(path.length > 2);
    for (const step of path.slice(1)) {
      if (walkTokenRef.current !== token) break;
      const latest = useExplorationStore.getState().current;
      if (!latest) break;
      const unlockedRegion = getUnlockedExplorationRegion(map, new Set(latest.resolvedEventIds));
      const targetRegion = getExplorationRegion(map, step);
      if (targetRegion > unlockedRegion) {
        setNotice(`先解除${activeConfig.regionNames[unlockedRegion - 1]}的知识封印，下一区域才会开启`);
        break;
      }
      move(map, step);
      await new Promise(resolve => window.setTimeout(resolve, path.length > 2 ? 90 : 0));
      const updated = useExplorationStore.getState().current;
      const encountered = eventAt(step);
      if (encountered && updated && !updated.resolvedEventIds.includes(encountered.id)) {
        setActiveEvent(encountered);
        break;
      }
    }
    if (walkTokenRef.current === token) setAutoWalking(false);
  }, [activeConfig, activeEvent, autoWalking, eventAt, map, move]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeEvent || showHelp || showBackpack) return;
      const offsets: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      const offset = offsets[event.key];
      if (!offset || !current) return;
      event.preventDefault();
      void tryMove({ x: current.position.x + offset[0], y: current.position.y + offset[1] }, true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeEvent, current, showBackpack, showHelp, tryMove]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cell = Math.min(canvas.width / map.width, canvas.height / map.height);
    const ox = (canvas.width - cell * map.width) / 2;
    const oy = (canvas.height - cell * map.height) / 2;
    const x = Math.floor(((event.clientX - rect.left) * scaleX - ox) / cell);
    const y = Math.floor(((event.clientY - rect.top) * scaleY - oy) / cell);
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) void tryMove({ x, y });
  };

  const handleResolve = (correct?: boolean) => {
    if (!activeEvent || !current) return;
    if (activeEvent.type === 'seal') {
      const question = currentQuestion;
      if (question) {
        const isCorrect = correct === true;
        useDungeonStore.getState().recordAnswer(isCorrect);
        if (!isCorrect) {
          useDungeonStore.getState().addWeakPoint(question.knowledgePoint || '计算机基础');
          useDungeonStore.getState().addToMistakeNotebook(question.id);
        }
        useDungeonStore.getState().saveToLocalStorage();
      }
      const challengeActive = current.activeDebuffs.includes('challenge-route');
      resolveEvent(activeEvent.id, {
        sealsSolved: current.sealsSolved + 1,
        sealsWrong: current.sealsWrong + (correct ? 0 : 1),
        pendingCoins: current.pendingCoins + (challengeActive && correct ? activeConfig.rewards.challengeRouteCoins : 0),
        pendingExp: current.pendingExp + (correct ? activeConfig.rewards.sealCorrectExp : activeConfig.rewards.sealWrongExp),
        activeDebuffs: challengeActive ? current.activeDebuffs.filter(item => item !== 'challenge-route') : current.activeDebuffs,
      });
      if (challengeActive) setNotice(correct ? `试炼路线完成，额外暂存 ${activeConfig.rewards.challengeRouteCoins} 金币` : '试炼路线结束，本次没有额外金币');
    } else if (activeEvent.type === 'clue') {
      const target = findNextUnresolvedSeal(map, current.position, new Set(current.resolvedEventIds));
      if (target) previewEvent(target.id);
      resolveEvent(activeEvent.id, target ? {} : { pendingExp: current.pendingExp + activeConfig.rewards.clueExp });
    } else if (activeEvent.type === 'treasure') {
      resolveEvent(activeEvent.id, { pendingCoins: current.pendingCoins + activeConfig.rewards.treasureCoins, pendingExp: current.pendingExp + activeConfig.rewards.treasureExp });
    } else if (activeEvent.type === 'equipment') {
      const result = grantItem(activeConfig.equipmentId);
      resolveEvent(activeEvent.id);
      setNotice(result.duplicate ? `重复装备已化为 ${result.soulGained} 器魂` : `${equipment.name}已收入行囊`);
    } else if (activeEvent.type === 'merchant') {
      grantItem('cleansing-talisman');
      resolveEvent(activeEvent.id);
    } else if (activeEvent.type === 'trap') {
      resolveEvent(activeEvent.id, {
        activeDebuffs: current.activeDebuffs.includes('fogged-vision')
          ? current.activeDebuffs
          : [...current.activeDebuffs, 'fogged-vision'],
      });
    } else {
      resolveEvent(activeEvent.id);
    }
    setActiveEvent(null);
  };

  const handleChooseRoute = (choice: ExplorationRouteChoice) => {
    if (!activeEvent || activeEvent.type !== 'route' || !current || current.routeChoice) return;
    chooseRoute(choice);
    if (choice === 'safe') {
      resolveEvent(activeEvent.id, { pendingCoins: current.pendingCoins + activeConfig.rewards.safeRouteCoins });
      setNotice(`已选择稳妥通道，暂存 ${activeConfig.rewards.safeRouteCoins} 金币`);
    } else {
      resolveEvent(activeEvent.id, {
        activeDebuffs: current.activeDebuffs.includes('challenge-route') ? current.activeDebuffs : [...current.activeDebuffs, 'challenge-route'],
      });
      setNotice(`已进入试炼通道：下一道封印答对可得 ${activeConfig.rewards.challengeRouteCoins} 金币`);
    }
    setActiveEvent(null);
  };

  const handleCloseEvent = () => {
    if (!activeEvent) return;
    dismissEvent(activeEvent.id);
    setActiveEvent(null);
    setNotice('已暂时离开事件；走开后再次返回仍可继续');
  };

  const handleUseItem = (ownedItemId: string, definitionId: string) => {
    if (definitionId !== 'cleansing-talisman') {
      setNotice('这个道具会在符合条件时自动生效');
      return;
    }
    if (!clearDebuff('fogged-vision')) {
      setNotice('当前没有需要净化的减益，道具不会消耗');
      return;
    }
    consumeItem(ownedItemId);
    setNotice('净化玉符已使用，迷雾视野恢复');
  };

  const finishExploration = () => {
    if (!current || current.sealsSolved < 3) return;
    if (!current.settled) {
      const exp = current.pendingExp + activeConfig.rewards.clearExp;
      const coinResult = useDungeonStore.getState().grantPetCoins(current.pendingCoins + activeConfig.rewards.clearCoins);
      useDungeonStore.getState().addExp(exp);
      useDungeonStore.getState().saveToLocalStorage();
      markSettled(coinResult.granted, exp);
    }
    markCompleted();
    setActiveEvent(null);
  };

  const closeHelp = () => {
    localStorage.setItem('csp_exploration_tutorial_seen', '1');
    setShowHelp(false);
  };

  if (!isCorrectRoute || !stageUnlocked) {
    return <div className="loading-screen"><div className="loading-title">迷雾入口尚未开启</div><p>通关对应普通关卡后即可进入探索。</p><button className="pixel-btn" onClick={() => navigate(`/dungeon/${activeConfig.dungeonId}`)}>返回{activeConfig.dungeonName}</button></div>;
  }
  if (!current || current.mapId !== map.id || selectedQuestions.length < 3) {
    return <div className="loading-screen"><div className="loading-title">正在校准天机迷阵...</div></div>;
  }
  if (current.completed) {
    const grantedCoins = current.settledCoins ?? current.pendingCoins + activeConfig.rewards.clearCoins;
    const grantedExp = current.settledExp ?? current.pendingExp + activeConfig.rewards.clearExp;
    return (
      <main className="explore-page explore-complete-page" style={{ '--explore-surface': `url(${theme.surface})` } as CSSProperties}>
        <section className="explore-complete-card">
          <img src="/dungeon-exploration/items/exit-gate.webp" alt="" />
          <div className="explore-modal-kicker">{activeConfig.dungeonName} · {activeConfig.stageName}</div>
          <h1>迷雾探索完成</h1>
          <p>你穿过{activeConfig.regionNames.join('、')}，解除了三道知识封印，本关探索记录已保存。</p>
          <div className="explore-summary-grid"><div><strong>{current.steps}</strong><span>探索步数</span></div><div><strong>{3 - current.sealsWrong}/3</strong><span>封印答对</span></div><div><strong>+{grantedCoins}</strong><span>发现金币</span></div><div><strong>+{grantedExp}</strong><span>试炼 EXP</span></div></div>
          <button className="explore-action primary" onClick={() => navigate(`/dungeon/${activeConfig.dungeonId}`)}>返回{activeConfig.dungeonName}</button>
        </section>
      </main>
    );
  }

  const equippedSlots = ([
    ['weapon', '武', '武器', equippedWeaponId],
    ['armor', '甲', '护甲', equippedArmorId],
    ['artifact', '器', '法器', equippedArtifactId],
  ] as const).map(([category, glyph, label, ownedId]) => {
    const owned = ownedItems.find(item => item.id === ownedId);
    return { category, glyph, label, ownedId, definition: owned ? TRIAL_EQUIPMENT[owned.definitionId] : null };
  });
  const sealEvents = map.events.filter(event => event.type === 'seal');
  const clueTarget = activeEvent?.type === 'clue'
    ? findNextUnresolvedSeal(map, current.position, new Set(current.resolvedEventIds))
    : undefined;
  const clueQuestionId = clueTarget?.questionIndex === undefined ? undefined : current.questionIds[clueTarget.questionIndex];
  const clueTopic = clueQuestionId ? questionBank.find(question => question.id === clueQuestionId)?.knowledgePoint : undefined;
  const fogPositionStyle = {
    '--fog-x': `${((current.position.x + .5) / map.width) * 100}%`,
    '--fog-y': `${((current.position.y + .5) / map.height) * 100}%`,
    '--fog-color': theme.fogEdge,
    '--explore-surface': `url(${theme.surface})`,
  } as CSSProperties;
  return (
    <main className={`explore-page ${equippedArtifactDefinitionId === 'compass-common' || equippedArtifactDefinitionId === 'path-compass' ? 'enhanced-paths' : ''}`} style={fogPositionStyle}>
      <header className="explore-header">
        <button className="explore-back-button" onClick={() => navigate(`/dungeon/${activeConfig.dungeonId}`)}><ArrowLeft size={18} />保存并返回</button>
        <div><span>{activeConfig.dungeonName} · {activeConfig.stageName}</span><h1>{activeConfig.title}</h1></div>
        <div className="explore-header-actions">
          <button className="explore-stat" title="已经移动的格数"><Footprints size={17} /><strong>{current.steps}</strong><span>步</span></button>
          <button className="explore-icon-button" onClick={() => setShowBackpack(true)} aria-label="打开背包"><Backpack size={20} /><i>{ownedItems.reduce((sum, item) => sum + item.quantity, 0)}</i></button>
          <button className="explore-icon-button" onClick={() => setShowHelp(true)} aria-label="探索说明"><CircleHelp size={21} /></button>
        </div>
      </header>

      <section className="explore-layout">
        <aside className="explore-side-panel objectives-panel">
          <div className="explore-section-title"><ScrollText size={17} /><span>本次目标</span></div>
          <div className="seal-progress"><strong>{current.sealsSolved}<small>/3</small></strong><span>知识封印</span></div>
          {sealEvents.map((seal, index) => {
            const done = current.resolvedEventIds.includes(seal.id);
            const previewed = current.previewedEventIds.includes(seal.id);
            return <div key={seal.id} className={`seal-row ${done ? 'done' : ''} ${previewed ? 'previewed' : ''}`}><ShieldCheck size={17} /><span>{activeConfig.regionNames[index]}</span><b>{done ? '已解除' : previewed ? '玉简已标记' : currentRegion >= index + 1 ? '探索中' : '迷雾中'}</b></div>;
          })}
          <div className="explore-divider" />
          <div className="region-status"><MapPinned size={16} /><span>当前区域</span><strong>第 {currentRegion} 区 · {activeConfig.regionNames[currentRegion - 1]}</strong></div>
          <div className="explore-mini-title">出口条件</div>
          <p>解除三道封印后，前往发光的天机门完成结算。</p>
          <div className="pending-rewards"><span>本次发现</span><strong>{current.pendingCoins} 金币 · {current.pendingExp} EXP</strong><small>抵达出口后到账</small></div>
          {current.activeDebuffs.includes('fogged-vision') && <div className="explore-debuff"><strong>迷雾侵扰</strong><span>可见范围缩小，可在背包使用净化玉符解除。</span></div>}
          {current.activeDebuffs.includes('challenge-route') && <div className="explore-debuff challenge-buff"><strong>试炼通道</strong><span>视野暂时缩小；下一道封印答对可额外获得 {activeConfig.rewards.challengeRouteCoins} 金币。</span></div>}
          {current.routeChoice && !current.activeDebuffs.includes('challenge-route') && <div className="route-choice-summary"><strong>{current.routeChoice === 'safe' ? '稳妥通道' : '试炼通道已完成'}</strong><span>路线选择已保存，本次探索不会重复结算。</span></div>}
        </aside>

        <section className="maze-shell" aria-label={`${activeConfig.title}迷宫`}>
          <div className="maze-caption"><span><i>第 {currentRegion} 区</i>{activeConfig.regionNames[currentRegion - 1]} · 点击已照亮通路自动前往 <button className="maze-help-button" onClick={() => setShowHelp(true)} aria-label="查看地图与迷雾说明" title="查看地图与迷雾说明">?</button></span><b>{notice || (autoWalking ? '正在沿已探索道路前进…' : '方向键 / WASD 也可操作')}</b></div>
          <div className="maze-canvas-wrap" style={fogPositionStyle}>
            <canvas className={autoWalking ? 'is-auto-walking' : ''} ref={canvasRef} width={900} height={660} onClick={handleCanvasClick} />
            {current.steps > 0 && <i key={current.steps} className="maze-fog-sweep" aria-hidden="true" />}
          </div>
          <div className="maze-legend"><span><i className="legend-player" />当前位置</span><span><i className="legend-seal" />知识封印</span><span><i className="legend-clue" />玉简/岔路</span><span><i className="legend-exit" />出口</span></div>
        </section>

        <aside className="explore-side-panel loadout-panel">
          <div className="explore-section-title"><Backpack size={17} /><span>试炼行囊</span></div>
          <div className="equipped-loadout-grid">
            {equippedSlots.map(slot => <button type="button" key={slot.category} className={`equipped-card rarity-${slot.definition?.rarity || 'empty'}`} title={slot.definition ? `${slot.definition.description} 生效范围：${slot.definition.scope}` : `尚未装备${slot.label}`} onClick={() => slot.definition && setGuideFocusId(slot.definition.id)}>
              {slot.definition ? <><img src={slot.definition.icon} alt="" /><div><small>{slot.label} · {RARITY_LABELS[slot.definition.rarity]}</small><strong>{slot.definition.name}</strong></div></> : <><div className="empty-slot">{slot.glyph}</div><div><small>{slot.label}</small><strong>尚未获得</strong></div></>}
            </button>)}
          </div>
          <div className="bag-grid">
            {Array.from({ length: 8 }, (_, index) => {
              const owned = ownedItems[index];
              const definition = owned ? TRIAL_EQUIPMENT[owned.definitionId] : null;
              return <button key={index} className={`bag-slot ${definition ? `rarity-${definition.rarity}` : ''}`} title={definition ? `${definition.name}：${definition.description} 生效范围：${definition.scope}` : '空背包格'} onClick={() => { if (!owned || !definition) return; if (definition.category === 'consumable') handleUseItem(owned.id, definition.id); else equipItem(owned.id); }}>{definition && <><img src={definition.icon} alt="" />{owned.quantity > 1 && <b>{owned.quantity}</b>}</>}</button>;
            })}
          </div>
          <div className="soul-counter"><Gem size={18} /><span>器魂碎片</span><strong>{soulFragments}</strong><button className="explore-help-dot" aria-label="器魂碎片说明" title="重复装备会自动转化为器魂；普通 2、稀有 5、史诗 12、传说 25。">?</button></div>
          <p className="loadout-footnote">点击装备可查看完整效果、范围与固定来源。</p>
        </aside>
      </section>

      {showHelp && <HelpModal config={activeConfig} onClose={closeHelp} onOpenGuide={() => { setShowHelp(false); setGuideFocusId(activeConfig.equipmentId); }} />}
      {guideFocusId && <EquipmentGuideModal focusId={guideFocusId} onClose={() => setGuideFocusId(null)} />}
      {showBackpack && (
        <div className="explore-drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && setShowBackpack(false)}>
          <aside className="explore-drawer">
            <button className="explore-icon-button explore-modal-close" onClick={() => setShowBackpack(false)} aria-label="关闭背包"><X size={20} /></button>
            <div className="explore-modal-kicker">试炼装备</div><h2>探索背包</h2>
            <p>装备与道具会跨关保存。换装前会显示与当前同部位装备的效果对比。</p>
            {notice && <div className="drawer-notice">{notice}</div>}
            <div className="drawer-items">
              {ownedItems.length === 0 ? <div className="drawer-empty">迷雾中还没有发现物品</div> : ownedItems.map(owned => {
                const definition = TRIAL_EQUIPMENT[owned.definitionId];
                const canCleanse = definition.id === 'cleansing-talisman' && current.activeDebuffs.includes('fogged-vision');
                const equippedId = definition.category === 'weapon' ? equippedWeaponId : definition.category === 'armor' ? equippedArmorId : equippedArtifactId;
                const currentOwned = ownedItems.find(item => item.id === equippedId);
                const currentDefinition = currentOwned ? TRIAL_EQUIPMENT[currentOwned.definitionId] : undefined;
                const isEquipped = equippedId === owned.id;
                return <article key={owned.id} className={`drawer-item rarity-${definition.rarity} ${isEquipped ? 'is-equipped' : ''}`}>
                  <img src={definition.icon} alt="" />
                  <div>
                    <small>{RARITY_LABELS[definition.rarity]} · {EQUIPMENT_CATEGORY_LABELS[definition.category]}</small>
                    <strong>{definition.name}{owned.quantity > 1 ? ` ×${owned.quantity}` : ''}</strong>
                    <p>{definition.description}</p>
                    <span>范围：{definition.scope}</span>
                    <span>失效与重置：{getEquipmentResetDescription(definition)}</span>
                    {!isEquipped && definition.category !== 'consumable' && currentDefinition && <div className="equipment-comparison"><b>当前装备：{currentDefinition.name}</b><span>{currentDefinition.description}</span></div>}
                    {definition.category !== 'consumable' && <button onClick={() => equipItem(owned.id)} disabled={isEquipped}>{isEquipped ? '当前装备 · 生效中' : `换装为${definition.name}`}</button>}
                    {definition.category === 'consumable' && <button disabled={!canCleanse} title={canCleanse ? '使用后解除迷雾侵扰' : '当前没有可净化的减益，不会消耗'} onClick={() => handleUseItem(owned.id, definition.id)}>{canCleanse ? '使用' : '暂无减益'}</button>}
                  </div>
                </article>;
              })}
            </div>
          </aside>
        </div>
      )}
      {activeEvent && <EventModal config={activeConfig} event={activeEvent} question={currentQuestion} sealsSolved={current.sealsSolved} onResolve={handleResolve} onChooseRoute={handleChooseRoute} onClose={handleCloseEvent} onFinish={finishExploration} clueTarget={clueTarget} clueTopic={clueTopic} />}
    </main>
  );
}
