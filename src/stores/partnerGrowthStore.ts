import { create } from 'zustand';
import { emit } from '@tauri-apps/api/event';
import { dualLoad } from '../lib/persist';
import { commitLocalSnapshots, recoverPartnerTransaction } from '../lib/partnerTransactions';
import { recoverEquipmentTransaction } from '../lib/equipmentTransactions';
import { ascensionOffer, ascensionRefund, resolvePartnerQuality } from '../utils/partnerQuality';
import { estimateAcquisitionCost, usePetStore } from './petStore';
import type { PartnerGrowthSnapshot } from '../types/partnerGrowth';
import type { PetTier } from '../types/pet';
import { canonicalGrowthQuestionId, PARTNER_GROWTH_KEY, PARTNER_GROWTH_SQLITE_KEY, validGrowthInteger as validInteger, validGrowthId, validateGrowthSnapshot, parseGrowthJson as parse, migrateLegacyGrowth } from '../utils/partnerGrowth';
export { PARTNER_GROWTH_KEY, PARTNER_GROWTH_SQLITE_KEY, validateGrowthSnapshot, validGrowthId } from '../utils/partnerGrowth';
function persist(snapshot: PartnerGrowthSnapshot) {
  const ok = validateGrowthSnapshot(snapshot) && commitLocalSnapshots({ [PARTNER_GROWTH_KEY]: JSON.stringify(snapshot) },
    { [PARTNER_GROWTH_KEY]: PARTNER_GROWTH_SQLITE_KEY });
  if (ok) emit('partner-growth-sync', snapshot).catch(() => {});
  return ok;
}
type Result = { ok: boolean; message: string };
interface PartnerGrowthState {
  loaded: boolean;
  snapshot: PartnerGrowthSnapshot | null;
  error: string;
  load: () => Promise<void>;
  refresh: () => boolean;
  recordCorrect: (canonicalQuestionId: string) => Promise<boolean>;
  completeMaze: (mapId: string) => Promise<boolean>;
  ascend: (petId: string, expectedQuality: PetTier) => Result;
}
let loading: Promise<void> | null = null;
let transacting = false;
export const usePartnerGrowthStore = create<PartnerGrowthState>((set, get) => ({
  loaded: false, snapshot: null, error: '',
  refresh: () => {
    try {
      recoverPartnerTransaction();
      const snapshot = parse(localStorage.getItem(PARTNER_GROWTH_KEY));
      if (!validateGrowthSnapshot(snapshot)) return false;
      set({ loaded: true, snapshot, error: '' });
      return true;
    } catch { set({ error: '成长资料恢复失败，请重试' }); return false; }
  },
  load: async () => {
    if (get().loaded) return;
    if (loading) return loading;
    loading = (async () => {
      try {
        recoverPartnerTransaction();
        recoverEquipmentTransaction();
        const raw = await dualLoad(PARTNER_GROWTH_SQLITE_KEY, PARTNER_GROWTH_KEY);
        if (raw) {
          const snapshot = parse(raw);
          if (!validateGrowthSnapshot(snapshot)) throw new Error('星砂存档异常，请保留备份后重试');
          // dualLoad can select SQLite; establish that exact snapshot as local authority.
          localStorage.setItem(PARTNER_GROWTH_KEY, raw);
          set({ loaded: true, snapshot, error: '' });
          return;
        }
        const quizRaw = await dualLoad('quiz_state', 'csp_quiz_state');
        const snapshot = migrateLegacyGrowth(quizRaw, localStorage.getItem('dungeon_player'), localStorage.getItem('csp_dungeon_exploration_v1'));
        if (!persist(snapshot)) throw new Error('星砂资料未能保存，请检查存储空间');
        set({ loaded: true, snapshot, error: '' });
      } catch (error) { set({ error: error instanceof Error ? error.message : '星砂资料恢复失败' }); }
    })();
    try { await loading; } finally { loading = null; }
  },
  recordCorrect: async (canonicalQuestionId) => {
    if (!validGrowthId(canonicalQuestionId)) return false;
    canonicalQuestionId = canonicalGrowthQuestionId(canonicalQuestionId);
    await get().load();
    if (!get().refresh()) return false;
    const s = get().snapshot;
    if (!get().loaded || !s || s.firstCorrectIds.includes(canonicalQuestionId) || s.firstCorrectIds.length >= 200_000) return false;
    const firstCorrectIds = [...s.firstCorrectIds, canonicalQuestionId];
    const snapshot = { ...s, firstCorrectIds, starSand: s.starSand + (firstCorrectIds.length % 20 === 0 ? 1 : 0), savedAt: new Date().toISOString() };
    if (!persist(snapshot)) { set({ error: '星砂资料未能保存，请重试' }); return false; }
    set({ snapshot, error: '' });
    return true;
  },
  completeMaze: async (mapId) => {
    if (!validGrowthId(mapId)) return false;
    await get().load();
    if (!get().refresh()) return false;
    const s = get().snapshot;
    if (!get().loaded || !s || s.claimedMapIds.includes(mapId) || s.claimedMapIds.length >= 200_000) return false;
    const snapshot = { ...s, claimedMapIds: [...s.claimedMapIds, mapId], starSand: s.starSand + 1, savedAt: new Date().toISOString() };
    if (!persist(snapshot)) { set({ error: '星砂资料未能保存，请重试' }); return false; }
    set({ snapshot, error: '' });
    return true;
  },
  ascend: (petId, expectedQuality) => {
    const failure = (message: string): Result => ({ ok: false, message });
    if (transacting || !get().loaded || !usePetStore.getState().loaded) return failure('正在恢复伙伴资料，请稍后再试');
    transacting = true;
    try {
      recoverPartnerTransaction(); recoverEquipmentTransaction();
      const state = usePetStore.getState();
      const raw = parse(localStorage.getItem('csp_pet_data'));
      // Only durable pets participate: another window may train, acquire or recycle
      // without changing its wallet or the quality shown by this window.
      const pet = Array.isArray(raw?.ownedPets) ? raw.ownedPets.find((item: any) => item.petId === petId) : undefined;
      const growth = get().snapshot;
      if (!pet || !growth || resolvePartnerQuality(pet) !== expectedQuality) return failure('伙伴品质已变化，请重新查看');
      const offer = ascensionOffer(expectedQuality);
      if (!offer) return failure('已经是传说品质');
      if (!Number.isSafeInteger(pet.level) || pet.level < offer.level || pet.level > 20 || !Number.isFinite(pet.affection) || pet.affection < offer.affection || pet.affection > 100) return failure('等级或亲密度尚未达到条件');
      if (pet.ascensionHistory !== undefined && (!Array.isArray(pet.ascensionHistory)
        || pet.ascensionHistory.length > 1 || (pet.ascensionHistory.length > 0 && ascensionRefund(pet) === 0))) return failure('伙伴升华记录异常，请保留备份后重试');
      if (!validInteger(state.coins) || state.coins < offer.coins || growth.starSand < offer.sand) return failure('金币或星砂不足');
      const durableGrowth = parse(localStorage.getItem(PARTNER_GROWTH_KEY));
      if (raw.coins !== state.coins
        || JSON.stringify(durableGrowth) !== JSON.stringify(growth)) return failure('资料已更新，请重新打开伙伴面板');
      const at = new Date().toISOString();
      const upgraded = state.ensureBattleStats({ ...pet, quality: offer.target,
        originalAcquisitionCost: estimateAcquisitionCost(pet),
        ascensionHistory: [...(pet.ascensionHistory || []), { from: expectedQuality, to: offer.target, coins: offer.coins, sand: offer.sand, at }], updatedAt: at });
      const ownedPets = raw.ownedPets.map((item: any) => item.petId === petId ? upgraded : item);
      const snapshot = { ...growth, starSand: growth.starSand - offer.sand, savedAt: at };
      const nextPet = { ...raw, ownedPets, coins: state.coins - offer.coins, savedAt: at };
      if (!commitLocalSnapshots({ csp_pet_data: JSON.stringify(nextPet), [PARTNER_GROWTH_KEY]: JSON.stringify(snapshot) },
        { csp_pet_data: 'pet_data', [PARTNER_GROWTH_KEY]: PARTNER_GROWTH_SQLITE_KEY })) return failure('升华未能保存，未扣除材料，请重试');
      usePetStore.setState({ ownedPets, coins: nextPet.coins });
      set({ snapshot, error: '' });
      emit('pet-data-sync', nextPet).catch(() => {});
      emit('partner-growth-sync', snapshot).catch(() => {});
      return { ok: true, message: '升华成功！伙伴已获得新的品质' };
    } catch { return failure('升华保存失败，请重试'); }
    finally { transacting = false; }
  },
}));
