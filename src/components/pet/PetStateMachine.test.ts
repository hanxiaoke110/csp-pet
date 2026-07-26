import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStateMachine, tick, triggerAnim } from './PetStateMachine';

describe('PetStateMachine', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => vi.restoreAllMocks());

  it('honors an event-specific duration instead of the default duration', () => {
    const state = createStateMachine();
    triggerAnim(state, 'interact', 500);

    now = 300;
    expect(tick(state, 100)).toBe('interact');
    now = 799;
    expect(tick(state, 100)).toBe('interact');
    now = 800;
    expect(tick(state, 100)).toBe('idle');
  });

  it('returns to idle after a directional movement state finishes', () => {
    const state = createStateMachine();
    triggerAnim(state, 'walk-left', 500);

    now = 300;
    expect(tick(state, 100)).toBe('walk-left');
    now = 800;
    expect(tick(state, 100)).toBe('idle');
  });
});
