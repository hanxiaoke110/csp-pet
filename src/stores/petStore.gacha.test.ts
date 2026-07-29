import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePetStore } from './petStore';
import { ALL_SHOP_ITEMS, PET_TIERS, getPetConfig, type OwnedPet } from '../types/pet';

function makeLocalStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
  };
}

function ownedPet(speciesId: string, index: number): OwnedPet {
  const config = getPetConfig(speciesId)!;
  return {
    petId: `pet-${index}`,
    petName: `测试智子${index}`,
    speciesId,
    element: config.element,
    renderType: config.renderType,
    modelPath: config.modelPath,
    level: 1,
    exp: 0,
    expToNext: 100,
    hunger: 100,
    mood: 80,
    affection: 50,
    lastFedAt: null,
    obtainedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  usePetStore.setState({
    ownedPets: [],
    activePetId: null,
    coins: 200,
    foods: { basic: 0, premium: 0, deluxe: 0 },
    renameCards: 0,
    gachaHistory: [],
    gachaDailyPulls: 0,
    gachaDate: '',
    gachaPity: 0,
    expPool: 0,
  });
});

describe('智子升级属性', () => {
  it('分配经验升级后会立即重算战斗属性并写入存档', () => {
    const pet = usePetStore.getState().ensureBattleStats(ownedPet('capi', 1));
    usePetStore.setState({
      ownedPets: [pet],
      activePetId: pet.petId,
      expPool: 100,
    });
    const oldAttack = pet.battle!.attack;

    usePetStore.getState().allocateExpFromPool(pet.petId, 100);

    const upgraded = usePetStore.getState().ownedPets[0];
    expect(upgraded.level).toBe(2);
    expect(upgraded.battle!.attack).toBeGreaterThan(oldAttack);
    const saved = JSON.parse(localStorage.getItem('csp_pet_data') || '{}');
    expect(saved.ownedPets[0].level).toBe(2);
    expect(saved.ownedPets[0].battle.attack).toBe(upgraded.battle!.attack);
  });
});

describe('商城抽卡奖励', () => {
  it('抽中许愿票会进入统一票券钱包并留下可见记录', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.55);

    const result = usePetStore.getState().doGacha();

    expect(result?.type).toBe('wishTicket');
    expect(localStorage.getItem('csp_wish_tickets')).toBe('1');
    expect(usePetStore.getState()).toMatchObject({ coins: 50, gachaDailyPulls: 1 });
    expect(usePetStore.getState().gachaHistory[0].label).toBe('许愿票 ×1');
  });

  it('传说智子已集齐时返还改名卡，但仍正常扣费、计数并清空保底', () => {
    const legendaryIds = ALL_SHOP_ITEMS
      .filter(item => item.speciesId && PET_TIERS[item.speciesId] === 'legendary')
      .map(item => item.speciesId!);
    usePetStore.setState({
      ownedPets: legendaryIds.map(ownedPet),
      coins: 200,
      gachaPity: 99,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const result = usePetStore.getState().doGacha();

    expect(result?.type).toBe('renameCard');
    expect(usePetStore.getState()).toMatchObject({
      coins: 50,
      gachaDailyPulls: 1,
      gachaPity: 0,
      renameCards: 1,
    });
  });
});
