// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import PartnerAccessoryPanel from './PartnerAccessoryPanel';
import { usePetStore } from '../../stores/petStore';
import { usePartnerAccessoryStore } from '../../stores/partnerAccessoryStore';
import { BUILTIN_ACCESSORY_CATALOG, defaultAccessorySnapshot, PARTNER_ACCESSORY_KEY } from '../../data/partnerAccessories';
import { createTestLockManager } from '../../testSupport/webLocks';
vi.mock('./PetSprite', () => ({ default: () => <span>智子预览</span> }));
vi.mock('./PartnerAccessoryLayers', () => ({ default: () => null, AccessoryMark: () => null, usePartnerAccessories: () => {} }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../lib/sqlite-storage', () => ({ sqliteSetFireAndForget: vi.fn(), sqliteGet: vi.fn().mockResolvedValue(null) }));
it('offers one free copy for an undecorated pet, then shows its independent saved outfit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { locks: createTestLockManager() });
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as any;
  const pets = [{ petId: 'one', petName: '阿星', speciesId: 'capi', modelPath: '' }, { petId: 'two', petName: '小白', speciesId: 'capi', modelPath: '' }] as any;
  usePetStore.setState({ ownedPets: pets, activePetId: 'two', coins: 1000, loaded: true });
  localStorage.setItem('csp_pet_data', JSON.stringify({ coins: 1000, ownedPets: pets, activePetId: 'two' }));
  const snapshot = { ...defaultAccessorySnapshot(), equippedByPet: { one: { halo: 'halo-clear' } } } as any;
  localStorage.setItem(PARTNER_ACCESSORY_KEY, JSON.stringify(snapshot));
  usePartnerAccessoryStore.setState({ loaded: true, busy: false, error: '', snapshot, catalog: structuredClone(BUILTIN_ACCESSORY_CATALOG) });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<PartnerAccessoryPanel />));
    const button = host.querySelector<HTMLButtonElement>('.partner-copy-loadout button');
    expect(button?.textContent).toBe('沿用「阿星」的搭配');
    await act(async () => button!.click());
    expect(host.querySelector('.partner-copy-loadout')).toBeNull();
    expect(host.querySelector('.partner-preview-caption b')?.textContent).toBe('当前搭配');
    expect(usePartnerAccessoryStore.getState().snapshot.equippedByPet).toEqual({ one: { halo: 'halo-clear' }, two: { halo: 'halo-clear' } });
    expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(1000);
    expect(host.textContent).toContain('已沿用配饰');
    const picker = host.querySelector('select')!;
    await act(async () => { picker.value = 'one'; picker.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector('.partner-copy-loadout')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); }
});
