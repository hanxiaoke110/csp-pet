// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import EquipmentWorkshop from './EquipmentWorkshop';
import { useTrialEquipmentStore as equipment } from '../../stores/trialEquipmentStore';
import { usePetStore as wallet } from '../../../src/stores/petStore';

vi.mock('../../services/equipmentCatalogService', () => ({ loadEquipmentCatalog: async () => {} }));
vi.mock('./EquipmentMaterialExchange', () => ({ default: () => null }));
vi.mock('@tauri-apps/api/event', () => ({ emit: async () => {} }));
vi.mock('../../../src/lib/persist', () => ({
  dualSave: (_key: string, ls: string, raw: string) => localStorage.setItem(ls, raw),
  dualLoad: async (_key: string, ls: string) => localStorage.getItem(ls),
}));
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('confirms an upgrade once, saves coins/materials and keeps the upgraded item after leaving and reopening', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn(() => ({ matches: false })) as any;
  wallet.setState({ loaded: true, coins: 3000, maxCoinBalance: 3000, ownedPets: [] });
  wallet.getState().save();
  equipment.setState({ ownedItems: [], equippedWeaponId: null, equippedArmorId: null, equippedArtifactId: null, soulFragments: 0, materials: {}, materialClaims: [] });
  equipment.getState().grantItem('fire-weapon-common');
  equipment.getState().grantMaterial('fire-crystal', 10);
  const id = equipment.getState().ownedItems[0].id;
  const host = document.createElement('div'); document.body.append(host);
  let root = createRoot(host);
  const click = async (selector: string, text: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(selector)].find(b => b.textContent?.includes(text));
    expect(button, text).toBeTruthy(); expect(button!.disabled).toBe(false);
    await act(async () => button!.click());
  };
  try {
    await act(async () => root.render(<EquipmentWorkshop initialSection="inventory" />));
    await click('.equipment-tile', '+0');
    await click('.equipment-detail button', '强化到 +1');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click('[role="dialog"] button', '确认');
    expect(host.textContent).toContain('操作成功，金币与装备已保存');
    expect(equipment.getState().ownedItems[0]).toMatchObject({ id, upgradeLevel: 1 });
    expect(wallet.getState().coins).toBe(2980);
    expect(equipment.getState().materials['fire-crystal']).toBe(9);
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<EquipmentWorkshop initialSection="inventory" />));
    expect(host.querySelector('.equipment-tile')?.textContent).toContain('+1');
    expect(equipment.getState().equippedWeaponId).toBe(id);
    expect(JSON.parse(localStorage.getItem('csp_trial_equipment_v1')!).ownedItems[0].upgradeLevel).toBe(1);
    expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(2980);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
