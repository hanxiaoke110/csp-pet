import { emit } from '@tauri-apps/api/event';
import { usePetStore, MAX_PET_LEVEL, calculatePetBattleStats } from '../stores/petStore';
import type { OwnedPet } from '../types/pet';
import { resolvePartnerQuality } from '../utils/partnerQuality';
import { commitLocalSnapshots, recoverPartnerTransaction, withPartnerReadLock } from './partnerTransactions';
import { recoverEquipmentTransaction } from './equipmentTransactions';

export const EXCELLENCE_REWARDS: Record<string, { exp: number; coins: number; label: string }> = {
  '1': { exp: 100, coins: 60, label: '🥇 一等奖' },
  '2': { exp: 60, coins: 40, label: '🥈 二等奖' },
  '3': { exp: 30, coins: 20, label: '🥉 三等奖' },
};
type Result = { type: 'success' | 'error' | 'already'; message: string };
const invalid = (): Result => ({ type: 'error', message: '兑换码无效，请检查输入' });

/** Legacy teacher/extension format. This is an offline checksum, NOT a secure
 * signature: it prevents typos, not a determined user forging local rewards. */
export function validateExcellenceCode(input: string, now = new Date()): Result | { level: string; code: string } {
  const code = input.trim().toUpperCase();
  const match = /^EXC-([123])-(\d{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(code);
  if (!match) return invalid();
  const [, level, date, check, random] = match;
  let hash = 0;
  const source = `${level}-${date}-${random}-csp-coach-2025`;
  for (let i = 0; i < source.length; i++) hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let value = Math.abs(hash), expected = '';
  for (let i = 0; i < 4; i++) { expected = alphabet[value % alphabet.length] + expected; value = Math.floor(value / alphabet.length); }
  if (check !== expected) return invalid();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = `${String(beijing.getUTCMonth() + 1).padStart(2, '0')}${String(beijing.getUTCDate()).padStart(2, '0')}`;
  if (date !== today) return { type: 'error', message: '此优秀码已过期（仅当天有效，按北京时间）' };
  return { level, code };
}

/** No fetch/device ID. Wallet, experience and the legacy dedupe key commit as
 * one recoverable transaction, also included by the existing backup collector. */
export async function redeemExcellenceCode(input: string): Promise<Result> {
  const validation = validateExcellenceCode(input);
  if ('type' in validation) return validation;
  try {
    return await withPartnerReadLock(() => {
      recoverPartnerTransaction();
      recoverEquipmentTransaction();
      const used: unknown = JSON.parse(localStorage.getItem('csp_used_exc_codes') || '[]');
      if (!Array.isArray(used) || used.some(code => typeof code !== 'string')) throw new Error('优秀码记录异常，请保留备份后重试');
      if (used.some(code => code.trim().toUpperCase() === validation.code)) return { type: 'already', message: '此优秀码已被使用' };
      const state = usePetStore.getState();
      if (!state.loaded) throw new Error('正在恢复学习资料，请稍后再试');
      const saved = JSON.parse(localStorage.getItem('csp_pet_data') || 'null');
      if (!saved || !Array.isArray(saved.ownedPets) || !Number.isSafeInteger(saved.coins)
        || saved.coins < 0 || !Number.isSafeInteger(saved.expPool ?? 0) || (saved.expPool ?? 0) < 0) throw new Error('学习资料尚未完整保存，请重新打开应用后重试');
      const reward = EXCELLENCE_REWARDS[validation.level];
      const at = new Date().toISOString();
      const active = saved.ownedPets.find((pet: OwnedPet) => pet.petId === saved.activePetId);
      // Match addExp's existing 30% pet / 70% pool split and mood modifier.
      // Without an active pet, retain all experience in the pool instead of losing it.
      const petShare = active ? Math.floor(reward.exp * 0.3) : 0;
      const expPool = (saved.expPool ?? 0) + reward.exp - petShare;
      const ownedPets = saved.ownedPets.map((pet: OwnedPet) => {
        if (pet !== active) return pet;
        let { exp, expToNext, level } = pet;
        if (![exp, expToNext, level, pet.mood].every(Number.isFinite) || level < 1 || level > MAX_PET_LEVEL
          || exp < 0 || (level < MAX_PET_LEVEL && expToNext <= 0)) throw new Error('伙伴经验资料异常，请保留备份后重试');
        exp += Math.floor(petShare * (pet.mood >= 80 ? 1.2 : pet.mood <= 20 ? 0.8 : 1));
        while (level < MAX_PET_LEVEL && exp >= expToNext) {
          exp -= expToNext;
          level++;
          expToNext = Math.floor(expToNext * 1.3);
          if (level === MAX_PET_LEVEL) { exp = 0; expToNext = 0; }
        }
        return { ...pet, exp, expToNext, level, mood: Math.min(100, pet.mood + 3), updatedAt: at,
          battle: calculatePetBattleStats(pet.speciesId, level, pet.battle?.currentHp, resolvePartnerQuality(pet)) };
      });
      const coins = saved.coins + reward.coins;
      if (!Number.isSafeInteger(coins) || !Number.isSafeInteger(expPool)) throw new Error('奖励数值异常，请重试');
      const maxCoinBalance = Math.max(Number(saved.maxCoinBalance) || 0, coins);
      const next = { ...saved, coins, maxCoinBalance, ownedPets, expPool, savedAt: at };
      if (!commitLocalSnapshots({ csp_pet_data: JSON.stringify(next), csp_used_exc_codes: JSON.stringify([...used, validation.code]) },
        { csp_pet_data: 'pet_data' })) throw new Error('奖励未能保存，未消耗优秀码，请稍后重试');
      usePetStore.setState({ coins, maxCoinBalance, ownedPets, expPool });
      emit('pet-data-sync', next).catch(() => {});
      return { type: 'success', message: `${reward.label} 优秀学生奖励！\n+${reward.exp} EXP  +${reward.coins} 金币${active ? '' : '\n经验已存入经验池'}` };
    });
  } catch (error) {
    return { type: 'error', message: error instanceof Error ? error.message : '奖励保存失败，请稍后重试' };
  }
}
