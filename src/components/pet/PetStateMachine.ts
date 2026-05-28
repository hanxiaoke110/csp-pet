// Pet animation state queue — coalescing, min-dwell, transient-state aware
// Pattern adapted from Petdex's state-queue.ts
export type PetAnimState = 'idle' | 'walk' | 'sleep' | 'celebrate' | 'think' | 'eat' | 'unhappy';

interface AnimEvent {
  anim: PetAnimState;
  priority: number;
  durationMs: number;   // 0 = persistent (idle/walk/sleep); >0 = transient
  coalesceKey: string;  // same key = same event type for dedup
}

interface StateQueue {
  current: PetAnimState;
  queue: AnimEvent[];
  currentSince: number;    // timestamp ms when current state started
  lastEvent: number;       // last user interaction timestamp
  sleeping: boolean;
  idleTimer: number;       // accumulated time in idle (real-time ms counter)
  walkTimer: number;       // accumulated time in walk
  nextWalkDelay: number;   // randomized delay before next auto-walk
}

// ─── Config ───
const MIN_DWELL_MS = 250;
const MAX_QUEUE_SIZE = 50;
const IDLE_TIMEOUT_MIN = 10000;   // min idle before auto-walk
const IDLE_TIMEOUT_MAX = 25000;   // max idle before auto-walk
const WALK_DURATION_MIN = 3000;
const WALK_DURATION_MAX = 6000;
const SLEEP_TIMEOUT = 86400000;   // 24h — effectively disable auto-sleep

// Transient state durations (auto-return to idle/persistent)
const TRANSIENT_DURATIONS: Partial<Record<PetAnimState, number>> = {
  celebrate: 3000,
  think: 4000,
  eat: 3000,
  unhappy: 3000,
};

// Priority: higher = more important, can interrupt lower-priority states
const PRIORITY: Record<PetAnimState, number> = {
  idle: 0,
  walk: 1,
  think: 2,
  eat: 2,
  celebrate: 3,
  unhappy: 3,
  sleep: 0,
};

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ─── Public API ───

export function createStateMachine(): StateQueue {
  return {
    current: 'idle',
    queue: [],
    currentSince: Date.now(),
    lastEvent: Date.now(),
    sleeping: false,
    idleTimer: 0,
    walkTimer: 0,
    nextWalkDelay: randBetween(IDLE_TIMEOUT_MIN, IDLE_TIMEOUT_MAX),
  };
}

/** Main tick — call every frame with elapsed ms. Returns the animation state to display. */
export function tick(sm: StateQueue, deltaMs: number): PetAnimState {
  const now = Date.now();
  const dwelled = now - sm.currentSince;

  // 1. If current is transient and its duration has elapsed, pop next or revert to idle
  const dur = TRANSIENT_DURATIONS[sm.current];
  if (dur && dwelled >= dur) {
    dequeueOrIdle(sm);
  }

  // 2. If queue has items and min dwell satisfied, dequeue (higher priority only)
  if (sm.queue.length > 0 && dwelled >= MIN_DWELL_MS) {
    const next = sm.queue[0];
    if (next.priority >= PRIORITY[sm.current]) {
      sm.queue.shift();
      applyState(sm, next);
    }
  }

  // 3. Sleeping
  if (sm.sleeping) {
    return sm.current;
  }

  // 4. Auto-sleep after extreme inactivity
  if (now - sm.lastEvent > SLEEP_TIMEOUT && sm.queue.length === 0) {
    if (!sm.sleeping && sm.current !== 'sleep') {
      sm.sleeping = true;
      applyState(sm, { anim: 'sleep', priority: 0, durationMs: 0, coalesceKey: 'auto:sleep' });
    }
    return 'sleep';
  }

  // 5. Auto idle↔walk cycle (only when queue is empty, not sleeping, not in transient)
  if (sm.queue.length === 0 && !TRANSIENT_DURATIONS[sm.current]) {
    if (sm.current === 'idle') {
      sm.idleTimer += deltaMs;
      if (sm.idleTimer >= sm.nextWalkDelay) {
        sm.idleTimer = 0;
        sm.walkTimer = 0;
        sm.nextWalkDelay = randBetween(IDLE_TIMEOUT_MIN, IDLE_TIMEOUT_MAX);
        applyState(sm, { anim: 'walk', priority: 1, durationMs: 0, coalesceKey: 'auto:walk' });
        return 'walk';
      }
    } else if (sm.current === 'walk') {
      sm.walkTimer += deltaMs;
      const walkLimit = randBetween(WALK_DURATION_MIN, WALK_DURATION_MAX);
      if (sm.walkTimer >= walkLimit) {
        sm.walkTimer = 0;
        applyState(sm, { anim: 'idle', priority: 0, durationMs: 0, coalesceKey: 'auto:idle' });
        return 'idle';
      }
    }
  }

  return sm.current;
}

/** Enqueue an animation with coalescing. Called by external events. */
export function triggerAnim(sm: StateQueue, anim: PetAnimState, durationMs?: number): void {
  const dur = durationMs ?? TRANSIENT_DURATIONS[anim] ?? 0;
  const prio = PRIORITY[anim];
  const key = `trigger:${anim}`;

  const event: AnimEvent = { anim, priority: prio, durationMs: dur, coalesceKey: key };

  // Coalesce: same as currently-displayed (within min dwell) → drop
  if (sm.current === anim && (Date.now() - sm.currentSince) < MIN_DWELL_MS) {
    return;
  }

  // Coalesce: same as last item in queue → replace (update timestamp)
  if (sm.queue.length > 0 && sm.queue[sm.queue.length - 1].coalesceKey === key) {
    sm.queue[sm.queue.length - 1] = event;
    return;
  }

  // Cap queue
  if (sm.queue.length >= MAX_QUEUE_SIZE) {
    sm.queue.shift();
  }

  sm.queue.push(event);
  sm.sleeping = false;
  sm.lastEvent = Date.now();
}

/** Wake from sleep. */
export function wakeUp(sm: StateQueue): void {
  sm.sleeping = false;
  sm.idleTimer = 0;
  sm.walkTimer = 0;
  sm.lastEvent = Date.now();
  sm.queue = [];
  applyState(sm, { anim: 'idle', priority: 0, durationMs: 0, coalesceKey: 'wake:idle' });
}

/** Update last event timestamp (keeps pet awake). */
export function updateLastEvent(sm: StateQueue): void {
  sm.lastEvent = Date.now();
}

// ─── Internal helpers ───

function applyState(sm: StateQueue, event: AnimEvent): void {
  sm.current = event.anim;
  sm.currentSince = Date.now();
}

function dequeueOrIdle(sm: StateQueue): void {
  // Find next non-expired transient or persistent state
  while (sm.queue.length > 0) {
    const next = sm.queue.shift()!;
    const dur = TRANSIENT_DURATIONS[next.anim];
    if (dur && Date.now() - sm.currentSince >= dur) continue; // skip expired transients
    applyState(sm, next);
    return;
  }
  // Fall back to idle
  sm.idleTimer = 0;
  sm.nextWalkDelay = randBetween(IDLE_TIMEOUT_MIN, IDLE_TIMEOUT_MAX);
  applyState(sm, { anim: 'idle', priority: 0, durationMs: 0, coalesceKey: 'dequeue:idle' });
}
