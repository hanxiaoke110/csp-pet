import { beforeEach, describe, expect, it } from 'vitest';
import { WARDROBE_BY_ID } from '../data/wardrobe';
import { isWardrobeConditionMet } from './wardrobeUnlock';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
});

describe('wardrobe unlock conditions', () => {
  it('reads the crystal frame from the standalone trial inventory save', () => {
    const frame = WARDROBE_BY_ID.get('frame-crystal-trial')!;
    store.set('dungeon_trial_inventory', JSON.stringify({ ownedCosmetics: ['frame-crystal'] }));
    expect(isWardrobeConditionMet(frame, 0)).toBe(true);
  });

  it('does not treat the legacy dungeon player object as the trial inventory', () => {
    const frame = WARDROBE_BY_ID.get('frame-crystal-trial')!;
    store.set('dungeon_player', JSON.stringify({ trialInventory: { ownedCosmetics: ['frame-crystal'] } }));
    expect(isWardrobeConditionMet(frame, 0)).toBe(false);
  });
});
