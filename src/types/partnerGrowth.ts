import type { PetTier } from './pet';

export interface AscensionReceipt {
  from: PetTier;
  to: PetTier;
  coins: number;
  sand: number;
  at: string;
}

export interface PartnerGrowthSnapshot {
  schemaVersion: 1;
  migrated: true;
  starSand: number;
  firstCorrectIds: string[];
  claimedMapIds: string[];
  savedAt: string;
}
