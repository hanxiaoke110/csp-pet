import { beforeEach, expect, it, vi } from 'vitest';
import { applyBackup, shouldIncludeKey, shouldIncludeSqliteKey, validateBackupState, type BackupFile } from './backup';
import { defaultAccessorySnapshot, PARTNER_ACCESSORY_KEY } from '../data/partnerAccessories';
import { createTestLockManager } from '../testSupport/webLocks';
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: createTestLockManager() }); vi.stubGlobal('window', {});
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
});
const pet = { petId: 'one', speciesId: 'capi', petName: '卡皮', level: 3 };
const backup = (): BackupFile => ({ format: 'csp-pet-backup', version: 1, appVersion: '1.7.51', exportedAt: new Date().toISOString(), localStorage: { csp_pet_data: JSON.stringify({ coins: 321, ownedPets: [pet] }) }, sqlite: {}, sprites: {} });
it('backs up both accessory authorities and excludes catalog caches', () => {
  expect(shouldIncludeKey(PARTNER_ACCESSORY_KEY)).toBe(true); expect(shouldIncludeSqliteKey('partner_accessories')).toBe(true);
  expect(shouldIncludeKey('csp_partner_accessory_catalog_cache_v1')).toBe(false);
});
it('restores old profiles with the free halo while retaining wallet and pets', async () => {
  await applyBackup(backup());
  expect(JSON.parse(localStorage.getItem(PARTNER_ACCESSORY_KEY)!)).toMatchObject({ ownedIds: ['halo-clear'], equippedByPet: {} });
  expect(JSON.parse(localStorage.getItem('csp_pet_data')!)).toMatchObject({ coins: 321, ownedPets: [pet] });
});
it('restores permanent ownership and per-instance equipment from SQLite-only cosmetics', async () => {
  const b = backup(); b.sqlite.partner_accessories = JSON.stringify({ ...defaultAccessorySnapshot(), ownedIds: ['halo-clear', 'orbit-stars'], equippedByPet: { one: { orbit: 'orbit-stars' }, two: { halo: 'halo-clear' } } });
  await applyBackup(b);
  expect(JSON.parse(localStorage.getItem(PARTNER_ACCESSORY_KEY)!)).toMatchObject({ ownedIds: ['halo-clear', 'orbit-stars'], equippedByPet: { one: { orbit: 'orbit-stars' }, two: { halo: 'halo-clear' } } });
  expect(localStorage.getItem('csp_partner_transaction_v1')).toBe(null);
});
it('rejects equipment referring to unowned cosmetics before restoration', () => {
  const b = backup(); b.localStorage[PARTNER_ACCESSORY_KEY] = JSON.stringify({ ...defaultAccessorySnapshot(), equippedByPet: { one: { orbit: 'orbit-stars' } } });
  expect(validateBackupState(b)).toContain('配饰');
});
