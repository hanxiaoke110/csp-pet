// Pet behavior queue. Visual assets can expose either the legacy CSP rows or
// the richer Codex rows; PetSprite resolves the latter to legacy fallbacks.
export type PetAnimState =
  | 'idle' | 'walk' | 'walk-left' | 'walk-right'
  | 'sleep' | 'celebrate' | 'think' | 'eat' | 'unhappy'
  | 'greet' | 'interact' | 'failed' | 'waiting' | 'working' | 'review';

interface AnimEvent {
  anim: PetAnimState;
  priority: number;
  durationMs: number;
  coalesceKey: string;
}

interface StateQueue {
  current: PetAnimState;
  currentDurationMs: number;
  queue: AnimEvent[];
  currentSince: number;
  lastEvent: number;
  sleeping: boolean;
}

const MIN_DWELL_MS = 250;
const MAX_QUEUE_SIZE = 20;
const SLEEP_TIMEOUT = 86_400_000;

const TRANSIENT_DURATIONS: Partial<Record<PetAnimState, number>> = {
  celebrate: 3000, think: 3000, eat: 3000, unhappy: 3000,
  greet: 2200, interact: 1800, failed: 2500, waiting: 4000, review: 3500,
};

const PRIORITY: Record<PetAnimState, number> = {
  idle: 0, sleep: 0, walk: 1, 'walk-left': 1, 'walk-right': 1,
  think: 2, eat: 2, greet: 2, interact: 2, waiting: 2, working: 2, review: 2,
  celebrate: 3, unhappy: 3, failed: 3,
};

export function createStateMachine(): StateQueue {
  return {
    current: 'idle', currentDurationMs: 0, queue: [], currentSince: Date.now(), lastEvent: Date.now(),
    sleeping: false,
  };
}

/** Call at a modest cadence (the sprite itself is CSS animated). */
export function tick(sm: StateQueue, _deltaMs: number): PetAnimState {
  const now = Date.now();
  let dwelled = now - sm.currentSince;

  if (sm.currentDurationMs > 0 && dwelled >= sm.currentDurationMs) {
    dequeueOrIdle(sm);
    dwelled = now - sm.currentSince;
  }

  if (sm.queue.length > 0 && dwelled >= MIN_DWELL_MS) {
    const next = sm.queue[0];
    if (next.priority >= PRIORITY[sm.current]) {
      sm.queue.shift();
      applyState(sm, next);
    }
  }

  if (sm.sleeping) return sm.current;

  if (now - sm.lastEvent > SLEEP_TIMEOUT && sm.queue.length === 0) {
    sm.sleeping = true;
    applyState(sm, makeEvent('sleep'));
    return sm.current;
  }

  return sm.current;
}

export function triggerAnim(sm: StateQueue, anim: PetAnimState, durationMs?: number): void {
  const event = makeEvent(anim, durationMs);
  const now = Date.now();

  // A fresh event of the currently playing type restarts its dwell rather than
  // adding a visually indistinguishable duplicate to the queue.
  if (sm.current === anim) {
    applyState(sm, event);
    sm.lastEvent = now;
    sm.sleeping = false;
    return;
  }

  const existing = sm.queue.findIndex(item => item.coalesceKey === event.coalesceKey);
  if (existing >= 0) sm.queue[existing] = event;
  else {
    if (sm.queue.length >= MAX_QUEUE_SIZE) sm.queue.shift();
    sm.queue.push(event);
  }
  sm.sleeping = false;
  sm.lastEvent = now;
}

export function wakeUp(sm: StateQueue): void {
  sm.sleeping = false;
  sm.lastEvent = Date.now();
  sm.queue = [];
  applyState(sm, makeEvent('idle'));
}

export function updateLastEvent(sm: StateQueue): void {
  sm.lastEvent = Date.now();
}

function makeEvent(anim: PetAnimState, durationMs?: number): AnimEvent {
  return {
    anim,
    priority: PRIORITY[anim],
    durationMs: durationMs ?? TRANSIENT_DURATIONS[anim] ?? 0,
    coalesceKey: `trigger:${anim}`,
  };
}

function applyState(sm: StateQueue, event: AnimEvent): void {
  sm.current = event.anim;
  sm.currentDurationMs = event.durationMs;
  sm.currentSince = Date.now();
}

function dequeueOrIdle(sm: StateQueue): void {
  const next = sm.queue.shift();
  if (next) {
    applyState(sm, next);
    return;
  }
  applyState(sm, makeEvent('idle'));
}
