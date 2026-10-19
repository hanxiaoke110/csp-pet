import { dualSave } from './persist';
import { storageWritesAllowed } from './restoreBarrier';

export const JOURNAL_KEY = 'csp_equipment_transaction';
export const EQUIPMENT_STORAGE_KEY = 'csp_trial_equipment_v1';

/** Roll forward an interrupted local transaction before either wallet or equipment hydrates. */
export function recoverEquipmentTransaction(): void {
  const raw = localStorage.getItem(JOURNAL_KEY);
  if (!raw) return;
  const journal = JSON.parse(raw);
  if (journal.version !== 1 || typeof journal.pet !== 'string' || typeof journal.equipment !== 'string') throw new Error('装备交易记录异常');
  const pet = JSON.parse(journal.pet);
  const equipment = JSON.parse(journal.equipment);
  if (!Array.isArray(pet.ownedPets) || !Number.isSafeInteger(pet.coins) || pet.coins < 0 || equipment.schemaVersion !== 2 || !Array.isArray(equipment.ownedItems)) throw new Error('装备交易记录异常');
  localStorage.setItem('csp_pet_data', journal.pet);
  localStorage.setItem(EQUIPMENT_STORAGE_KEY, journal.equipment);
  dualSave('pet_data', 'csp_pet_data', journal.pet);
  localStorage.removeItem(JOURNAL_KEY);
}

export function commitEquipmentTransaction(equipment: unknown, coins: number): boolean {
  if (!storageWritesAllowed()) return false;
  if (!Number.isSafeInteger(coins) || coins < 0) return false;
  try {
  const previousPet = localStorage.getItem('csp_pet_data');
  const previousEquipment = localStorage.getItem(EQUIPMENT_STORAGE_KEY);
  if (!previousPet) return false;
  const pet = JSON.parse(previousPet);
  if (!Array.isArray(pet.ownedPets)) return false;
  const nextPet = JSON.stringify({ ...pet, coins, maxCoinBalance: Math.max(coins, Number(pet.maxCoinBalance) || 0), savedAt: new Date().toISOString() });
  const nextEquipment = JSON.stringify(equipment);
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify({ version: 1, pet: nextPet, equipment: nextEquipment }));
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, nextEquipment);
    localStorage.setItem('csp_pet_data', nextPet);
    localStorage.removeItem(JOURNAL_KEY);
  } catch {
    try {
      localStorage.setItem('csp_pet_data', previousPet);
      if (previousEquipment === null) localStorage.removeItem(EQUIPMENT_STORAGE_KEY);
      else localStorage.setItem(EQUIPMENT_STORAGE_KEY, previousEquipment);
      localStorage.removeItem(JOURNAL_KEY);
    } catch { /* journal remains recoverable if rollback is interrupted */ }
    return false;
  }
  dualSave('pet_data', 'csp_pet_data', nextPet);
  return true;
  } catch { return false; }
}
