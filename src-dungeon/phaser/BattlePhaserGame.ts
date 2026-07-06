import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import type { BattleInitData, SkillSelectResult } from './types';

export type BattleEventCallback = (event: string, data: unknown) => void;

export interface BattlePhaserGame {
  game: Phaser.Game;
  setAnswerResult: (result: SkillSelectResult) => void;
  destroy: () => void;
}

/**
 * 创建智子试炼场 Phaser 战斗实例。
 * React 负责外部容器、题目面板、后端同步；Phaser 负责战斗画面与动画。
 */
export function createBattleGame(
  container: HTMLElement,
  initData: BattleInitData,
  onEvent: BattleEventCallback
): BattlePhaserGame {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 960,
    height: 540,
    parent: container,
    transparent: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [], // 动态添加场景
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    audio: { disableWebAudio: true }, // 暂不启用音频，减少体积
  };

  const game = new Phaser.Game(config);

  // 游戏就绪后动态添加场景并注入数据
  game.events.on('ready', () => {
    const scene = game.scene.add('BattleScene', BattleScene, false) as BattleScene;
    scene.initBattle(initData, onEvent);
  });

  return {
    game,
    setAnswerResult: (result: SkillSelectResult) => {
      const scene = game.scene.getScene('BattleScene') as BattleScene | undefined;
      if (scene) {
        scene.handleAnswerResult(result);
      }
    },
    destroy: () => {
      game.destroy(true);
    },
  };
}
