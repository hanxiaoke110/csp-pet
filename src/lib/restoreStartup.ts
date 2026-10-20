import { interruptedRestore, RESTORE_GENERATION_KEY } from './restoreBarrier';
import { recoverPartnerTransaction, withPartnerReadLock } from './partnerTransactions';
import { recoverEquipmentTransaction } from './equipmentTransactions';

/** On a new process, settle the durable journal before adopting a restore
 * generation left by a crash. Both pre-commit and post-commit states are safe. */
export async function recoverInterruptedRestore(): Promise<boolean> {
  if (!interruptedRestore) return false;
  await withPartnerReadLock(() => {
    recoverEquipmentTransaction(); recoverPartnerTransaction();
    const value = localStorage.getItem(RESTORE_GENERATION_KEY);
    if (value?.startsWith('restoring:')) localStorage.setItem(RESTORE_GENERATION_KEY, value.replace('restoring:', 'complete:'));
  });
  return true;
}
