import type { WardrobeConditionExpression, WardrobeItem, WardrobeMetric } from '../types/profile';

function readSet(key: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch { return new Set(); }
}

function readObject(key: string): Record<string, unknown> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function collectWardrobeMetrics(cardCount: number): Record<WardrobeMetric, number> {
  const quiz = readObject('csp_quiz_state');
  const pet = readObject('csp_pet_data');
  const pets = Array.isArray(pet.ownedPets) ? pet.ownedPets as Array<{ affection?: number }> : [];
  const exploration = readObject('csp_dungeon_exploration_v1');
  const maps = exploration.maps && typeof exploration.maps === 'object'
    ? Object.values(exploration.maps as Record<string, { mapId?: string; completed?: boolean }>)
    : [];
  const cleared = maps.filter(map => map?.completed);
  const coveredDungeons = new Set(cleared.map(map => String(map.mapId || '').split(':')[1]).filter(Boolean));
  const achievements = new Set([...readSet('csp_achievement_unlocked'), ...readSet('csp_achievement_claimed')]);
  return {
    quizCorrect: Math.max(0, Number(quiz.totalCorrect) || 0),
    highestPetAffection: Math.max(0, ...pets.map(entry => Number(entry.affection) || 0)),
    collectorCardCount: Math.max(0, Number(cardCount) || 0),
    mazeClearCount: cleared.length,
    dungeonMazeCoverage: coveredDungeons.size,
    achievementCount: achievements.size,
  };
}

export function evaluateWardrobeCondition(
  condition: WardrobeConditionExpression,
  metrics: Record<WardrobeMetric, number>,
): boolean {
  if (condition.type === 'all') return condition.rules.every(rule => evaluateWardrobeCondition(rule, metrics));
  if (condition.type === 'any') return condition.rules.some(rule => evaluateWardrobeCondition(rule, metrics));
  const current = metrics[condition.metric] || 0;
  return condition.operator === 'eq' ? current === condition.value : current >= condition.value;
}

export function isWardrobeConditionMet(item: WardrobeItem, cardCount: number): boolean {
  if (item.acquisition.type !== 'condition') return false;
  if (item.acquisition.condition) {
    return evaluateWardrobeCondition(item.acquisition.condition, collectWardrobeMetrics(cardCount));
  }
  if (item.acquisition.achievementId) {
    const ids = [item.acquisition.achievementId, ...(item.acquisition.legacyAchievementIds || [])];
    const claimed = readSet('csp_achievement_claimed');
    const unlocked = readSet('csp_achievement_unlocked');
    return ids.some(id => claimed.has(id) || unlocked.has(id));
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
