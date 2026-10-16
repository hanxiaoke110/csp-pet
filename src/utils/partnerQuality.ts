import { getPetTier, PET_BASE_STATS, TIER_MULTIPLIERS, type OwnedPet, type PetTier } from '../types/pet';
import { calculateTrialPlayerStats } from '../../src-dungeon/utils/combatLogic';

export const QUALITY_LABELS: Record<PetTier, string> = { common: '普通', rare: '稀有', legendary: '传说' };
export function isPartnerQuality(value: unknown): value is PetTier {
  return value === 'common' || value === 'rare' || value === 'legendary';
}
export function resolvePartnerQuality(pet: Pick<OwnedPet, 'speciesId' | 'tier' | 'quality'>): PetTier {
  const native = isPartnerQuality(pet.tier) ? pet.tier : getPetTier(pet.speciesId);
  // A damaged or old instance field must never downgrade a valid native tier.
  const rank = { common: 0, rare: 1, legendary: 2 };
  return isPartnerQuality(pet.quality) && rank[pet.quality] > rank[native] ? pet.quality : native;
}
export function ascensionOffer(quality: PetTier): { target: PetTier; coins: number; sand: number; level: number; affection: number } | null {
  if (quality === 'common') return { target: 'rare', coins: 100, sand: 2, level: 5, affection: 60 };
  if (quality === 'rare') return { target: 'legendary', coins: 240, sand: 5, level: 10, affection: 80 };
  return null;
}
/** Shared by the trial adapter and the ascension preview. */
export function partnerTrialStats(pet: Pick<OwnedPet, 'speciesId' | 'tier' | 'quality' | 'level'>, dungeonLevel: number) {
  const combatTier = dungeonLevel >= 5 ? 'legendary' : dungeonLevel >= 3 ? 'rare' : 'common';
  return calculateTrialPlayerStats(PET_BASE_STATS[pet.speciesId] || PET_BASE_STATS.default,
    TIER_MULTIPLIERS[combatTier], dungeonLevel, pet.level || 1, resolvePartnerQuality(pet));
}
export function ascensionRefund(pet: Pick<OwnedPet, 'ascensionHistory'>): number {
  const history = pet.ascensionHistory;
  if (!Array.isArray(history) || history.length > 2) return 0;
  let total = 0;
  let previous: PetTier | undefined;
  for (const receipt of history) {
    const offer = isPartnerQuality(receipt.from) ? ascensionOffer(receipt.from) : null;
    if (!offer || (previous && receipt.from !== previous) || receipt.to !== offer.target || receipt.coins !== offer.coins || receipt.sand !== offer.sand
      || typeof receipt.at !== 'string' || !Number.isFinite(Date.parse(receipt.at))) return 0;
    total += receipt.coins;
    previous = receipt.to;
  }
  return Math.floor(total * 0.8);
}
