import { emit } from '@tauri-apps/api/event';
import { usePetStore } from '../stores/petStore';
import { commitLocalSnapshots, recoverPartnerTransaction, withPartnerTransactionLock } from './partnerTransactions';
import { recoverEquipmentTransaction } from './equipmentTransactions';

/** A replayable V2 receipt and its reward commit together. Reject V1 responses. */
export async function applyCompensationReceipt(code: string, receipt: any): Promise<boolean> {
  if (receipt?.receipt_id !== `cmp-v2:${code}` || !receipt.success
    || ![receipt.coins, receipt.exp].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('补偿回执无效，请更新服务后重试');
  return withPartnerTransactionLock(() => {
    recoverPartnerTransaction(); recoverEquipmentTransaction();
    const used = JSON.parse(localStorage.getItem('csp_used_comp_codes') || '[]');
    if (!Array.isArray(used) || used.some(v => typeof v !== 'string')) throw new Error('兑换记录异常，请保留备份');
    if (used.includes(code)) return false;
    if (!usePetStore.getState().loaded || usePetStore.getState().loadError) throw new Error('请等待存档恢复');
    const saved = JSON.parse(localStorage.getItem('csp_pet_data') || 'null');
    if (!saved || !Array.isArray(saved.ownedPets) || ![saved.coins, saved.expPool ?? 0].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('学习资料尚未完整保存');
    const coins = saved.coins + receipt.coins;
    const expPool = (saved.expPool ?? 0) + receipt.exp;
    if (!Number.isSafeInteger(coins) || !Number.isSafeInteger(expPool)) throw new Error('奖励数值异常');
    const next = { ...saved, coins, expPool, maxCoinBalance: Math.max(saved.maxCoinBalance || 0, coins), savedAt: new Date().toISOString() };
    if (!commitLocalSnapshots({ csp_pet_data: JSON.stringify(next), csp_used_comp_codes: JSON.stringify([...used, code]) }, { csp_pet_data: 'pet_data' })) throw new Error('奖励未能保存，请用同一个码重试，不会重复扣码');
    usePetStore.setState(next);
    emit('pet-data-sync', next).catch(() => {});
    return true;
  });
}
