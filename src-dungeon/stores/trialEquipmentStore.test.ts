import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrialEquipmentStore as equipment } from './trialEquipmentStore';
import { usePetStore as wallet } from '../../src/stores/petStore';
import { recoverEquipmentTransaction, commitEquipmentTransaction } from '../../src/lib/equipmentTransactions';

vi.mock('../../src/lib/persist', () => ({
  dualSave: (_key: string, ls: string, data: string) => localStorage.setItem(ls, data),
  dualLoad: async (_key: string, ls: string) => localStorage.getItem(ls),
}));
vi.mock('@tauri-apps/api/event', () => ({ emit: async () => {} }));

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
  wallet.setState({ coins: 3000, maxCoinBalance: 3000, ownedPets: [], loaded: true });
  wallet.getState().save();
  equipment.setState({ ownedItems: [], equippedWeaponId: null, equippedArmorId: null, equippedArtifactId: null, soulFragments: 0, materials: {}, materialClaims: [] });
});

describe('装备交易与旧存档', () => {
  it('探索晶石随存档迁移，每张地图只领取一次，拒绝非法领取', () => {
    expect(equipment.getState().claimExplorationMaterials('map-1', [{ materialId: 'fire-crystal', amount: 16 }])).toBe(true);
    equipment.getState().load();
    expect(equipment.getState().claimExplorationMaterials('map-1', [{ materialId: 'fire-crystal', amount: 16 }])).toBe(false);
    expect(equipment.getState().materials['fire-crystal']).toBe(16);
    expect(equipment.getState().claimExplorationMaterials('map-2', [{ materialId: 'money', amount: 16 }])).toBe(false);
    expect(equipment.getState().claimExplorationMaterials('map-2', [{ materialId: 'fire-crystal', amount: -1 }])).toBe(false);
  });
  it('旧装备、未下载的在线装备保留；旧掉落不能返还虚构购买金额', () => {
    localStorage.setItem('csp_trial_equipment_v1', JSON.stringify({ ownedItems: [
      { id: 'old', definitionId: 'xuanwu-hammer-common', quantity: 1 },
      { id: 'remote', definitionId: 'future-weapon', quantity: 1 },
    ], equippedWeaponId: 'old' }));
    equipment.getState().load();
    expect(equipment.getState().ownedItems).toHaveLength(2);
    expect(equipment.getState().equippedWeaponId).toBe('old');
    expect(equipment.getState().ownedItems[0]).toMatchObject({ upgradeLevel: 0, purchasePrice: 0, investedCoins: 0, acquisitionSource: 'legacy' });
    equipment.getState().unequipItem('old');
    expect(equipment.getState().dismantleItem('old')).toEqual({ ok: true, refundedCoins: 0 });
    expect(wallet.getState().coins).toBe(3000);
  });

  it('购买、升级、卸下和分解只返还实际支出的80%，材料不返还', () => {
    expect(equipment.getState().buyItem('fire-weapon-legendary').ok).toBe(true);
    const id = equipment.getState().ownedItems[0].id;
    expect(wallet.getState().coins).toBe(2050);
    expect(equipment.getState().buyItem('fire-weapon-legendary').ok).toBe(false);
    expect(equipment.getState().upgradeItem(id).ok).toBe(false);
    equipment.getState().grantMaterial('fire-crystal', 20);
    expect(equipment.getState().upgradeItem(id).ok).toBe(true);
    expect(wallet.getState().coins).toBe(1980);
    expect(equipment.getState().materials['fire-crystal']).toBe(16);
    equipment.getState().equipItem(id);
    expect(equipment.getState().dismantleItem(id).ok).toBe(false);
    equipment.getState().unequipItem(id);
    expect(equipment.getState().dismantleItem(id)).toEqual({ ok: true, refundedCoins: 816 });
    expect(wallet.getState().coins).toBe(2796);
    expect(equipment.getState().materials['fire-crystal']).toBe(16);
    expect(equipment.getState().dismantleItem(id).ok).toBe(false);
    expect(wallet.getState().coins).toBe(2796);
  });

  it('满级后拒绝升级，升级状态可重新加载', () => {
    equipment.getState().buyItem('fire-weapon-common');
    const id = equipment.getState().ownedItems[0].id;
    equipment.getState().grantMaterial('fire-crystal', 20);
    for (let i = 0; i < 5; i++) expect(equipment.getState().upgradeItem(id).ok).toBe(true);
    const balance = wallet.getState().coins;
    expect(equipment.getState().upgradeItem(id).ok).toBe(false);
    equipment.getState().load();
    expect(equipment.getState().ownedItems[0]).toMatchObject({ upgradeLevel: 5, investedCoins: 250 });
    expect(wallet.getState().coins).toBe(balance);
  });

  it('存储失败回滚钱包与装备，不出现扣钱未到账', () => {
    const oldWallet = localStorage.getItem('csp_pet_data');
    const setter = localStorage.setItem.bind(localStorage);
    let fail = true;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'csp_trial_equipment_v1' && fail) { fail = false; throw new Error('quota'); }
      setter(key, value);
    });
    expect(equipment.getState().buyItem('fire-weapon-legendary').ok).toBe(false);
    expect(equipment.getState().ownedItems).toHaveLength(0);
    expect(wallet.getState().coins).toBe(3000);
    expect({ ...JSON.parse(localStorage.getItem('csp_pet_data')!), savedAt: null }).toEqual({ ...JSON.parse(oldWallet!), savedAt: null });
    expect(localStorage.getItem('csp_equipment_transaction')).toBeNull();
  });

  it('模拟崩溃后先恢复交易，再读取旧用户的钱包', async () => {
    const pet = JSON.stringify({ ownedPets: [], coins: 2050, savedAt: new Date().toISOString(), gachaRewardMigrationDone: true });
    const items = JSON.stringify({ schemaVersion: 2, ownedItems: [{ id: 'new', definitionId: 'fire-weapon-legendary', purchasePrice: 950 }] });
    localStorage.setItem('csp_equipment_transaction', JSON.stringify({ version: 1, pet, equipment: items }));
    expect(await wallet.getState().load()).toBe(true);
    equipment.getState().load();
    expect(wallet.getState().coins).toBe(2050);
    expect(equipment.getState().ownedItems[0].purchasePrice).toBe(950);
    recoverEquipmentTransaction();
    expect(localStorage.getItem('csp_equipment_transaction')).toBeNull();
  });

  it('坏存档及不安全的金额不能触发交易', () => {
    localStorage.setItem('csp_pet_data', '{broken');
    expect(commitEquipmentTransaction({}, 100)).toBe(false);
    expect(commitEquipmentTransaction({}, Infinity)).toBe(false);
    expect(commitEquipmentTransaction({}, -1)).toBe(false);
  });
});
