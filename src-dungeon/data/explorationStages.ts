import dungeons from './dungeons.json';
import { TRIAL_EQUIPMENT } from './explorationItems';

export interface ExplorationStageRewards {
  sealCorrectExp: number;
  sealWrongExp: number;
  clueExp: number;
  safeRouteCoins: number;
  challengeRouteCoins: number;
  treasureCoins: number;
  treasureExp: number;
  clearCoins: number;
  clearExp: number;
}

export interface ExplorationStageConfig {
  dungeonId: string;
  stageId: string;
  mapId: string;
  dungeonName: string;
  stageName: string;
  title: string;
  description: string;
  regionNames: readonly [string, string, string];
  width: number;
  height: number;
  equipmentId: string;
  rewards: ExplorationStageRewards;
}

const CHAPTERS = [
  { title: '玄武水庭', regions: ['水庭外环', '机关回廊', '玄武灵台'], drops: ['xuanwu-hammer-common', 'xuanwu-armor-common', 'compass-common', 'xuanwu-hammer-rare', 'xuanwu-armor-rare'] },
  { title: '数术机关殿', regions: ['进位回廊', '编码熔炉', '金乌算台'], drops: ['jade-spear-common', 'compass-rare', 'xuanwu-hammer-rare', 'jade-spear-rare', 'xuanwu-armor-rare'] },
  { title: '灵码晶洞', regions: ['变量石径', '循环回廊', '夔牛雷坛'], drops: ['jade-spear-rare', 'xuanwu-hammer-epic', 'compass-epic', 'xuanwu-armor-epic', 'jade-spear-epic'] },
  { title: '万木根域', regions: ['线性林径', '树图深谷', '九尾幻森'], drops: ['xuanwu-armor-common', 'jade-spear-rare', 'compass-epic', 'xuanwu-armor-epic', 'jade-spear-epic'] },
  { title: '算法天阶', regions: ['排序石阶', '递归云廊', '应龙塔顶'], drops: ['jade-spear-rare', 'xuanwu-hammer-epic', 'compass-epic', 'jade-spear-epic', 'xuanwu-hammer-legendary'] },
  { title: '天算星台', regions: ['排列星门', '数论天盘', '獬豸裁台'], drops: ['compass-rare', 'jade-spear-epic', 'xuanwu-armor-epic', 'compass-legendary', 'jade-spear-legendary'] },
  { title: '真题古战场', regions: ['残卷前阵', '年份碑林', '青鸟战台'], drops: ['xuanwu-hammer-epic', 'jade-spear-epic', 'xuanwu-armor-legendary', 'compass-legendary', 'xuanwu-hammer-legendary'] },
  { title: '五行龙魂境', regions: ['五行外环', '龙脉核心', '应龙圣域'], drops: ['xuanwu-armor-epic', 'compass-legendary', 'xuanwu-hammer-legendary', 'jade-spear-legendary', 'xuanwu-armor-legendary'] },
] as const;

function stageSize(stageIndex: number): { width: number; height: number } {
  if (stageIndex < 2) return { width: 15, height: 11 };
  if (stageIndex < 4) return { width: 17, height: 11 };
  return { width: 17, height: 13 };
}

export const EXPLORATION_STAGE_CONFIGS: ExplorationStageConfig[] = dungeons.flatMap((dungeon, dungeonIndex) => {
  const chapter = CHAPTERS[dungeonIndex];
  return dungeon.stages.map((stage, stageIndex) => {
    const depth = dungeonIndex * 5 + stageIndex;
    const size = stageSize(stageIndex);
    return {
      dungeonId: dungeon.id,
      stageId: stage.id,
      mapId: dungeonIndex === 0 && stageIndex === 0
        ? 'season-2:dungeon-01:stage-01'
        : `season-2:${dungeon.id}:${stage.id}`,
      dungeonName: dungeon.name,
      stageName: stage.name,
      title: `${stage.name}·${chapter.title}`,
      description: `穿过${chapter.regions.join('、')}，完成三道与“${stage.description}”相关的知识封印。`,
      regionNames: chapter.regions,
      width: size.width,
      height: size.height,
      equipmentId: chapter.drops[stageIndex],
      rewards: {
        sealCorrectExp: 4 + Math.floor(depth / 12),
        sealWrongExp: 2,
        clueExp: 3,
        safeRouteCoins: 3 + Math.floor(depth / 16),
        challengeRouteCoins: 8 + Math.floor(depth / 10),
        treasureCoins: 12 + Math.floor(depth / 8),
        treasureExp: 6 + Math.floor(depth / 10),
        clearCoins: 5 + Math.floor(depth / 12),
        clearExp: 8 + Math.floor(depth / 8),
      },
    } satisfies ExplorationStageConfig;
  });
});

export function getExplorationStageConfig(dungeonId?: string, stageId?: string): ExplorationStageConfig | undefined {
  return EXPLORATION_STAGE_CONFIGS.find(config => config.dungeonId === dungeonId && config.stageId === stageId);
}

export function getDungeonExplorationConfigs(dungeonId: string): ExplorationStageConfig[] {
  return EXPLORATION_STAGE_CONFIGS.filter(config => config.dungeonId === dungeonId);
}

export function getExplorationEquipment(config: ExplorationStageConfig) {
  return TRIAL_EQUIPMENT[config.equipmentId];
}
