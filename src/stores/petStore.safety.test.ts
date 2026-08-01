import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePetStore } from './petStore';
import { useHatchStore } from './hatchStore';
import { getPetConfig, type OwnedPet } from '../types/pet';

function makeLocalStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
  };
}

function makePet(id: string, speciesId = 'capi', level = 1): OwnedPet {
  const config = getPetConfig(speciesId)!;
  return {
    petId: id,
    petName: `智子${id}`,
    speciesId,
    element: config.element,
    renderType: config.renderType,
    modelPath: config.modelPath,
    level,
    exp: 0,
    expToNext: 100,
    hunger: 100,
    mood: 80,
    affection: 50,
    lastFedAt: null,
    obtainedAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  useHatchStore.setState({ eggs: [] });
  usePetStore.setState({
    ownedPets: [],
    activePetId: null,
    coins: 200,
    foods: { basic: 3 },
    expPool: 0,
    renameCards: 0,
    gachaHistory: [],
    gachaDailyPulls: 0,
    gachaDate: '',
    gachaPity: 0,
    autoFeederOwned: false,
    autoFeederEnabled: false,
    expShopDate: '',
    expCapsuleBought: 0,
    expCoreBought: 0,
    recycledPets: [],
    companionSlots: 1,
    desktopCompanionIds: [],
  });
});

describe('高额金币消费保护', () => {
  it('三智子位置按 2500/5000 解锁，重复旧请求不会跨档扣款', () => {
    usePetStore.setState({ coins: 10_000 });

    expect(usePetStore.getState().buyCompanionSlot(1)).toBe(true);
    expect(usePetStore.getState()).toMatchObject({ coins: 7_500, companionSlots: 2 });
    expect(JSON.parse(localStorage.getItem('csp_companion_slot_receipt') || '{}')).toMatchObject({ slots: 2 });

    expect(usePetStore.getState().buyCompanionSlot(1)).toBe(false);
    expect(usePetStore.getState()).toMatchObject({ coins: 7_500, companionSlots: 2 });

    expect(usePetStore.getState().buyCompanionSlot(2)).toBe(true);
    expect(usePetStore.getState()).toMatchObject({ coins: 2_500, companionSlots: 3 });

    expect(usePetStore.getState().buyCompanionSlot(3)).toBe(false);
    expect(usePetStore.getState()).toMatchObject({ coins: 2_500, companionSlots: 3 });
  });

  it('永久道具和限购经验物品不会重复超额扣款', () => {
    usePetStore.setState({ coins: 5_000 });

    expect(usePetStore.getState().buyAutoFeeder()).toBe(true);
    expect(usePetStore.getState().buyAutoFeeder()).toBe(false);
    expect(usePetStore.getState().buyExpItem('core')).toBe(true);
    expect(usePetStore.getState().buyExpItem('core')).toBe(false);
    expect(usePetStore.getState().buyExpItem('capsule')).toBe(true);
    expect(usePetStore.getState().buyExpItem('capsule')).toBe(true);
    expect(usePetStore.getState().buyExpItem('capsule')).toBe(true);
    expect(usePetStore.getState().buyExpItem('capsule')).toBe(false);

    expect(usePetStore.getState()).toMatchObject({
      coins: 1_300,
      autoFeederOwned: true,
      expPool: 720,
      expCoreBought: 1,
      expCapsuleBought: 3,
    });
  });

  it('非法或负数消费不会反向增加金币', () => {
    usePetStore.setState({ coins: 500 });

    expect(usePetStore.getState().spendCoins(-100)).toBe(false);
    expect(usePetStore.getState().spendCoins(0)).toBe(false);
    expect(usePetStore.getState().spendCoins(Number.NaN)).toBe(false);
    expect(usePetStore.getState().coins).toBe(500);
  });
});

describe('三智子位置完整性', () => {
  it('升级时 SQLite 旧快照更新也不会覆盖已购买的伙伴位置', async () => {
    const localPet = makePet('p1');
    const sqlitePet = { ...localPet, updatedAt: '2026-08-01T00:00:00.000Z' };
    localStorage.setItem('csp_pet_data', JSON.stringify({
      ownedPets: [localPet], activePetId: 'p1', coins: 7_500,
      foods: { basic: 3 }, companionSlots: 2, desktopCompanionIds: [''],
      gachaRewardMigrationDone: true,
    }));
    // Browser tests use the SQLite key as a local fallback. This deliberately
    // reproduces a newer-looking SQLite snapshot that has lost the entitlement.
    localStorage.setItem('pet_data', JSON.stringify({
      ownedPets: [sqlitePet], activePetId: 'p1', coins: 7_500,
      foods: { basic: 3 }, companionSlots: 1, desktopCompanionIds: [],
      gachaRewardMigrationDone: true,
    }));

    await usePetStore.getState().load();

    expect(usePetStore.getState()).toMatchObject({ coins: 7_500, companionSlots: 2 });
    expect(JSON.parse(localStorage.getItem('csp_pet_data') || '{}')).toMatchObject({ companionSlots: 2 });
    expect(JSON.parse(localStorage.getItem('csp_companion_slot_receipt') || '{}')).toMatchObject({ slots: 2 });
  });

  it('主智子、第二位、第三位必须是三只不同智子', () => {
    const pets = [makePet('p1'), makePet('p2', 'boba'), makePet('p3', 'miga')];
    usePetStore.setState({
      ownedPets: pets,
      activePetId: 'p1',
      companionSlots: 3,
      desktopCompanionIds: ['', ''],
    });

    expect(usePetStore.getState().setDesktopCompanion(3, 'p3')).toBe(true);
    expect(usePetStore.getState().setDesktopCompanion(2, 'p2')).toBe(true);
    expect(usePetStore.getState().setDesktopCompanion(2, 'p3')).toBe(false);
    expect(usePetStore.getState().setDesktopCompanion(2, 'p1')).toBe(false);
    expect(usePetStore.getState().setDesktopCompanion(2, 'missing')).toBe(false);
    expect(usePetStore.getState().desktopCompanionIds).toEqual(['p2', 'p3']);
  });

  it('只设置第三位时，保存和升级加载后不会挪到第二位', async () => {
    const pets = [makePet('p1'), makePet('p2', 'boba'), makePet('p3', 'miga')];
    localStorage.setItem('csp_pet_data', JSON.stringify({
      ownedPets: pets,
      activePetId: 'p1',
      coins: 8_000,
      foods: { basic: 3 },
      companionSlots: 3,
      desktopCompanionIds: ['', 'p3'],
      gachaRewardMigrationDone: true,
    }));

    await usePetStore.getState().load();

    expect(usePetStore.getState().desktopCompanionIds).toEqual(['', 'p3']);
  });
});

describe('孵化与旧版本升级', () => {
  it('抽中智子先进入持久化孵化队列，领取后才进入智子背包', () => {
    usePetStore.setState({ coins: 500 });
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    const result = usePetStore.getState().doGacha();
    expect(result?.type).toBe('pet');
    expect(usePetStore.getState().ownedPets).toHaveLength(0);

    if (!result || result.type !== 'pet') throw new Error('expected pet reward');
    const egg = useHatchStore.getState().addEgg(result.item.speciesId!, result.item.name, result.rarity as 'common' | 'rare' | 'legendary', 150);
    expect(usePetStore.getState().isOwned(result.item.speciesId!)).toBe(true);
    expect(JSON.parse(localStorage.getItem('csp_hatch_eggs') || '[]')).toHaveLength(1);

    useHatchStore.setState(s => ({
      eggs: s.eggs.map(item => item.eggId === egg.eggId ? { ...item, status: 'ready', downloadStatus: 'done' } : item),
    }));
    const claimed = useHatchStore.getState().claimEgg(egg.eggId)!;
    expect(usePetStore.getState().claimHatchedPet(claimed.speciesId, claimed.petName, claimed.rarity, claimed.acquisitionCost)).toBe(true);
    expect(usePetStore.getState().ownedPets).toHaveLength(1);
    expect(usePetStore.getState().ownedPets[0].acquisitionCost).toBe(150);
  });

  it('扣款后的待孵化智子在应用重启后仍可恢复', async () => {
    usePetStore.setState({ coins: 500 });
    expect(usePetStore.getState().spendCoins(150)).toBe(true);
    const egg = useHatchStore.getState().addEgg('capi', '重启保护', 'common', 150);

    expect(usePetStore.getState().coins).toBe(350);
    expect(JSON.parse(localStorage.getItem('csp_hatch_eggs') || '[]')[0]).toMatchObject({
      eggId: egg.eggId,
      speciesId: 'capi',
      acquisitionCost: 150,
      status: 'waiting',
    });

    useHatchStore.setState({ eggs: [] });
    await useHatchStore.getState().load();

    expect(useHatchStore.getState().eggs).toHaveLength(1);
    expect(useHatchStore.getState().eggs[0]).toMatchObject({
      eggId: egg.eggId,
      speciesId: 'capi',
      acquisitionCost: 150,
      status: 'waiting',
    });
    expect(usePetStore.getState().ownedPets).toHaveLength(0);
  });

  it('旧存档升级会保留智子和金币，并修复活动智子、属性与窗口位置', async () => {
    const first = makePet('legacy-1', 'capi', 4);
    const second = makePet('legacy-2', 'boba', 2);
    delete (first as Partial<OwnedPet>).battle;
    delete (first as Partial<OwnedPet>).nativeElement;
    localStorage.setItem('csp_pet_data', JSON.stringify({
      ownedPets: [first, second],
      activePetId: 'missing-pet',
      coins: '4321',
      foods: { basic: 7, deluxe: 2 },
      expPool: 640,
      companionSlots: 3,
      desktopCompanionIds: ['legacy-1', 'legacy-2'],
      gachaRewardMigrationDone: true,
    }));

    await usePetStore.getState().load();

    const state = usePetStore.getState();
    expect(state.ownedPets).toHaveLength(2);
    expect(state.activePetId).toBe('legacy-1');
    expect(state.coins).toBe(4_321);
    expect(state.foods).toMatchObject({ basic: 7, deluxe: 2 });
    expect(state.expPool).toBe(640);
    expect(state.ownedPets[0].battle?.attack).toBeGreaterThan(0);
    expect(state.ownedPets[0].nativeElement).toBe(getPetConfig('capi')!.element);
    expect(state.desktopCompanionIds).toEqual(['', 'legacy-2']);

    usePetStore.getState().save();
    const saved = JSON.parse(localStorage.getItem('csp_pet_data') || '{}');
    expect(saved.ownedPets).toHaveLength(2);
    expect(saved.coins).toBe(4_321);
  });

  it('旧存档缺失 acquisitionCost 时按商城价回填，回收站金币返还不为 0', async () => {
    const shopPet = makePet('shop-1', 'peach', 3);
    const starterPet = makePet('starter-1', 'capi', 1);
    const workshopLegend = { ...makePet('ws-1', 'workshop-ws-abc', 5), tier: 'legendary' as const };
    localStorage.setItem('csp_pet_data', JSON.stringify({
      ownedPets: [shopPet, starterPet, workshopLegend],
      activePetId: 'shop-1',
      coins: 500,
      recycledPets: [
        { pet: makePet('old-1', 'peach', 2), recycledAt: '2026-01-01T00:00:00.000Z', returnedExp: 100, returnedCoins: 0 },
        { pet: { ...makePet('old-2', 'workshop-ws-xyz', 4), tier: 'rare' }, recycledAt: '2026-01-01T00:00:00.000Z', returnedExp: 80, returnedCoins: 0 },
      ],
      gachaRewardMigrationDone: true,
    }));

    await usePetStore.getState().load();

    const state = usePetStore.getState();
    // 商城普通精灵按 TIER_PRICES.common = 150 回填；免费初始智子保持 0
    expect(state.ownedPets.find(p => p.petId === 'shop-1')?.acquisitionCost).toBe(150);
    expect(state.ownedPets.find(p => p.petId === 'starter-1')?.acquisitionCost).toBe(0);
    // 非商城精灵按稀有度定价：传说 500、稀有 260
    expect(state.ownedPets.find(p => p.petId === 'ws-1')?.acquisitionCost).toBe(500);
    expect(state.recycledPets[0].returnedCoins).toBe(75);
    expect(state.recycledPets[1].returnedCoins).toBe(130);
  });
});
