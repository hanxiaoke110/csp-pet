export type WardrobeCategory = 'avatar' | 'frame' | 'background' | 'pendant' | 'effect' | 'title';
export type WardrobeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type WardrobeAcquisition =
  | { type: 'free' }
  | { type: 'coin'; price: number }
  | { type: 'condition'; description: string; achievementId?: string; legacyAchievementIds?: string[]; rule?: 'two-cards' | 'dungeon-crystal' };

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
