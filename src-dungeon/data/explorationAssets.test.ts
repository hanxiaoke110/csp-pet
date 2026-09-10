import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRIAL_EQUIPMENT } from './explorationItems';
import { EXPLORATION_STAGE_CONFIGS } from './explorationStages';
import { EXPLORATION_THEMES } from './explorationThemes';
import { DUNGEON_QUESTION_PLANS } from './question-plans';

describe('迷雾探索本地素材', () => {
  it('装备目录中的图片全部随安装包提供', () => {
    const definitions = Object.values(TRIAL_EQUIPMENT);
    expect(definitions.length).toBeGreaterThanOrEqual(18);

    for (const definition of definitions) {
      expect(definition.icon).toMatch(/^\/dungeon-exploration\/.+\.webp$/);
      expect(existsSync(resolve(process.cwd(), 'public', definition.icon.slice(1))), definition.id).toBe(true);
    }
  });

  it('三区域探索事件素材全部随安装包提供', () => {
    for (const filename of ['heavenly-slip.webp', 'route-fork.webp']) {
      expect(existsSync(resolve(process.cwd(), 'public/dungeon-exploration/items', filename)), filename).toBe(true);
    }
  });

  it('八个副本都有可复用的本地迷宫环境底图', () => {
    expect(Object.keys(EXPLORATION_THEMES)).toHaveLength(8);
    for (const theme of Object.values(EXPLORATION_THEMES)) {
      expect(theme.surface).toMatch(/^\/dungeon-exploration\/themes\/.+\.webp$/);
      expect(existsSync(resolve(process.cwd(), 'public', theme.surface.slice(1))), theme.dungeonId).toBe(true);
    }
  });

  it('40 个普通关卡均有主题、装备与唯一存档标识', () => {
    expect(EXPLORATION_STAGE_CONFIGS).toHaveLength(40);
    expect(new Set(EXPLORATION_STAGE_CONFIGS.map(config => config.mapId)).size).toBe(40);
    for (const config of EXPLORATION_STAGE_CONFIGS) {
      expect(EXPLORATION_THEMES[config.dungeonId], config.mapId).toBeTruthy();
      expect(TRIAL_EQUIPMENT[config.equipmentId], config.mapId).toBeTruthy();
    }
  });

  it('40 个迷宫均有对应的关卡题目计划', () => {
    expect(DUNGEON_QUESTION_PLANS).toHaveLength(40);
    const planIds = new Set(DUNGEON_QUESTION_PLANS.map(plan => `${plan.dungeonId}:${plan.stageId}`));
    for (const config of EXPLORATION_STAGE_CONFIGS) {
      expect(planIds.has(`${config.dungeonId}:${config.stageId}`), config.mapId).toBe(true);
    }
  });

  it('奖励按第 1 至 40 关平滑递增', () => {
    const totals = EXPLORATION_STAGE_CONFIGS.map(config =>
      config.rewards.safeRouteCoins + config.rewards.treasureCoins + config.rewards.clearCoins
    );
    expect(totals.at(-1)).toBeGreaterThan(totals[0]);
    for (let index = 1; index < totals.length; index += 1) {
      expect(totals[index], EXPLORATION_STAGE_CONFIGS[index].mapId).toBeGreaterThanOrEqual(totals[index - 1]);
    }
  });

  it('武器、护甲和法器均包含四个清晰的稀有度等级', () => {
    for (const category of ['weapon', 'armor', 'artifact'] as const) {
      const rarities = new Set(
        Object.values(TRIAL_EQUIPMENT)
          .filter(item => item.category === category)
          .map(item => item.rarity),
      );
      expect(rarities).toEqual(new Set(['common', 'rare', 'epic', 'legendary']));
    }
  });
});
