import { emit } from '@tauri-apps/api/event';
import { usePetStore } from '../stores/petStore';
import { commitLocalSnapshots, recoverPartnerTransaction, withPartnerTransactionLock } from './partnerTransactions';
import { recoverEquipmentTransaction } from './equipmentTransactions';

export type PurchaseResult<T = undefined> = { ok: true; value: T } | { ok: false; reason: string };
/** Prepare from persisted state inside the shared lock; publish only after the
 * wallet and inventory have both committed. Never deduct via spendCoins first. */
export async function walletTransaction<T>(prepare: (wallet: any) => {
  cost: number; value: T; snapshots: Record<string, string>; mirrors: Record<string, string>;
}): Promise<PurchaseResult<T>> {
  try { return await withPartnerTransactionLock(() => {
    recoverPartnerTransaction(); recoverEquipmentTransaction();
    const state = usePetStore.getState();
    if (!state.loaded || state.loadError) throw new Error('storage');
    const wallet = JSON.parse(localStorage.getItem('csp_pet_data') || 'null');
    if (!wallet || !Array.isArray(wallet.ownedPets) || !Number.isSafeInteger(wallet.coins) || wallet.coins < 0) throw new Error('storage');
    const plan = prepare(wallet);
    if (!Number.isSafeInteger(plan.cost) || plan.cost < 0) throw new Error('invalid');
    if (wallet.coins < plan.cost) throw new Error('coins');
    const next = { ...wallet, coins: wallet.coins - plan.cost, savedAt: new Date().toISOString() };
    if (!commitLocalSnapshots({ ...plan.snapshots, csp_pet_data: JSON.stringify(next) }, { ...plan.mirrors, csp_pet_data: 'pet_data' })) throw new Error('storage');
    usePetStore.setState(next);
    emit('pet-data-sync', next).catch(() => {});
    return { ok: true as const, value: plan.value };
  }); } catch (error) {
    return { ok: false, reason: error instanceof Error && ['owned', 'coins', 'invalid', 'same'].includes(error.message) ? error.message : 'storage' };
  }
}
