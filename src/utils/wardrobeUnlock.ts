import type { WardrobeItem } from '../types/profile';

function readSet(key: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch { return new Set(); }
}

export function isWardrobeConditionMet(item: WardrobeItem, cardCount: number): boolean {
  if (item.acquisition.type !== 'condition') return false;
  if (item.acquisition.achievementId) {
    const id = item.acquisition.achievementId;
    return readSet('csp_achievement_claimed').has(id) || readSet('csp_achievement_unlocked').has(id);
  }
  if (item.acquisition.rule === 'two-cards') return cardCount >= 2;
  if (item.acquisition.rule === 'dungeon-crystal') {
    try {
      const inventory = JSON.parse(localStorage.getItem('dungeon_trial_inventory') || '{}');
      return Array.isArray(inventory?.ownedCosmetics) && inventory.ownedCosmetics.includes('frame-crystal');
    } catch { return false; }
  }
  return false;
}
