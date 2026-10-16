export type BattleVisualMode = 'full' | 'simple';
export const BATTLE_VISUAL_MODE_KEY = 'csp_battle_visual_mode_v1';
export const BATTLE_LAYOUT = {
  playerY: 200, nameOffsetY: 118, playerHpY: 360, energyY: 400, cardsY: 650,
} as const;
let memoryPreference: BattleVisualMode = 'full';

/** Logical coordinates remain 1280 × 720; cap the backing store at 8.3 MP. */
export function battleResolution(width: number, height: number, dpr: number): number {
  const ratio = Math.min(width / 1280, height / 720) * (Number.isFinite(dpr) ? dpr : 1);
  return Math.round(Math.max(1, Math.min(3, ratio || 1)) * 4) / 4;
}

export function effectiveVisualMode(preference: BattleVisualMode, reducedMotion: boolean): BattleVisualMode {
  return reducedMotion ? 'simple' : preference;
}

export function readBattleVisualMode(): BattleVisualMode {
  try {
    const stored = localStorage.getItem(BATTLE_VISUAL_MODE_KEY);
    return stored === 'simple' || stored === 'full' ? stored : memoryPreference;
  }
  catch { return memoryPreference; }
}

export function writeBattleVisualMode(mode: BattleVisualMode): void {
  memoryPreference = mode;
  try { localStorage.setItem(BATTLE_VISUAL_MODE_KEY, mode); } catch { /* Restricted storage: keep session preference. */ }
}

/** A cancelled scene must never receive a delayed damage callback. */
export function createImpactLifecycle(onImpact: () => void) {
  let settled = false;
  return {
    impact() { if (!settled) { settled = true; onImpact(); } },
    cancel() { settled = true; },
  };
}
