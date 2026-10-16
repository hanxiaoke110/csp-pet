import { describe, expect, it } from 'vitest';
import { resolvePartnerQuality, ascensionOffer, partnerTrialStats } from './partnerQuality';
import type { OwnedPet } from '../types/pet';

const pet = { speciesId: 'workshop-test', tier: 'rare', level: 10, affection: 80 } as OwnedPet;
describe('per companion ascension', () => {
  it('preserves workshop and instance quality, without changing another instance', () => {
    expect(resolvePartnerQuality(pet)).toBe('rare');
    expect(resolvePartnerQuality({ ...pet, quality: 'legendary' })).toBe('legendary');
    expect(resolvePartnerQuality(pet)).toBe('rare');
    expect(ascensionOffer('common')).toEqual({ target: 'rare', coins: 100, sand: 2, level: 5, affection: 60 });
    expect(ascensionOffer('rare')).toEqual({ target: 'legendary', coins: 240, sand: 5, level: 10, affection: 80 });
    expect(ascensionOffer('legendary')).toBeNull();
  });
  it('gives native and ascended quality the same once-only bonus and preserves speed', () => {
    const common = partnerTrialStats({ ...pet, tier: 'common' }, 5);
    const rare = partnerTrialStats(pet, 5);
    expect(partnerTrialStats({ ...pet, tier: 'common', quality: 'rare' }, 5)).toEqual(rare);
    expect(rare.maxHp).toBe(Math.floor(common.maxHp * 1.03));
    expect(rare.speed).toBe(common.speed);
  });
});
