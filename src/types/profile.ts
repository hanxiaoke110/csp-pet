export type WardrobeCategory = 'avatar' | 'frame' | 'background' | 'pendant' | 'effect' | 'title';
export type WardrobeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type WardrobeMetric =
  | 'quizCorrect'
  | 'highestPetAffection'
  | 'collectorCardCount'
  | 'mazeClearCount'
  | 'dungeonMazeCoverage'
  | 'achievementCount';

export type WardrobeConditionExpression =
  | { type: 'metric'; metric: WardrobeMetric; operator: 'gte' | 'eq'; value: number }
  | { type: 'all'; rules: WardrobeConditionExpression[] }
  | { type: 'any'; rules: WardrobeConditionExpression[] };

export type WardrobeAcquisition =
  | { type: 'free' }
  | { type: 'coin'; price: number }
  | {
      type: 'condition';
      description: string;
      achievementId?: string;
      legacyAchievementIds?: string[];
      rule?: 'two-cards' | 'dungeon-crystal';
      condition?: WardrobeConditionExpression;
    };

export type WardrobeVisualPrimitive =
  | 'image'
  | 'particle'
  | 'orbit'
  | 'light-sweep'
  | 'glow'
  | 'sprite'
  | 'text-effect'
  | 'pointer-parallax'
  | 'click-burst';

export type WardrobeAnimationPreset =
  | 'none'
  | 'float'
  | 'spin'
  | 'orbit'
  | 'pulse'
  | 'drift-up'
  | 'drift-down'
  | 'sweep'
  | 'flicker'
  | 'glitch'
  | 'burst';

export interface WardrobeVisualLayer {
  id: string;
  primitive: WardrobeVisualPrimitive;
  placement: 'background' | 'behind-avatar' | 'front' | 'title';
  asset?: string;
  assetBytes?: number;
  checksum?: string;
  thumbnail?: string;
  animation?: WardrobeAnimationPreset;
  color?: string;
  secondaryColor?: string;
  blendMode?: 'normal' | 'screen' | 'color-dodge' | 'soft-light';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  opacity?: number;
  rotation?: number;
  durationMs?: number;
  delayMs?: number;
  count?: number;
  size?: number;
  blur?: number;
  parallax?: number;
  avoidSafeZone?: boolean;
}

export interface WardrobeVisualSpec {
  rendererVersion: 2;
  safeZone?: { x: number; y: number; width: number; height: number };
  layers: WardrobeVisualLayer[];
  titleEffect?: 'gold-sweep' | 'rift-glitch' | 'lucky-stars';
}

export interface WardrobeItem {
  id: string;
  version: number;
  category: WardrobeCategory;
  name: string;
  rarity: WardrobeRarity;
  acquisition: WardrobeAcquisition;
  asset?: string;
  thumbnail?: string;
  assetBytes?: number;
  checksum?: string;
  preview?: string;
  group?: 'zodiac' | 'constellation' | 'general';
  interaction?: WardrobeInteraction;
  visual?: WardrobeVisualSpec;
  minRendererVersion?: number;
  available?: boolean;
}

export interface WardrobeInteraction {
  type: 'direction-grid';
  atlas: string;
  columns: 5;
  rows: 5;
  atlasBytes?: number;
  atlasChecksum?: string;
  clickReaction?: 'squash-bounce';
}

export interface WardrobeCatalog {
  version: number;
  updatedAt: string;
  items: WardrobeItem[];
  schemaVersion?: 1 | 2;
  rendererVersion?: number;
}

export interface ResolvedWardrobeAsset {
  url: string;
  source: 'bundled' | 'remote' | 'cache' | 'none';
}

export interface ProfileSnapshot {
  version: 1;
  savedAt: string;
  initialized: boolean;
  nickname: string;
  nicknameChanges: number;
  ownedItemIds: string[];
  equipped: Record<WardrobeCategory, string | null>;
  journal: Record<string, string>;
}
