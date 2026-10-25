import { describe, expect, it, vi } from 'vitest';
import type { BattleInitData, PhaserSkillCard, SkillSelectResult } from '../types';
import type { BurnStack, EnemyIntent } from '../../types/dungeon';

vi.mock('phaser', () => ({ default: {
  Scene: class {},
  GameObjects: { Container: class {}, Graphics: class {} },
} }));
vi.mock('../effects/ElementAttackEffect', () => ({ playElementAttack: vi.fn() }));

import { BattleScene } from './BattleScene';
import { playElementAttack } from '../effects/ElementAttackEffect';

const pet = {
  petId: 'test', displayName: 'test', speciesId: 'test', element: 'fire' as const,
  level: 10, maxHp: 821, currentHp: 821, attack: 30, defense: 10, speed: 10,
  isPlayer: true, previewUrl: '', textureKey: 'test',
};
const initData: BattleInitData = {
  dungeonId: 'test', stageId: 'test', isBoss: false, playerPet: pet,
  enemyPet: { ...pet, maxHp: 396, currentHp: 396, isPlayer: false },
  initialEnergy: 3, maxEnergy: 5, dungeonColor: '#fff', dungeonName: 'test',
};

interface Runtime {
  state: {
    enemyHp: number; playerHp: number; round: number; energy: number;
    burnStacks: BurnStack[]; enemyIntent: EnemyIntent | null;
    skillUsages: PhaserSkillCard[];
  };
  pendingSkillId: string | null;
  startPlayerTurn(): void;
  finishPlayerTurn(): void;
  startEnemyTurn(): void;
  executeEnemyTurn(): void;
  playSkillEffect(skill: PhaserSkillCard['skill'], onImpact: () => void): void;
  endBattle(isWon: boolean): void;
}

function setup(enemyHp = 3) {
  const scene = new BattleScene();
  const onEvent = vi.fn();
  scene.init({ initData, onEvent });
  const runtime = scene as unknown as Runtime;
  const tasks: (() => void)[] = [];
  const sprite = () => ({ x: 200, y: 200, playDefeatAnimation: vi.fn(),
    playCelebrateAnimation: vi.fn(), playHitAnimation: vi.fn(), playAttackAnimation: vi.fn() });
  const ui = {
    enemyPet: sprite(), playerPet: sprite(),
    enemyHpBar: { updateHp: vi.fn() }, playerHpBar: { updateHp: vi.fn() },
    roundText: { setText: vi.fn() },
    cardHand: { updateCardStates: vi.fn() },
    turnIndicator: { setTurn: vi.fn() },
    intentBubble: { showIntent: vi.fn(), hide: vi.fn() },
    showDamageText: vi.fn(),
    time: { delayedCall: vi.fn((_delay: number, callback: () => void) => { tasks.push(callback); }) },
  };
  Object.assign(scene, ui);
  runtime.state.enemyHp = enemyHp;
  runtime.state.round = 4;
  runtime.state.burnStacks = [{ damage: 3, turnsRemaining: 2, sourceSkillId: 'skill-2' }];
  const flush = () => {
    // Bound the drain so a regression cannot create an endless turn loop.
    for (let i = 0; tasks.length && i < 20; i++) tasks.shift()!();
    expect(tasks).toHaveLength(0);
  };
  return { scene, runtime, ui, onEvent, tasks, flush };
}

describe('BattleScene burn victory', () => {
  it('settles a lethal burn before enabling skills or generating the next enemy intent', () => {
    const { runtime, ui, onEvent, flush } = setup();
    runtime.startPlayerTurn();
    expect(runtime.state.enemyHp).toBe(0);
    expect(ui.enemyHpBar.updateHp).toHaveBeenCalledWith(0);
    expect(ui.enemyPet.playDefeatAnimation).toHaveBeenCalledOnce();
    expect(ui.cardHand.updateCardStates).not.toHaveBeenCalledWith(expect.anything(), true);
    expect(ui.intentBubble.showIntent).not.toHaveBeenCalled();
    expect(ui.intentBubble.hide).toHaveBeenCalled();
    flush();
    expect(onEvent).toHaveBeenCalledExactlyOnceWith('battleEnd', expect.objectContaining({
      isWon: true, enemyHp: 0, playerHp: 821, roundCount: 5, usedSkillIds: [],
    }));
  });

  it('preserves a nonlethal burn and allows normal skill selection', () => {
    const { scene, runtime, ui, onEvent, tasks } = setup(4);
    runtime.startPlayerTurn();
    expect(runtime.state.enemyHp).toBe(1);
    expect(runtime.state.burnStacks[0].turnsRemaining).toBe(1);
    expect(ui.cardHand.updateCardStates).toHaveBeenCalledWith(3, true);
    expect(ui.intentBubble.showIntent).toHaveBeenCalledOnce();
    expect(tasks).toHaveLength(0);
    scene.retrySkill('skill-1');
    expect(onEvent).toHaveBeenCalledExactlyOnceWith('skillSelected', { skillId: 'skill-1' });
  });

  it('settles stacked overkill burns once and ignores late turns, answers and cancellation', () => {
    const { scene, runtime, ui, onEvent, flush } = setup(5);
    runtime.state.burnStacks.push({ damage: 4, turnsRemaining: 1, sourceSkillId: 'skill-2' });
    runtime.startPlayerTurn();
    const finalState = structuredClone(runtime.state);
    runtime.startPlayerTurn();
    runtime.finishPlayerTurn();
    runtime.startEnemyTurn();
    runtime.executeEnemyTurn();
    expect(runtime.state).toEqual(finalState);
    scene.retrySkill('skill-1');
    // Simulate a question result already queued before settlement.
    runtime.pendingSkillId = 'skill-1';
    scene.handleAnswerResult({ skillId: 'skill-1', isCorrect: true } satisfies SkillSelectResult);
    scene.cancelPendingSkill();
    runtime.endBattle(false);
    expect(runtime.state).toEqual(finalState);
    expect(ui.cardHand.updateCardStates).not.toHaveBeenCalledWith(expect.anything(), true);
    flush();
    expect(onEvent).toHaveBeenCalledExactlyOnceWith('battleEnd', expect.objectContaining({ isWon: true }));
  });

  it('ignores an enemy attack impact that arrives after settlement', () => {
    const { runtime, ui, onEvent, flush } = setup(30);
    runtime.state.enemyIntent = { type: 'attack', power: 100 };
    runtime.executeEnemyTurn();
    const calls = vi.mocked(playElementAttack).mock.calls;
    const impact = calls[calls.length - 1][4];
    runtime.endBattle(true);
    impact();
    expect(runtime.state.playerHp).toBe(821);
    expect(ui.playerHpBar.updateHp).not.toHaveBeenCalled();
    flush();
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('ignores a player skill impact that arrives after settlement', () => {
    const { runtime, onEvent, flush } = setup();
    const applySkill = vi.fn();
    runtime.playSkillEffect(runtime.state.skillUsages[0].skill, applySkill);
    const calls = vi.mocked(playElementAttack).mock.calls;
    const impact = calls[calls.length - 1][4];
    runtime.endBattle(true);
    impact();
    expect(applySkill).not.toHaveBeenCalled();
    flush();
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('does not resume a queued enemy turn after settlement', () => {
    const { runtime, ui, onEvent, flush } = setup(30);
    runtime.finishPlayerTurn();
    runtime.state.enemyHp = 0;
    runtime.endBattle(true);
    flush();
    expect(ui.turnIndicator.setTurn).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledExactlyOnceWith('battleEnd', expect.objectContaining({ isWon: true }));
  });

  it.each([true, false])('preserves ordinary battle settlement (victory: %s)', isWon => {
    const { runtime, ui, onEvent, flush } = setup();
    if (isWon) {
      runtime.state.enemyHp = 0;
      runtime.finishPlayerTurn();
      expect(ui.enemyPet.playDefeatAnimation).toHaveBeenCalledOnce();
    } else {
      runtime.state.playerHp = 0;
      runtime.endBattle(false);
      expect(ui.playerPet.playDefeatAnimation).toHaveBeenCalledOnce();
    }
    flush();
    expect(onEvent).toHaveBeenCalledExactlyOnceWith('battleEnd', expect.objectContaining({ isWon }));
  });

  it('allows a new battle after reinitialization', () => {
    const { scene, runtime, ui, onEvent, flush } = setup();
    runtime.startPlayerTurn();
    flush();
    scene.init({ initData, onEvent });
    ui.cardHand.updateCardStates.mockClear();
    runtime.startPlayerTurn();
    expect(runtime.state.round).toBe(1);
    expect(ui.cardHand.updateCardStates).toHaveBeenCalledWith(3, true);
  });
});
