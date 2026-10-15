import { describe, expect, it, vi } from 'vitest';
import { battleResolution, createImpactLifecycle, effectiveVisualMode } from './battleVisuals';

describe('battle visuals', () => {
  it('keeps the logical stage sharp within a 3840 × 2160 backing budget', () => {
    expect(battleResolution(1920, 1080, 2)).toBe(3);
    expect(battleResolution(640, 360, 2)).toBe(1);
    expect(battleResolution(1280, 720, 1.5)).toBe(1.5);
    expect(battleResolution(9000, 8000, 8)).toBe(3);
  });
  it('settles an impact once and drops cancelled effects without damage', () => {
    const impact = vi.fn();
    const effect = createImpactLifecycle(impact);
    effect.impact(); effect.impact(); effect.cancel();
    expect(impact).toHaveBeenCalledTimes(1);
    const interrupted = createImpactLifecycle(impact);
    interrupted.cancel(); interrupted.impact();
    expect(impact).toHaveBeenCalledTimes(1);
    expect(effectiveVisualMode('full', true)).toBe('simple');
  });
});
