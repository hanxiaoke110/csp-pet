import { beforeEach, expect, it, vi } from 'vitest';
import { usePetStore } from '../stores/petStore';
import { useCollectorCardStore } from '../stores/collectorCardStore';
import { useProfileStore } from '../stores/profileStore';
import { useHatchStore } from '../stores/hatchStore';
import { applyCompensationReceipt } from './compensationRedemption';
import { createTestLockManager } from '../testSupport/webLocks';
let values: Map<string, string>, failedKey: string;
beforeEach(() => {
  values = new Map(); failedKey = '';
  vi.stubGlobal('navigator', { locks: createTestLockManager() });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (key === failedKey) throw new Error('synthetic quota'); values.set(key, value); },
    removeItem: (key: string) => values.delete(key),
  });
  usePetStore.setState({ ownedPets: [], coins: 1000, expPool: 0, loaded: true, loadError: null });
  values.set('csp_pet_data', JSON.stringify({ ownedPets: [], coins: 1000, expPool: 0 }));
  useCollectorCardStore.setState({ ownedCards: [], loaded: true });
  useProfileStore.setState({ ownedItemIds: [], nickname: 'before', nicknameChanges: 1 });
  useHatchStore.setState({ eggs: [] });
});
it('a rejected card write never charges the wallet', async () => {
  failedKey = 'csp_collector_cards_v1';
  expect((await useCollectorCardStore.getState().purchase('card-test', 888)).ok).toBe(false);
  expect(usePetStore.getState().coins).toBe(1000);
  expect(JSON.parse(values.get('csp_pet_data')!).coins).toBe(1000);
});
it('simultaneous card purchases charge exactly once', async () => {
  const result = await Promise.all([useCollectorCardStore.getState().purchase('card-test', 888), useCollectorCardStore.getState().purchase('card-test', 888)]);
  expect(result.filter(r => r.ok)).toHaveLength(1);
  expect(JSON.parse(values.get('csp_pet_data')!).coins).toBe(112);
});
it('failed paid rename and wardrobe writes retain wallet and profile', async () => {
  failedKey = 'csp_profile_data';
  expect((await useProfileStore.getState().changeNickname('after')).ok).toBe(false);
  expect((await useProfileStore.getState().purchase('avatar-zodiac-tiger')).ok).toBe(false);
  expect(useProfileStore.getState().nickname).toBe('before');
  expect(JSON.parse(values.get('csp_pet_data')!).coins).toBe(1000);
});
it('failed workshop egg save is refundable and a repeat cannot create two eggs', async () => {
  failedKey = 'csp_hatch_eggs';
  await expect(useHatchStore.getState().purchaseEgg('workshop-test', 'test', 'rare', 300)).rejects.toThrow();
  expect(JSON.parse(values.get('csp_pet_data')!).coins).toBe(1000);
  failedKey = '';
  await useHatchStore.getState().purchaseEgg('workshop-test', 'test', 'rare', 300);
  await expect(useHatchStore.getState().purchaseEgg('workshop-test', 'test', 'rare', 300)).rejects.toThrow('已经拥有');
  expect(JSON.parse(values.get('csp_pet_data')!).coins).toBe(700);
  expect(useHatchStore.getState().eggs).toHaveLength(1);
});
it('a compensation receipt can retry failed local persistence and applies only once', async () => {
  const receipt = { success: true, receipt_id: 'cmp-v2:CMP-TEST', coins: 100, exp: 200 };
  failedKey = 'csp_used_comp_codes';
  await expect(applyCompensationReceipt('CMP-TEST', receipt)).rejects.toThrow('未能保存');
  expect(JSON.parse(values.get('csp_pet_data')!).coins).toBe(1000);
  failedKey = '';
  expect(await applyCompensationReceipt('CMP-TEST', receipt)).toBe(true);
  expect(await applyCompensationReceipt('CMP-TEST', receipt)).toBe(false);
  expect(JSON.parse(values.get('csp_pet_data')!).coins).toBe(1100);
  expect(usePetStore.getState().expPool).toBe(200);
});
