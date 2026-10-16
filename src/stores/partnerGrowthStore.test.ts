import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePartnerGrowthStore, validateGrowthSnapshot } from './partnerGrowthStore';
import { PARTNER_JOURNAL_KEY, recoverPartnerTransaction } from '../lib/partnerTransactions';
import { usePetStore } from './petStore';
import { useQuizStore } from './quizStore';
import type { OwnedPet } from '../types/pet';
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/sqlite-storage', () => ({ sqliteGet: vi.fn().mockResolvedValue(''), sqliteSetFireAndForget: vi.fn() }));
const pet = { petId: 'one', speciesId: 'capi', petName: '卡皮', level: 10, exp: 0, expToNext: 100, affection: 80, tier: 'common', acquisitionCost: 0 } as OwnedPet;
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } });
  usePartnerGrowthStore.setState({ loaded: false, snapshot: null, error: '' });
  usePetStore.setState({ loaded: true, ownedPets: [pet, { ...pet, petId: 'two' }], activePetId: 'one', coins: 600, recycledPets: [], expPool: 0 });
  localStorage.setItem('csp_pet_data', JSON.stringify({ ownedPets: [pet, { ...pet, petId: 'two' }], activePetId: 'one', coins: 600 }));
});
describe('star sand and ascension', () => {
  it('deduplicates legacy choice IDs and canonical bank IDs', async () => {
    await usePartnerGrowthStore.getState().recordCorrect('csp-J-2023-008');
    await usePartnerGrowthStore.getState().recordCorrect('csp-j-2023-c08');
    expect(usePartnerGrowthStore.getState().snapshot?.firstCorrectIds).toEqual(['csp-j-2023-c08']);
  });
  it('credits actual quiz answer submissions and ignores wrong answers', async () => {
    await usePartnerGrowthStore.getState().load();
    useQuizStore.getState().recordAnswer(false, 'wrong');
    useQuizStore.getState().recordAnswer(true, 'csp-j-2023-008');
    await Promise.resolve();
    expect(usePartnerGrowthStore.getState().snapshot?.firstCorrectIds).toEqual(['csp-j-2023-c08']);
  });
  it('preserves same-balance training and newly acquired pets from another window during ascension', async () => {
    localStorage.setItem('csp_quiz_state', JSON.stringify({ totalCorrect: 140 }));
    await usePartnerGrowthStore.getState().load();
    const trained = { ...pet, level: 12, affection: 95 };
    localStorage.setItem('csp_pet_data', JSON.stringify({ ownedPets: [trained, { ...pet, petId: 'new' }], coins: 600 }));
    expect(usePartnerGrowthStore.getState().ascend('one', 'common').ok).toBe(true);
    const saved = JSON.parse(localStorage.getItem('csp_pet_data')!);
    expect(saved.ownedPets[0]).toMatchObject({ level: 12, affection: 95, quality: 'rare' });
    expect(saved.ownedPets.map((p: OwnedPet) => p.petId)).toEqual(['one', 'new']);
  });
  it('rejects a stale recycled inventory after another window restores a pet without changing coins', () => {
    const record = (id: string) => ({ pet: { ...pet, petId: id }, returnedExp: 10, returnedCoins: 20, recycledAt: '2026-01-01T00:00:00.000Z' });
    const a = record('A'); const b = record('B');
    usePetStore.setState({ recycledPets: [a, b], ownedPets: [pet], coins: 600, expPool: 0 });
    const durable = { ownedPets: [pet, b.pet], recycledPets: [a], coins: 600, expPool: 0 };
    localStorage.setItem('csp_pet_data', JSON.stringify(durable));
    expect(usePetStore.getState().dismantleRecycledPet('A').ok).toBe(false);
    expect(JSON.parse(localStorage.getItem('csp_pet_data')!)).toEqual(durable);
    expect(usePetStore.getState().restoreRecycledPet('A')).toBe(false);
    expect(JSON.parse(localStorage.getItem('csp_pet_data')!)).toEqual(durable);
  });
  it('allows a legacy recycled receipt whose acquisition refund was hydrated from its native source cost', async () => {
    const legacy = { pet: { ...pet, petId: 'legacy', speciesId: 'peach', acquisitionCost: 0 }, returnedExp: 10, returnedCoins: 0, recycledAt: '2026-01-01T00:00:00.000Z' };
    localStorage.setItem('csp_pet_data', JSON.stringify({ ownedPets: [pet], recycledPets: [legacy], coins: 600, expPool: 0, gachaRewardMigrationDone: true }));
    await usePetStore.getState().load();
    expect(usePetStore.getState().recycledPets[0].returnedCoins).toBe(75);
    expect(usePetStore.getState().restoreRecycledPet('legacy')).toBe(true);
  });
  it('freezes the hydrated native acquisition refund when upgrading an old zero-cost shop pet', async () => {
    const legacy = { ...pet, speciesId: 'peach' };
    localStorage.setItem('csp_pet_data', JSON.stringify({ ownedPets: [legacy, { ...pet, petId: 'two' }], coins: 600, gachaRewardMigrationDone: true }));
    localStorage.setItem('csp_quiz_state', JSON.stringify({ totalCorrect: 140 }));
    await usePetStore.getState().load();
    await usePartnerGrowthStore.getState().load();
    expect(usePartnerGrowthStore.getState().ascend('one', 'common').ok).toBe(true);
    expect(usePetStore.getState().ownedPets[0].originalAcquisitionCost).toBe(150);
    usePetStore.getState().recyclePet('one');
    expect(usePetStore.getState().recycledPets[0].returnedCoins).toBe(75);
  });
  it('refreshes a ledger committed by another window before recording', async () => {
    await usePartnerGrowthStore.getState().load();
    const latest = { ...usePartnerGrowthStore.getState().snapshot!, starSand: 8, firstCorrectIds: ['elsewhere'] };
    localStorage.setItem('csp_partner_growth_v1', JSON.stringify(latest));
    await usePartnerGrowthStore.getState().recordCorrect('here');
    expect(usePartnerGrowthStore.getState().snapshot).toMatchObject({ starSand: 8, firstCorrectIds: ['elsewhere', 'here'] });
  });
  it('applies only the small quality bonus to pet battle stats, keeping speed unchanged', () => {
    const before = usePetStore.getState().ensureBattleStats(pet).battle!;
    const after = usePetStore.getState().ensureBattleStats({ ...pet, quality: 'rare' }).battle!;
    expect(after.speed).toBe(before.speed);
    expect(after.maxHp).toBe(Math.floor(before.maxHp * 1.03));
    expect(after.attack).toBe(Math.floor(before.attack * 1.03));
  });
  it('migrates aggregate and v2 maps once without inventing historical IDs', async () => {
    localStorage.setItem('csp_quiz_state', JSON.stringify({ totalCorrect: 41 }));
    localStorage.setItem('csp_dungeon_exploration_v1', JSON.stringify({ schemaVersion: 2, maps: { map1: { schemaVersion: 1, mapId: 'map1', completed: true } } }));
    await usePartnerGrowthStore.getState().load();
    expect(usePartnerGrowthStore.getState().snapshot).toMatchObject({ starSand: 3, firstCorrectIds: [], claimedMapIds: ['map1'] });
    usePartnerGrowthStore.setState({ loaded: false, snapshot: null });
    await usePartnerGrowthStore.getState().load();
    expect(usePartnerGrowthStore.getState().snapshot?.starSand).toBe(3);
  });
  it('counts 20 distinct canonical first corrects across pages and one per maze', async () => {
    for (let i = 0; i < 20; i++) await usePartnerGrowthStore.getState().recordCorrect(`question-${i}`);
    await usePartnerGrowthStore.getState().recordCorrect('question-0');
    await usePartnerGrowthStore.getState().completeMaze('map-1');
    await usePartnerGrowthStore.getState().completeMaze('map-1');
    expect(usePartnerGrowthStore.getState().snapshot?.starSand).toBe(2);
    expect(usePartnerGrowthStore.getState().snapshot?.firstCorrectIds).toHaveLength(20);
  });
  it('upgrades just the expected instance, checks conditions and rejects duplicate click', async () => {
    localStorage.setItem('csp_quiz_state', JSON.stringify({ totalCorrect: 140 }));
    await usePartnerGrowthStore.getState().load();
    expect(usePartnerGrowthStore.getState().ascend('one', 'common').ok).toBe(true);
    expect(usePartnerGrowthStore.getState().ascend('one', 'common').ok).toBe(false);
    expect(usePetStore.getState().coins).toBe(500);
    expect(usePetStore.getState().ownedPets[0]).toMatchObject({ quality: 'rare', originalAcquisitionCost: 0 });
    expect(usePetStore.getState().ownedPets[1].quality).toBeUndefined();
    expect(usePartnerGrowthStore.getState().ascend('one', 'rare').ok).toBe(true);
    expect(usePetStore.getState().coins).toBe(260);
    expect(usePartnerGrowthStore.getState().snapshot?.starSand).toBe(0);
    expect(usePartnerGrowthStore.getState().ascend('one', 'legendary').ok).toBe(false);
  });
  it('rejects malformed and unsafe snapshots', () => {
    expect(validateGrowthSnapshot({ starSand: -1 })).toBe(false);
    expect(validateGrowthSnapshot({ schemaVersion: 1, migrated: true, starSand: Number.MAX_SAFE_INTEGER + 1, firstCorrectIds: [], claimedMapIds: [], savedAt: '' })).toBe(false);
  });
  it.each([
    ['common', 4, 60, 100, 2, false], ['common', 5, 59, 100, 2, false],
    ['common', 5, 60, 99, 2, false], ['common', 5, 60, 100, 1, false], ['common', 5, 60, 100, 2, true],
    ['rare', 9, 80, 240, 5, false], ['rare', 10, 79, 240, 5, false],
    ['rare', 10, 80, 239, 5, false], ['rare', 10, 80, 240, 4, false], ['rare', 10, 80, 240, 5, true],
  ] as const)('checks %s level=%i affection=%i coins=%i sand=%i', async (quality, level, affection, coins, sand, ok) => {
    await usePartnerGrowthStore.getState().load();
    const p = { ...pet, tier: quality, level, affection };
    const snapshot = { ...usePartnerGrowthStore.getState().snapshot!, starSand: sand };
    localStorage.setItem('csp_pet_data', JSON.stringify({ ownedPets: [p], coins }));
    localStorage.setItem('csp_partner_growth_v1', JSON.stringify(snapshot));
    usePetStore.setState({ ownedPets: [p], coins });
    usePartnerGrowthStore.setState({ snapshot });
    expect(usePartnerGrowthStore.getState().ascend(p.petId, quality).ok).toBe(ok);
    if (!ok) expect(usePetStore.getState().coins).toBe(coins);
  });
  it('recycling and restoration do not refund ascent; actual dismantling refunds once', async () => {
    localStorage.setItem('csp_quiz_state', JSON.stringify({ totalCorrect: 140 }));
    await usePartnerGrowthStore.getState().load();
    expect(usePartnerGrowthStore.getState().ascend('one', 'common').ok).toBe(true);
    expect(usePartnerGrowthStore.getState().ascend('one', 'rare').ok).toBe(true);
    expect(usePetStore.getState().recyclePet('one').ok).toBe(true);
    expect(usePetStore.getState().coins).toBe(260);
    expect(usePetStore.getState().restoreRecycledPet('one')).toBe(true);
    expect(usePetStore.getState().coins).toBe(260);
    expect(usePetStore.getState().recyclePet('one').ok).toBe(true);
    expect(usePetStore.getState().dismantleRecycledPet('one')).toMatchObject({ ok: true, coins: 272 });
    expect(usePetStore.getState().dismantleRecycledPet('one').ok).toBe(false);
    expect(usePetStore.getState().coins).toBe(532);
  });
  it('failed ascension writes never publish a quality or spend, and recovery retains materials', async () => {
    localStorage.setItem('csp_quiz_state', JSON.stringify({ totalCorrect: 140 }));
    await usePartnerGrowthStore.getState().load();
    const real = localStorage.setItem.bind(localStorage);
    let full = false;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'csp_partner_growth_v1') full = true;
      if (full) throw new Error('disk unavailable');
      real(key, value);
    });
    expect(usePartnerGrowthStore.getState().ascend('one', 'common').ok).toBe(false);
    expect(usePetStore.getState().coins).toBe(600);
    expect(usePetStore.getState().ownedPets[0].quality).toBeUndefined();
    spy.mockRestore(); recoverPartnerTransaction();
    expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(600);
    expect(JSON.parse(localStorage.getItem('csp_partner_growth_v1')!).starSand).toBe(7);
  });
  it('recovered dismantling cannot refund a stale recycled receipt again', async () => {
    localStorage.setItem('csp_quiz_state', JSON.stringify({ totalCorrect: 140 }));
    await usePartnerGrowthStore.getState().load();
    expect(usePartnerGrowthStore.getState().ascend('one', 'common').ok).toBe(true);
    usePetStore.getState().recyclePet('one');
    const stale = usePetStore.getState().recycledPets;
    const before = localStorage.getItem('csp_pet_data')!;
    expect(usePetStore.getState().dismantleRecycledPet('one').ok).toBe(true);
    const after = localStorage.getItem('csp_pet_data')!;
    localStorage.setItem(PARTNER_JOURNAL_KEY, JSON.stringify({ version: 1, phase: 'commit', before: { csp_pet_data: before }, after: { csp_pet_data: after }, mirrors: { csp_pet_data: 'pet_data' } }));
    recoverPartnerTransaction(); recoverPartnerTransaction();
    usePetStore.setState({ recycledPets: stale });
    expect(usePetStore.getState().dismantleRecycledPet('one').ok).toBe(false);
    expect(usePetStore.getState().coins).toBe(580);
  });
});
