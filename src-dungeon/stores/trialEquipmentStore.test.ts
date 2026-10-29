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
  it('旧存档碎片可按10比1兑换自选晶石，保存后重载不变，不动金币及装备', () => {
    localStorage.setItem('csp_trial_equipment_v1', JSON.stringify({ ownedItems: [], soulFragments: 182, materials: { 'wind-crystal': 30 }, materialClaims: ['old-map'] }));
    equipment.getState().load();
    expect(equipment.getState().exchangeSoulFragments('wind', 3)).toEqual({ ok: true });
    expect(equipment.getState().soulFragments).toBe(152);
    expect(equipment.getState().materials['wind-crystal']).toBe(33);
    equipment.getState().load();
    expect(equipment.getState()).toMatchObject({ soulFragments: 152, materials: { 'wind-crystal': 33 }, materialClaims: ['old-map'], ownedItems: [] });
    expect(wallet.getState().coins).toBe(3000);
  });
  it.each(['earth', 'fire', 'wind', 'water', 'light'])('可兑换%s属性；连续调用按实时余额扣减，不能透支', element => {
    equipment.setState({ soulFragments: 10 });
    expect(equipment.getState().exchangeSoulFragments(element, 1).ok).toBe(true);
    expect(equipment.getState().exchangeSoulFragments(element, 1).ok).toBe(false);
    expect(equipment.getState().soulFragments).toBe(0);
    expect(equipment.getState().materials[`${element}-crystal`]).toBe(1);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('无效或溢出数量%s不会改变碎片、晶石或存档', quantity => {
    equipment.setState({ soulFragments: 100 });
    const before = localStorage.getItem('csp_trial_equipment_v1');
    expect(equipment.getState().exchangeSoulFragments('wind', quantity).ok).toBe(false);
    expect(equipment.getState()).toMatchObject({ soulFragments: 100, materials: {} });
    expect(localStorage.getItem('csp_trial_equipment_v1')).toBe(before);
  });
  it('非法属性和晶石余额溢出均不能兑换', () => {
    equipment.setState({ soulFragments: 100, materials: { 'wind-crystal': Number.MAX_SAFE_INTEGER } });
    expect(equipment.getState().exchangeSoulFragments('wood', 1).ok).toBe(false);
    expect(equipment.getState().exchangeSoulFragments('wind', 1).ok).toBe(false);
    expect(equipment.getState().soulFragments).toBe(100);
  });
  it('兑换保存失败不扣碎片，再次操作成功后刷新仍保持同一余额', () => {
    localStorage.setItem('csp_trial_equipment_v1', JSON.stringify({ ownedItems: [], soulFragments: 20, materials: { 'wind-crystal': 7 } }));
    equipment.getState().load();
    const before = localStorage.getItem('csp_trial_equipment_v1');
    const setter = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect(equipment.getState().exchangeSoulFragments('wind', 1).ok).toBe(false);
    expect(equipment.getState()).toMatchObject({ soulFragments: 20, materials: { 'wind-crystal': 7 } });
    expect(localStorage.getItem('csp_trial_equipment_v1')).toBe(before);
    setter.mockRestore();
    expect(equipment.getState().exchangeSoulFragments('wind', 1).ok).toBe(true);
    equipment.getState().load();
    expect(equipment.getState()).toMatchObject({ soulFragments: 10, materials: { 'wind-crystal': 8 } });
  });
  it('重复装备兑换所得晶石可直接强化，原有装备及材料记录保留', () => {
    equipment.getState().grantItem('fire-weapon-common');
    for (let i = 0; i < 5; i++) equipment.getState().grantItem('fire-weapon-common');
    expect(equipment.getState().soulFragments).toBe(10);
    expect(equipment.getState().exchangeSoulFragments('fire', 1).ok).toBe(true);
    const item = equipment.getState().ownedItems[0];
    expect(equipment.getState().upgradeItem(item.id).ok).toBe(true);
    expect(equipment.getState().ownedItems[0].upgradeLevel).toBe(1);
    expect(equipment.getState().materials['fire-crystal']).toBe(0);
    expect(equipment.getState().equippedWeaponId).toBe(item.id);
    expect(wallet.getState().coins).toBe(2980);
  });
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
