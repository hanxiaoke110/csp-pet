// Pet state machine — pure logic, no rendering
export type PetAnimState = 'idle' | 'walk' | 'sleep' | 'celebrate' | 'think' | 'eat' | 'unhappy';

interface PetStateMachine {
  current: PetAnimState;
  timer: number;
  lastEvent: number;
  sleeping: boolean;
}

const IDLE_TIMEOUT = 15000;   // 15s idle → walk
const SLEEP_TIMEOUT = 86400000;  // 24h — effectively disable auto-sleep
const WALK_DURATION = 4000;   // Walk for 4s

export function createStateMachine(): PetStateMachine {
  return {
    current: 'idle',
    timer: 0,
    lastEvent: Date.now(),
    sleeping: false,
  };
}

export function tick(sm: PetStateMachine, deltaMs: number): PetAnimState {
  sm.timer += deltaMs;
  const sinceEvent = Date.now() - sm.lastEvent;

  // Priority: event-driven states are set externally, don't auto-override
  if (sm.current === 'celebrate' || sm.current === 'eat' || sm.current === 'unhappy' || sm.current === 'think') {
    return sm.current;
  }

  // Sleeping
  if (sm.sleeping) {
    return 'sleep';
  }

  // Auto-sleep after long inactivity
  if (sinceEvent > SLEEP_TIMEOUT && sm.current !== 'walk') {
    sm.sleeping = true;
    sm.current = 'sleep';
    return 'sleep';
  }

  // Random walk
  if (sm.current === 'idle' && sm.timer > IDLE_TIMEOUT) {
    sm.timer = 0;
    sm.current = 'walk';
    return 'walk';
  }

  // End walk
  if (sm.current === 'walk' && sm.timer > WALK_DURATION) {
    sm.timer = 0;
    sm.current = 'idle';
    return 'idle';
  }

  return sm.current;
}

export function wakeUp(sm: PetStateMachine): void {
  sm.sleeping = false;
  sm.current = 'idle';
  sm.timer = 0;
  sm.lastEvent = Date.now();
}

export function triggerAnim(sm: PetStateMachine, anim: PetAnimState, durationMs = 3000): void {
  sm.sleeping = false;
  sm.current = anim;
  sm.timer = 0;
  sm.lastEvent = Date.now();
  // Auto-return to idle after duration
  setTimeout(() => {
    if (sm.current === anim) {
      sm.current = 'idle';
      sm.timer = 0;
    }
  }, durationMs);
}

export function updateLastEvent(sm: PetStateMachine): void {
  sm.lastEvent = Date.now();
}
