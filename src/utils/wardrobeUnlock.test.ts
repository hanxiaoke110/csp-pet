import { beforeEach, describe, expect, it } from 'vitest';
import { WARDROBE_BY_ID } from '../data/wardrobe';
import { collectWardrobeMetrics, evaluateWardrobeCondition, isWardrobeConditionMet } from './wardrobeUnlock';

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

  it('unlocks migrated wardrobe rewards through their new achievement', () => {
    const frame = WARDROBE_BY_ID.get('frame-scholar')!;
    store.set('csp_achievement_unlocked', JSON.stringify(['quiz-total-100']));
    expect(isWardrobeConditionMet(frame, 0)).toBe(true);
  });

  it('grandfathers the original course achievement after course retirement', () => {
    const frame = WARDROBE_BY_ID.get('frame-scholar')!;
    store.set('csp_achievement_claimed', JSON.stringify(['course-30']));
    expect(isWardrobeConditionMet(frame, 0)).toBe(true);
  });

  it('collects cumulative metrics without requiring daily activity', () => {
    store.set('csp_quiz_state', JSON.stringify({ totalCorrect: 326 }));
    store.set('csp_pet_data', JSON.stringify({ ownedPets: [{ affection: 72 }, { affection: 100 }] }));
    store.set('csp_dungeon_exploration_v1', JSON.stringify({ maps: {
      a: { mapId: 'season-2:dungeon-01:stage-01', completed: true },
      b: { mapId: 'season-2:dungeon-02:stage-01', completed: true },
      c: { mapId: 'season-2:dungeon-02:stage-02', completed: false },
    } }));
    store.set('csp_achievement_unlocked', JSON.stringify(['a', 'b']));
    store.set('csp_achievement_claimed', JSON.stringify(['b', 'c']));
    expect(collectWardrobeMetrics(5)).toEqual({
      quizCorrect: 326,
      highestPetAffection: 100,
      collectorCardCount: 5,
      mazeClearCount: 2,
      dungeonMazeCoverage: 2,
      achievementCount: 3,
    });
  });

  it('evaluates nested whitelisted metric conditions', () => {
    const metrics = collectWardrobeMetrics(5);
    expect(evaluateWardrobeCondition({
      type: 'all', rules: [
        { type: 'metric', metric: 'collectorCardCount', operator: 'gte', value: 5 },
        { type: 'metric', metric: 'achievementCount', operator: 'eq', value: 0 },
      ],
    }, metrics)).toBe(true);
  });
});
