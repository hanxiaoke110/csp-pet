import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateFirstExplorationMap } from '../utils/explorationLogic';
import { useExplorationStore } from './explorationStore';
import { useTrialEquipmentStore } from './trialEquipmentStore';

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  useExplorationStore.setState({ current: null });
  useTrialEquipmentStore.setState({
    ownedItems: [],
    equippedWeaponId: null,
    equippedArmorId: null,
    equippedArtifactId: null,
    soulFragments: 0,
  });
});

describe('迷雾探索存档与结算', () => {
  it('同一事件和同一次结算都不能重复领取', () => {
    const map = generateFirstExplorationMap();
    const store = useExplorationStore.getState();
    store.reset(map, ['q1', 'q2', 'q3']);

    useExplorationStore.getState().resolveEvent('seal-1', { sealsSolved: 1, pendingExp: 4 });
    useExplorationStore.getState().resolveEvent('seal-1', { sealsSolved: 2, pendingExp: 8 });
    expect(useExplorationStore.getState().current).toMatchObject({ sealsSolved: 1, pendingExp: 4 });

    useExplorationStore.getState().markSettled(7, 12);
    useExplorationStore.getState().markSettled(99, 99);
    expect(useExplorationStore.getState().current).toMatchObject({
      settled: true,
      settledCoins: 7,
      settledExp: 12,
    });
  });

  it('重新加载时恢复位置、迷雾和题目，不创建第二份进度', () => {
    const map = generateFirstExplorationMap();
    const firstFloor = map.tiles.flatMap((row, y) => row.map((value, x) => ({ value, x, y })))
      .find(cell => cell.value === 0 && Math.abs(cell.x - map.start.x) + Math.abs(cell.y - map.start.y) === 1);
    expect(firstFloor).toBeTruthy();

    useExplorationStore.getState().reset(map, ['q1', 'q2', 'q3']);
    useExplorationStore.getState().move(map, { x: firstFloor!.x, y: firstFloor!.y });
    const saved = useExplorationStore.getState().current;
    useExplorationStore.setState({ current: null });
    useExplorationStore.getState().load(map, ['other-1', 'other-2', 'other-3']);

    expect(useExplorationStore.getState().current).toEqual(saved);
  });

  it('净化减益和消耗玉符都只能成功一次', () => {
    const map = generateFirstExplorationMap();
    useExplorationStore.getState().reset(map, ['q1', 'q2', 'q3']);
    useExplorationStore.getState().resolveEvent('trap-1', { activeDebuffs: ['fogged-vision'] });
    useTrialEquipmentStore.getState().grantItem('cleansing-talisman');
    const talisman = useTrialEquipmentStore.getState().ownedItems[0];

    expect(useExplorationStore.getState().clearDebuff('fogged-vision')).toBe(true);
    expect(useExplorationStore.getState().clearDebuff('fogged-vision')).toBe(false);
    expect(useTrialEquipmentStore.getState().consumeItem(talisman.id)).toBe(true);
    expect(useTrialEquipmentStore.getState().consumeItem(talisman.id)).toBe(false);
    expect(useTrialEquipmentStore.getState().ownedItems).toEqual([]);
  });

  it('旧探索存档会补齐玉简字段，路线选择与线索不能重复写入', () => {
    const map = generateFirstExplorationMap();
    const legacy = {
      schemaVersion: 1, mapId: map.id, position: map.start,
      revealed: ['0,0'], resolvedEventIds: [], questionIds: ['q1', 'q2', 'q3'],
      sealsSolved: 0, sealsWrong: 0, steps: 0, pendingCoins: 0, pendingExp: 0,
      activeDebuffs: [], completed: false, settled: false, startedAt: Date.now(),
    };
    values.set('csp_dungeon_exploration_v1', JSON.stringify(legacy));
    useExplorationStore.getState().load(map, ['other']);
    expect(useExplorationStore.getState().current?.previewedEventIds).toEqual([]);

    useExplorationStore.getState().previewEvent('seal-2');
    useExplorationStore.getState().previewEvent('seal-2');
    useExplorationStore.getState().chooseRoute('safe');
    useExplorationStore.getState().chooseRoute('challenge');
    expect(useExplorationStore.getState().current).toMatchObject({
      previewedEventIds: ['seal-2'],
      routeChoice: 'safe',
    });
  });

  it('分别保存多张地图，切换关卡不会覆盖已有探索进度', () => {
    const first = generateFirstExplorationMap('first');
    const second = { ...generateFirstExplorationMap('second'), id: 'season-2:dungeon-02:dungeon-02-stage-01' };
    useExplorationStore.getState().reset(first, ['q1', 'q2', 'q3']);
    useExplorationStore.getState().resolveEvent('seal-1', { sealsSolved: 1 });
    useExplorationStore.getState().reset(second, ['q4', 'q5', 'q6']);
    useExplorationStore.getState().resolveEvent('seal-2', { sealsSolved: 1 });

    useExplorationStore.getState().load(first, ['other']);
    expect(useExplorationStore.getState().current?.resolvedEventIds).toEqual(['seal-1']);
    useExplorationStore.getState().load(second, ['other']);
    expect(useExplorationStore.getState().current?.resolvedEventIds).toEqual(['seal-2']);
  });

  it('武器、护甲和法器独立自动装备并持久化', () => {
    const store = useTrialEquipmentStore.getState();
    store.grantItem('xuanwu-hammer-common');
    store.grantItem('xuanwu-armor-common');
    store.grantItem('compass-common');

    const equipped = useTrialEquipmentStore.getState();
    expect(equipped.equippedWeaponId).toBe(equipped.ownedItems.find(item => item.definitionId === 'xuanwu-hammer-common')?.id);
    expect(equipped.equippedArmorId).toBe(equipped.ownedItems.find(item => item.definitionId === 'xuanwu-armor-common')?.id);
    expect(equipped.equippedArtifactId).toBe(equipped.ownedItems.find(item => item.definitionId === 'compass-common')?.id);

    useTrialEquipmentStore.setState({
      ownedItems: [],
      equippedWeaponId: null,
      equippedArmorId: null,
      equippedArtifactId: null,
      soulFragments: 0,
    });
    useTrialEquipmentStore.getState().load();
    expect(useTrialEquipmentStore.getState()).toMatchObject({
      equippedWeaponId: equipped.equippedWeaponId,
      equippedArmorId: equipped.equippedArmorId,
      equippedArtifactId: equipped.equippedArtifactId,
    });
  });
});
