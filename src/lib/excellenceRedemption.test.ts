// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { redeemExcellenceCode, validateExcellenceCode } from './excellenceRedemption';
import { usePetStore } from '../stores/petStore';
import { createTestLockManager } from '../testSupport/webLocks';
import { applyBackup, shouldIncludeKey } from './backup';
import type { OwnedPet } from '../types/pet';

const code = 'EXC-1-1016-G6TH-7S2X';
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  vi.stubGlobal('navigator', { locks: createTestLockManager() });
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  const saved = { ownedPets: [], activePetId: null, coins: 200, expPool: 0, maxCoinBalance: 200 };
  localStorage.setItem('csp_pet_data', JSON.stringify(saved));
  usePetStore.setState({ ...saved, loaded: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('redeems the existing teacher code offline and durably saves rewards with its receipt', async () => {
  expect((await redeemExcellenceCode(code)).type).toBe('success');
  expect(fetch).not.toHaveBeenCalled();
  expect(usePetStore.getState().coins).toBe(260);
  expect(usePetStore.getState().expPool).toBe(100);
  expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(260);
  expect(JSON.parse(localStorage.getItem('csp_used_exc_codes')!)).toContain(code);
});

it('serializes concurrent submissions and does not pay twice', async () => {
  const results = await Promise.all([redeemExcellenceCode(code), redeemExcellenceCode(code.toLowerCase())]);
  expect(results.map(r => r.type)).toEqual(['success', 'already']);
  expect(usePetStore.getState().coins).toBe(260);
});

it.each([
  ['EXC-2-1016-DBPC-AB12', 40, 60],
  ['EXC-3-1016-LKEM-AB12', 20, 30],
])('keeps the existing prize amounts for %s', async (input, coins, exp) => {
  expect((await redeemExcellenceCode(input)).type).toBe('success');
  expect(usePetStore.getState().coins).toBe(200 + coins);
  expect(usePetStore.getState().expPool).toBe(exp);
});

it('uses the durable wallet instead of overwriting another window with stale memory', async () => {
  const saved = JSON.parse(localStorage.getItem('csp_pet_data')!);
  localStorage.setItem('csp_pet_data', JSON.stringify({ ...saved, coins: 350 }));
  expect((await redeemExcellenceCode(code)).type).toBe('success');
  expect(usePetStore.getState().coins).toBe(410);
});

it('does not redeem until user data hydration has finished', async () => {
  usePetStore.setState({ loaded: false });
  expect((await redeemExcellenceCode(code)).type).toBe('error');
  expect(localStorage.getItem('csp_used_exc_codes')).toBeNull();
  expect(usePetStore.getState().coins).toBe(200);
});

it('preserves legacy used-code records and does not contact the old server', async () => {
  localStorage.setItem('csp_used_exc_codes', JSON.stringify([code.toLowerCase()]));
  expect((await redeemExcellenceCode(code)).type).toBe('already');
  expect(usePetStore.getState().coins).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
});

it('uses Beijing midnight, not the computer timezone, and rejects altered codes', () => {
  expect(validateExcellenceCode(code, new Date('2026-10-15T15:59:59Z'))).toHaveProperty('type', 'error');
  expect(validateExcellenceCode(code, new Date('2026-10-15T16:00:00Z'))).toHaveProperty('level', '1');
  expect(validateExcellenceCode(code, new Date('2026-10-16T15:59:59Z'))).toHaveProperty('level', '1');
  expect(validateExcellenceCode(code, new Date('2026-10-16T16:00:00Z'))).toHaveProperty('type', 'error');
  expect(validateExcellenceCode(code.replace('7S2X', '7S2Y'))).toHaveProperty('type', 'error');
  expect(validateExcellenceCode(code.replace('EXC-1', 'EXC-2'))).toHaveProperty('type', 'error');
});

it('does not consume the code or change rewards when receipt storage fails; retry works', async () => {
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === 'csp_used_exc_codes') throw new Error('disk full');
    return original.call(this, key, value);
  });
  expect((await redeemExcellenceCode(code)).type).toBe('error');
  expect(usePetStore.getState().coins).toBe(200);
  expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(200);
  expect(localStorage.getItem('csp_used_exc_codes')).toBeNull();
  spy.mockRestore();
  expect((await redeemExcellenceCode(code)).type).toBe('success');
  expect(usePetStore.getState().coins).toBe(260);
});

it('does not silently reset damaged redemption records', async () => {
  localStorage.setItem('csp_used_exc_codes', '{}');
  expect((await redeemExcellenceCode(code)).type).toBe('error');
  expect(usePetStore.getState().coins).toBe(200);
  expect(localStorage.getItem('csp_used_exc_codes')).toBe('{}');
});

it('retains the existing pet/pool split, mood bonus, levels and battle stats', async () => {
  const pet = { petId: 'test-pet', speciesId: 'capi', level: 1, exp: 90, expToNext: 100, mood: 80 } as OwnedPet;
  const saved = JSON.parse(localStorage.getItem('csp_pet_data')!);
  saved.ownedPets = [pet]; saved.activePetId = pet.petId;
  localStorage.setItem('csp_pet_data', JSON.stringify(saved));
  expect((await redeemExcellenceCode(code)).type).toBe('success');
  const state = usePetStore.getState();
  expect(state.expPool).toBe(70);
  expect(state.ownedPets[0]).toMatchObject({ petId: 'test-pet', level: 2, exp: 26, expToNext: 130, mood: 83 });
  expect(state.ownedPets[0].battle?.maxHp).toBeGreaterThan(0);
});

it('restores rewards and used-code record together through the existing backup API', async () => {
  await redeemExcellenceCode(code);
  expect(shouldIncludeKey('csp_used_exc_codes')).toBe(true);
  const snapshot = { csp_pet_data: localStorage.getItem('csp_pet_data')!, csp_used_exc_codes: localStorage.getItem('csp_used_exc_codes')! };
  localStorage.clear();
  await applyBackup({ format: 'csp-pet-backup', version: 1, appVersion: '1.7.52', exportedAt: new Date().toISOString(),
    localStorage: snapshot, sqlite: {}, sprites: {} });
  expect((await redeemExcellenceCode(code)).type).toBe('already');
  expect(JSON.parse(localStorage.getItem('csp_pet_data')!).coins).toBe(260);
});
