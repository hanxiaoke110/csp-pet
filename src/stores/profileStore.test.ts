import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
});

import { DEFAULT_OWNED_WARDROBE } from '../data/wardrobe';
import { usePetStore } from './petStore';
import { NICKNAME_CHANGE_COST, useProfileStore } from './profileStore';

const resetProfile = () => useProfileStore.setState({
  initialized: false,
  nickname: '小小探索家',
  nicknameChanges: 0,
  ownedItemIds: [...DEFAULT_OWNED_WARDROBE],
  equipped: {
    avatar: null,
    frame: 'frame-none',
    background: 'background-midnight',
    pendant: 'pendant-none',
    effect: 'effect-none',
    title: 'title-apprentice',
  },
  journal: {},
  loaded: true,
});

describe('profileStore', () => {
  beforeEach(() => {
    values.clear();
    usePetStore.setState({ coins: 1000 });
    resetProfile();
  });

  it('initial setup permanently grants one zodiac and one constellation for free', () => {
    expect(useProfileStore.getState().initialize('avatar-zodiac-rat', 'avatar-constellation-aries')).toBe(true);
    expect(useProfileStore.getState().ownedItemIds).toEqual(expect.arrayContaining(['avatar-zodiac-rat', 'avatar-constellation-aries']));
    expect(useProfileStore.getState().equipped.avatar).toBe('avatar-zodiac-rat');
    expect(usePetStore.getState().coins).toBe(1000);
    expect(useProfileStore.getState().initialize('avatar-zodiac-ox', 'avatar-constellation-taurus')).toBe(false);
  });

  it('shows coin items as a one-time permanent purchase and never charges twice', () => {
    expect(useProfileStore.getState().purchase('avatar-zodiac-tiger')).toEqual({ ok: true });
    expect(usePetStore.getState().coins).toBe(700);
    expect(useProfileStore.getState().purchase('avatar-zodiac-tiger')).toEqual({ ok: false, reason: 'owned' });
    expect(usePetStore.getState().coins).toBe(700);
  });

  it('does not sell condition-only rewards', () => {
    expect(useProfileStore.getState().purchase('frame-scholar')).toEqual({ ok: false, reason: 'not-for-sale' });
    expect(usePetStore.getState().coins).toBe(1000);
  });

  it('makes the first nickname change free and charges later changes', () => {
    expect(useProfileStore.getState().changeNickname('星河小队长')).toEqual({ ok: true, cost: 0 });
    expect(usePetStore.getState().coins).toBe(1000);
    expect(useProfileStore.getState().changeNickname('算法探险家')).toEqual({ ok: true, cost: NICKNAME_CHANGE_COST });
    expect(usePetStore.getState().coins).toBe(1000 - NICKNAME_CHANGE_COST);
  });

  it('persists the local journal in the profile snapshot for backup restore', () => {
    useProfileStore.getState().setJournal('2026-09-16', '今天学会了二分查找。');
    const saved = JSON.parse(values.get('csp_profile_data') || '{}');
    expect(saved.journal['2026-09-16']).toBe('今天学会了二分查找。');
  });

  it('keeps ownership ids for future online items before their catalog is downloaded', async () => {
    values.set('csp_profile_data', JSON.stringify({
      initialized: true,
      nickname: '星河旅人',
      nicknameChanges: 1,
      ownedItemIds: ['avatar-online-comet-01'],
      equipped: { avatar: 'avatar-online-comet-01' },
      journal: {},
    }));
    await useProfileStore.getState().load();
    expect(useProfileStore.getState().ownedItemIds).toContain('avatar-online-comet-01');
    expect(useProfileStore.getState().equipped.avatar).toBe('avatar-online-comet-01');
  });
});
