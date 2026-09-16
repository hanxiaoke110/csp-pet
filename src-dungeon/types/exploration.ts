export type ExplorationEventType = 'seal' | 'clue' | 'route' | 'treasure' | 'equipment' | 'merchant' | 'trap' | 'exit';
export type EquipmentRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ExplorationRegionId = 1 | 2 | 3;
export type ExplorationRouteChoice = 'safe' | 'challenge';

export interface GridPoint {
  x: number;
  y: number;
}

export interface ExplorationEvent {
  id: string;
  type: ExplorationEventType;
  position: GridPoint;
  questionIndex?: number;
  regionId?: ExplorationRegionId;
}

export interface ExplorationMapDefinition {
  id: string;
  width: number;
  height: number;
  tiles: number[][];
  regions: number[][];
  start: GridPoint;
  exit: GridPoint;
  events: ExplorationEvent[];
}

export interface ExplorationProgress {
  schemaVersion: 1;
  mapId: string;
  position: GridPoint;
  revealed: string[];
  resolvedEventIds: string[];
  questionIds: string[];
  sealsSolved: number;
  sealsWrong: number;
  steps: number;
  pendingCoins: number;
  pendingExp: number;
  activeDebuffs: string[];
  previewedEventIds: string[];
  dismissedEventId?: string;
  routeChoice?: ExplorationRouteChoice;
  completed: boolean;
  settled: boolean;
  settledCoins?: number;
  settledExp?: number;
  startedAt: number;
}

export interface TrialEquipmentDefinition {
  id: string;
  name: string;
  category: 'weapon' | 'armor' | 'artifact' | 'consumable';
  rarity: EquipmentRarity;
  element?: 'earth' | 'fire' | 'wind' | 'water' | 'light';
  icon: string;
  description: string;
  scope: string;
}

export interface OwnedTrialItem {
  id: string;
  definitionId: string;
  acquiredAt: number;
  quantity: number;
}
