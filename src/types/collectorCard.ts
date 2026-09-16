export type CollectorCardRarity = 'legendary';

export interface CollectorCardAssets {
  thumbnail: string;
  background: string;
  subject?: string;
  text?: string;
}

export interface CollectorCardDefinition {
  id: string;
  version: number;
  number: string;
  name: string;
  title: string;
  element: 'fire' | 'water' | 'wind' | 'earth' | 'light';
  rarity: CollectorCardRarity;
  price: number;
  description: string;
  quote: string;
  featured?: boolean;
  assets: CollectorCardAssets;
  assetBytes?: number;
  checksums?: Partial<Record<keyof CollectorCardAssets, string>>;
}

export interface CollectorCardCatalog {
  version: number;
  updatedAt: string;
  cards: CollectorCardDefinition[];
}

export interface ResolvedCollectorCardAssets extends CollectorCardAssets {
  source: 'bundled' | 'remote' | 'cache';
}
