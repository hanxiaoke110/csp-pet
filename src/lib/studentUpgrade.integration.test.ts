import { beforeEach, expect, it, vi } from 'vitest';
import { buildBackup, applyBackup, parseBackup } from './backup';
import { usePetStore as wallet } from '../stores/petStore';
import { useTrialEquipmentStore as equipment } from '../../src-dungeon/stores/trialEquipmentStore';
import { useCollectorCardStore as cards } from '../stores/collectorCardStore';
import { useProfileStore as profile } from '../stores/profileStore';
import { DEFAULT_FOCUS_SETTINGS, useFocusStore as focus } from '../stores/focusStore';
import { applyWeaponDamage, applyArmorReduction } from '../../src-dungeon/utils/equipmentCombat';
import { useDungeonStore as dungeon } from '../../src-dungeon/stores/dungeonStore';
import type { BattleState } from '../../src-dungeon/types/dungeon';

vi.mock('@tauri-apps/api/event', () => ({ emit: async () => {} }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => { throw new Error('No native bridge in integration test'); } }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '1.7.49' }));
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('window', {});
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline test'); }));
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, String(v)); }, removeItem: (k: string) => { values.delete(k); },
  });
  equipment.setState({ ownedItems: [], equippedWeaponId: null, equippedArmorId: null, equippedArtifactId: null, materials: {}, materialClaims: [], soulFragments: 0 });
  wallet.setState({ loaded: false, ownedPets: [], coins: 200, activePetId: null, trialCoinSettlements: [] });
});

it('旧用户升级→购买→装备→战斗结算→探索材料→强化→分解完整链路', async () => {
  localStorage.setItem('csp_pet_data', JSON.stringify({ ownedPets: [], coins: 3000, gachaRewardMigrationDone: true }));
  localStorage.setItem('csp_trial_equipment_v1', JSON.stringify({ ownedItems: [{ id: 'old', definitionId: 'xuanwu-hammer-common', quantity: 1 }], equippedWeaponId: 'old' }));
  await wallet.getState().load(); equipment.getState().load();
  expect(wallet.getState().coins).toBe(3000);
  expect(equipment.getState().equippedWeaponId).toBe('old');
  expect(equipment.getState().buyItem('fire-weapon-legendary').ok).toBe(true);
  const weapon = equipment.getState().ownedItems.find(i => i.definitionId === 'fire-weapon-legendary')!;
  expect(equipment.getState().buyItem('fire-armor-rare').ok).toBe(true);
  const armor = equipment.getState().ownedItems.find(i => i.definitionId === 'fire-armor-rare')!;
  equipment.getState().equipItem(weapon.id); equipment.getState().equipItem(armor.id);
  expect(applyWeaponDamage(100, { element: 'fire', level: weapon.upgradeLevel! }, 'wind')).toBe(126);
  expect(applyArmorReduction(100, { element: 'fire', level: armor.upgradeLevel! }, 'wind')).toBe(90);
  const battle: BattleState = {
    battleId: 'integration-clear', dungeonId: 'dungeon-01', stageId: 'dungeon-01-stage-01',
    questions: [], currentQuestionIndex: 0, hp: 100, maxHp: 100, correctCount: 3, wrongCount: 0, comboCount: 3,
    startTime: Date.now(), isBoss: false, isFinished: true, isWon: true, expEarned: 0, goldEarned: 0, rating: 'B',
    enemyHp: 0, enemyMaxHp: 100, currentTurn: 'player', roundCount: 8, skillUsages: [], usedSkillIds: [],
    energy: 0, maxEnergy: 5, shield: 0, enemyIntent: null, burnStacks: [],
  };
  dungeon.setState({ battle, currentBattleEarnsRewards: false, dungeonProgress: [{ dungeonId: 'dungeon-01', status: 'unlocked', completedStages: 1, totalStages: 5, currentStageId: null, bossDefeated: false, bestScore: 0, bestRating: 'D' }] });
  const reward = dungeon.getState().finalizeBattle('dungeon-01', false)!;
  expect(reward.petCoinsEarned).toBeGreaterThanOrEqual(50);
  const earned = reward.petCoinsEarned!;
  expect(dungeon.getState().finalizeBattle('dungeon-01', false)).toBeNull();
  expect(equipment.getState().claimExplorationMaterials('integration-map', [{ materialId: 'fire-crystal', amount: 16 }])).toBe(true);
  expect(equipment.getState().upgradeItem(weapon.id).ok).toBe(true);
  expect(applyWeaponDamage(100, { element: 'fire', level: equipment.getState().ownedItems.find(i => i.id === weapon.id)!.upgradeLevel! }, 'wind')).toBe(132);
  expect(equipment.getState().dismantleItem(weapon.id).ok).toBe(false);
  equipment.getState().unequipItem(weapon.id);
  expect(equipment.getState().dismantleItem(weapon.id)).toEqual({ ok: true, refundedCoins: 816 });
  expect(wallet.getState().coins).toBe(3000 - 950 - 220 + earned - 70 + 816);
  expect(equipment.getState().materials['fire-crystal']).toBe(12);
  expect(equipment.getState().ownedItems.some(i => i.id === 'old')).toBe(true);
  await wallet.getState().load(); equipment.getState().load();
  expect(equipment.getState().equippedArmorId).toBe(armor.id);
  expect(wallet.getState().trialCoinSettlements).toContain('integration-clear');
});

it('真实导出再导入：智子、金币、装备、典藏卡、衣橱、专注与迷宫记录一并恢复', async () => {
  const pet = { petId: 'existing-capi', speciesId: 'capi', petName: '老伙伴', element: 'earth', level: 8, exp: 35, expToNext: 100, hunger: 80, mood: 90, affection: 60, obtainedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
  localStorage.setItem('csp_pet_data', JSON.stringify({ ownedPets: [pet], activePetId: pet.petId, coins: 18888, gachaRewardMigrationDone: true, trialCoinSettlements: ['prior-clear'] }));
  localStorage.setItem('csp_trial_equipment_v1', JSON.stringify({ schemaVersion: 2, ownedItems: [{ id: 'saved-weapon', definitionId: 'fire-weapon-legendary', quantity: 1, upgradeLevel: 3, purchasePrice: 950, investedCoins: 315 }], equippedWeaponId: 'saved-weapon', materials: { 'fire-crystal': 12 }, materialClaims: ['saved-map'] }));
  const ownedCards = [{ cardId: 'furina-water-stage-002', acquiredAt: '2026-10-01T00:00:00Z' }];
  localStorage.setItem('csp_collector_cards_v1', JSON.stringify({ ownedCards }));
  localStorage.setItem('csp_profile_data', JSON.stringify({ initialized: true, nickname: '星河', nicknameChanges: 2, ownedItemIds: ['frame-canglong-leihuan'], equipped: { frame: 'frame-canglong-leihuan' }, journal: { '2026-10-01': '今天学会了二分' } }));
  localStorage.setItem('csp_focus_data', JSON.stringify({ settings: DEFAULT_FOCUS_SETTINGS, activeSession: null, archivedDaily: [], recentGoals: ['阅读'], records: [{ id: 'reading', goal: '阅读', plannedSeconds: 900, focusedSeconds: 900, startedAt: '2026-10-01T00:00:00Z', endedAt: '2026-10-01T00:15:00Z', outcome: 'completed', endedEarly: false }] }));
  const maze = JSON.stringify({ maps: { 'saved-map': { playerPosition: { x: 3, y: 4 }, sealResults: { a: true } } } });
  localStorage.setItem('csp_dungeon_exploration_v1', maze);
  localStorage.setItem('csp_equipment_catalog_cache_v1', '{}');
  const exported = await buildBackup();
  expect(exported.localStorage.csp_equipment_catalog_cache_v1).toBeUndefined();
  const parsed = parseBackup(JSON.stringify(exported));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error);
  values.clear();
  await applyBackup(parsed.data);
  await wallet.getState().load(); equipment.getState().load();
  await cards.getState().load(); await profile.getState().load(); await focus.getState().load();
  expect(wallet.getState()).toMatchObject({ coins: 18888, activePetId: pet.petId, trialCoinSettlements: ['prior-clear'] });
  expect(wallet.getState().ownedPets[0]).toMatchObject({ petId: pet.petId, level: 8, exp: 35 });
  expect(equipment.getState().ownedItems[0]).toMatchObject({ upgradeLevel: 3, purchasePrice: 950, investedCoins: 315 });
  expect(equipment.getState().materials['fire-crystal']).toBe(12);
  expect(cards.getState().ownedCards).toEqual(ownedCards);
  expect(profile.getState()).toMatchObject({ nickname: '星河', nicknameChanges: 2, equipped: { frame: 'frame-canglong-leihuan' }, journal: { '2026-10-01': '今天学会了二分' } });
  expect(focus.getState().records[0]).toMatchObject({ goal: '阅读', focusedSeconds: 900 });
  expect(localStorage.getItem('csp_dungeon_exploration_v1')).toBe(maze);
});
