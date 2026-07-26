import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import type { BattleInitData, SkillSelectResult } from './types';

export type BattleEventCallback = (event: string, data: unknown) => void;

export interface BattlePhaserGame {
  game: Phaser.Game;
  setAnswerResult: (result: SkillSelectResult) => void;
  healPlayer: (amount: number) => void;
  pause: () => void;
  resume: () => void;
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
    type: Phaser.CANVAS, // 强制 Canvas: Tauri WebView 中 WebGL 易崩溃
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

  // 游戏就绪后动态添加场景并启动（传初始数据给 init），走 Phaser 标准 init→preload→create 生命周期
  // 注意：重新进入战斗时 DOM 已 ready，Phaser 可能同步 boot，ready 事件在监听前已触发 → 用 isBooted 兜底
  const startScene = () => {
    game.scene.add('BattleScene', BattleScene, false);
    game.scene.start('BattleScene', { initData, onEvent });
  };
  if (game.isBooted) {
    startScene();
  } else {
    game.events.once('ready', startScene);
  }

  return {
    game,
    setAnswerResult: (result: SkillSelectResult) => {
      const scene = game.scene.getScene('BattleScene') as BattleScene | undefined;
      if (scene) {
        scene.handleAnswerResult(result);
      }
    },
    healPlayer: (amount: number) => {
      const scene = game.scene.getScene('BattleScene') as BattleScene | undefined;
      if (scene) scene.healPlayer(amount);
    },
    pause: () => {
      // 真暂停：冻结 BattleScene 的 update 循环，避免暂停遮罩下战斗仍推进
      if (game.scene.isActive('BattleScene')) game.scene.pause('BattleScene');
    },
    resume: () => {
      if (game.scene.isPaused('BattleScene')) game.scene.resume('BattleScene');
    },
    destroy: () => {
      game.destroy(true);
    },
  };
}
