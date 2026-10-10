# Study Focus Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, local-only study focus tool with a goal, flexible timer, one gentle reminder, neutral review, weekly statistics, and an always-on-top mini timer.

**Architecture:** The main webview owns a single Zustand focus store persisted through the existing dual localStorage/SQLite layer. Timer values are derived from absolute timestamps so hidden-window throttling and restart do not drift. To preserve the project's Windows single-WebView2 stability fix, the mini timer renders inside the existing transparent pet window and sends idempotent commands back to the main store over Tauri events.

**Tech Stack:** React 19, TypeScript, Zustand 5, Tauri 2, Vitest, existing SQLite/localStorage persistence and backup system.

---

## File map

- Create `src/types/focus.ts`: persisted and runtime focus types.
- Create `src/utils/focusTimer.ts`: pure duration, pause and recovery calculations.
- Create `src/utils/focusTimer.test.ts`: timer edge-case tests.
- Create `src/stores/focusStore.ts`: state machine, persistence and bounded history.
- Create `src/stores/focusStore.test.ts`: state and persistence tests.
- Create `src/components/focus/FocusPage.tsx`: setup, active session, review and statistics composition.
- Create `src/components/focus/FocusSetup.tsx`: goal and duration form.
- Create `src/components/focus/FocusTimer.tsx`: active-session controls.
- Create `src/components/focus/FocusReview.tsx`: neutral completion review.
- Create `src/components/focus/FocusStats.tsx`: today/week/recent local statistics.
- Create `src/components/focus/focus.css`: focus page visual system and responsive layout.
- Create `src/components/focus/FocusRuntime.tsx`: route-independent scheduler and cross-window synchronization.
- Create `src/components/focus/FocusMiniStrip.tsx`: mini timer rendered in the existing pet window.
- Create `src/components/focus/focusMini.css`: mini timer presentation.
- Modify `src/components/pet/PetWindow.tsx`: render the strip and include it in pointer hit-testing.
- Modify `src/App.tsx`: load the focus store and register `/focus`.
- Modify `src/components/layout/AppShell.tsx`: add the `专注学习` navigation item.
- Modify `src/lib/backup.ts`: include SQLite `focus_data` in backups.
- Modify `src/lib/backup.test.ts`: prove focus data migrates and bad focus data cannot block core restore.

### Task 1: Timer domain and recovery math

**Files:**
- Create: `src/types/focus.ts`
- Create: `src/utils/focusTimer.ts`
- Test: `src/utils/focusTimer.test.ts`

- [ ] **Step 1: Write failing tests for running, paused, completed and clock-rollback sessions**

```ts
import { describe, expect, it } from 'vitest';
import { deriveFocusTiming } from './focusTimer';
import type { FocusSession } from '../types/focus';

const running: FocusSession = {
  id: 's1', goal: '完成英语阅读', plannedSeconds: 1500,
  startedAt: '2026-10-10T10:00:00.000Z', pausedSeconds: 0,
  pauseStartedAt: null, status: 'running', reminderShown: false,
};

describe('deriveFocusTiming', () => {
  it('derives remaining time from absolute timestamps', () => {
    expect(deriveFocusTiming(running, Date.parse('2026-10-10T10:10:00.000Z')))
      .toMatchObject({ elapsedSeconds: 600, remainingSeconds: 900, completed: false });
  });
  it('freezes elapsed time while paused', () => {
    const paused = { ...running, status: 'paused' as const, pauseStartedAt: '2026-10-10T10:05:00.000Z' };
    expect(deriveFocusTiming(paused, Date.parse('2026-10-10T10:20:00.000Z')).elapsedSeconds).toBe(300);
  });
  it('marks elapsed sessions completed', () => {
    expect(deriveFocusTiming(running, Date.parse('2026-10-10T10:30:00.000Z')).completed).toBe(true);
  });
  it('never increases remaining time after a system clock rollback', () => {
    expect(deriveFocusTiming(running, Date.parse('2026-10-10T09:55:00.000Z')).remainingSeconds).toBe(1500);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/utils/focusTimer.test.ts`

Expected: FAIL because `focusTimer` and the focus types do not exist.

- [ ] **Step 3: Add explicit domain types and pure timing helpers**

```ts
export type FocusStatus = 'running' | 'paused' | 'review';
export type FocusOutcome = 'completed' | 'partial' | 'continue';

export interface FocusSession {
  id: string;
  goal: string;
  plannedSeconds: number;
  startedAt: string;
  pausedSeconds: number;
  pauseStartedAt: string | null;
  status: FocusStatus;
  reminderShown: boolean;
}

export interface FocusRecord {
  id: string;
  goal: string;
  plannedSeconds: number;
  focusedSeconds: number;
  startedAt: string;
  endedAt: string;
  outcome: FocusOutcome;
  endedEarly: boolean;
}
```

Implement `deriveFocusTiming(session, nowMs)`, `pauseSession(session, at)`, `resumeSession(session, at)`, `shouldShowReminder(session, nowMs)` and `recommendedBreakSeconds(plannedSeconds)` as pure functions. Clamp all derived values to `[0, plannedSeconds]`; reminder thresholds are 8 minutes for a 15-minute session, 12 minutes for 25 minutes, 15 minutes for sessions of 45 minutes or longer, and disabled for sessions shorter than 10 minutes.

- [ ] **Step 4: Run the timer tests**

Run: `npx vitest run src/utils/focusTimer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the timer domain**

```bash
git add src/types/focus.ts src/utils/focusTimer.ts src/utils/focusTimer.test.ts
git commit -m "feat: add reliable focus timer domain"
```

### Task 2: Local focus store and bounded statistics

**Files:**
- Create: `src/stores/focusStore.ts`
- Test: `src/stores/focusStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Cover these exact behaviours:

```ts
it('starts only with a non-empty goal and 5-120 minutes');
it('pause and resume preserve one session id');
it('restores an expired running session into review');
it('saves neutral outcomes without changing pet coins or achievements');
it('does not save sessions shorter than 60 seconds when discarded');
it('keeps recent detail bounded and produces local-week aggregates');
it('clears records without changing the user settings');
```

Reset `localStorage`, the focus store and the pet store before every test. Assert the pet coin balance before and after every completion path.

- [ ] **Step 2: Run the store test and verify it fails**

Run: `npx vitest run src/stores/focusStore.test.ts`

Expected: FAIL because `useFocusStore` does not exist.

- [ ] **Step 3: Implement the store with dual persistence**

Use these stable keys and defaults:

```ts
export const FOCUS_LS_KEY = 'csp_focus_data';
export const FOCUS_SQLITE_KEY = 'focus_data';
export const DEFAULT_FOCUS_SETTINGS = {
  defaultMinutes: 25,
  miniWindowEnabled: true,
  gentleReminderEnabled: true,
  endSoundEnabled: true,
};
```

Expose `load`, `save`, `start`, `pause`, `resume`, `requestFinish`, `completeNaturally`, `saveReview`, `discardReview`, `updateSettings`, `clearHistory`, and `tick`. Persist `savedAt`, settings, one active session and records. Normalize corrupt input field-by-field; keep at most 180 detailed records and daily aggregate totals for older records.

- [ ] **Step 4: Run the store tests**

Run: `npx vitest run src/stores/focusStore.test.ts`

Expected: PASS with no changes to pet coins, experience or achievement storage keys.

- [ ] **Step 5: Commit the store**

```bash
git add src/stores/focusStore.ts src/stores/focusStore.test.ts
git commit -m "feat: persist optional focus sessions locally"
```

### Task 3: Backup and restore integration

**Files:**
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`

- [ ] **Step 1: Add failing backup tests**

Add `focus_data` to the expected SQLite key set and create a backup fixture containing both `csp_focus_data` and SQLite `focus_data`. Verify export retains them. Add a fixture with invalid JSON in both focus snapshots and verify `parseBackup`, pet validation and the core restore path still succeed.

- [ ] **Step 2: Run the focused backup tests**

Run: `npx vitest run src/lib/backup.test.ts`

Expected: FAIL because SQLite `focus_data` is currently filtered out.

- [ ] **Step 3: Add focus data to the SQLite backup whitelist**

```ts
const SQLITE_BACKUP_KEYS = new Set([
  'pet_data', 'hatch_eggs', 'quiz_state', 'problem_status',
  'collector_cards', 'profile_data', 'focus_data',
]);
```

Do not add any focus cache exclusion: `csp_focus_data` is user-authored local data and must migrate.

- [ ] **Step 4: Run backup and store tests**

Run: `npx vitest run src/lib/backup.test.ts src/stores/focusStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit backup support**

```bash
git add src/lib/backup.ts src/lib/backup.test.ts
git commit -m "feat: include focus records in student backups"
```

### Task 4: Main focus page and sidebar route

**Files:**
- Create: `src/components/focus/FocusPage.tsx`
- Create: `src/components/focus/FocusSetup.tsx`
- Create: `src/components/focus/FocusTimer.tsx`
- Create: `src/components/focus/FocusReview.tsx`
- Create: `src/components/focus/FocusStats.tsx`
- Create: `src/components/focus/focus.css`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add a render test for the setup and active states**

Create `src/components/focus/FocusPage.test.tsx` using the existing React test setup. Assert that idle state contains `这次想完成什么？`, preset buttons `15`, `25`, `45`, and no reward language. Start a session in the store and assert the active state shows the goal, remaining time, pause and early-finish controls.

- [ ] **Step 2: Run the component test and verify it fails**

Run: `npx vitest run src/components/focus/FocusPage.test.tsx`

Expected: FAIL because the focus components do not exist.

- [ ] **Step 3: Build the setup, timer, review and statistics components**

Keep state ownership in `useFocusStore`; components receive values and callbacks only. Use local-day helpers rather than UTC date slicing for today/week calculations. `FocusReview` must use exactly `完成了`, `完成一部分`, and `下次继续`. `FocusStats` shows today total, current-week total, seven local-day bars and ten recent records, plus a two-step clear-history confirmation.

- [ ] **Step 4: Register the route and navigation**

In `App.tsx`, load `useFocusStore.getState().load()` in the existing parallel store load and add:

```tsx
<Route path="/focus" element={<FocusPage />} />
```

In `AppShell.tsx`, import `TimerReset` from `lucide-react` and add `专注学习` under the `学习` group after `学习资料`.

- [ ] **Step 5: Run the component and store tests**

Run: `npx vitest run src/components/focus/FocusPage.test.tsx src/stores/focusStore.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the main page**

```bash
git add src/components/focus src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat: add optional study focus page"
```

### Task 5: Safe desktop mini timer and cross-window protocol

**Files:**
- Create: `src/components/focus/FocusRuntime.tsx`
- Create: `src/components/focus/FocusMiniStrip.tsx`
- Create: `src/components/focus/focusMini.css`
- Modify: `src/components/pet/PetWindow.tsx`
- Modify: `src/components/pet/PetCopy.ts`
- Modify: `src/App.tsx`
- Modify: `src/stores/focusStore.ts`

- [ ] **Step 1: Define and test the event protocol**

In `focusStore.test.ts`, test an exported pure reducer for these commands:

```ts
type FocusMiniCommand =
  | { type: 'pause'; sessionId: string }
  | { type: 'resume'; sessionId: string }
  | { type: 'finish'; sessionId: string }
  | { type: 'hide'; sessionId: string };
```

Commands with a stale session ID must do nothing. Repeating pause, resume or finish must be idempotent.

- [ ] **Step 2: Reuse the existing transparent pet window**

Render `FocusMiniStrip` inside `PetWindow`. Add its DOM bounds to the existing pointer-level hit test so the timer accepts clicks while the rest of the full-screen transparent window remains click-through. Do not create another WebView2 window.

- [ ] **Step 3: Implement the mini UI and synchronization**

`FocusRuntime` emits `focus-state-sync` after every state change and answers `focus-mini-ready`. The strip derives its visible countdown from the received timestamps and emits `focus-mini-command`. It never writes focus persistence directly. If the pet window was hidden, the runtime temporarily shows it and restores the previous visibility after the review is saved or discarded.

- [ ] **Step 4: Keep controls idempotent and preserve pet behaviour**

Pause, resume, finish, open and hide commands include the active session ID. Stale or repeated commands do nothing. Existing pet dragging, roaming, bubbles, monitor switching and click-through behaviour remain unchanged.

- [ ] **Step 5: Run TypeScript and Rust checks**

Run: `npm run build && cargo check --manifest-path src-tauri/Cargo.toml`

Expected: both commands exit 0; no new WebView2 entry is added.

- [ ] **Step 6: Commit the mini timer**

```bash
git add src/components/focus/FocusRuntime.tsx src/components/focus/FocusMiniStrip.tsx src/components/focus/focusMini.css src/components/pet/PetWindow.tsx src/components/pet/PetCopy.ts src/App.tsx src/stores/focusStore.ts src/stores/focusStore.test.ts
git commit -m "feat: add desktop focus mini timer"
```

### Task 6: Gentle reminder, completion and fallback behaviour

**Files:**
- Modify: `src/components/focus/FocusPage.tsx`
- Modify: `src/components/focus/FocusMiniStrip.tsx`
- Modify: `src/stores/focusStore.ts`
- Modify: `src/stores/focusStore.test.ts`
- Modify: `src/components/pet/PetCopy.ts`

- [ ] **Step 1: Add failing tests for one-shot reminders and completion**

Test that a 15-minute session reminds once at 8 minutes, a 25-minute session at 12 minutes, a 45-minute session at 15 minutes, and a session under 10 minutes never reminds. Reload the store after the reminder and assert it is not emitted again. Advance beyond the end twice and assert only one review session exists.

- [ ] **Step 2: Implement a single scheduler owner**

The main page runs a one-second visual tick only while mounted. The visible mini window also derives its countdown, but its `focus-session-elapsed` event carries the session ID and the store treats it idempotently. On any store load or page return, call `tick(Date.now())` to reconcile elapsed state.

- [ ] **Step 3: Add the gentle reminder fallback chain**

When `shouldShowReminder` first becomes true, persist `reminderShown:true`, then emit the existing `pet-bubble` event with a new neutral copy helper. Also emit the same text in `focus-state-sync`; the mini window displays it for five seconds if no pet consumes it. No acknowledgement or response data is collected.

- [ ] **Step 4: Add optional completion sound and break suggestion**

Use a short Web Audio chime only when `endSoundEnabled` is true. Do not bundle audio assets. The review screen shows a skippable 5-minute break suggestion for 15/25-minute sessions and 10 minutes for 45-minute sessions.

- [ ] **Step 5: Run all focus tests**

Run: `npx vitest run src/utils/focusTimer.test.ts src/stores/focusStore.test.ts src/components/focus/FocusPage.test.tsx`

Expected: PASS with one reminder and one saved review at most per session.

- [ ] **Step 6: Commit reminders and completion**

```bash
git add src/components/focus src/stores/focusStore.ts src/stores/focusStore.test.ts src/components/pet/PetCopy.ts src/components/pet/PetWindow.tsx src/App.tsx
git commit -m "feat: add gentle focus reminders and review"
```

### Task 7: Regression, accessibility and release-readiness checks

**Files:**
- Modify only files implicated by failures from the commands below.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all existing and new tests pass.

- [ ] **Step 2: Run the production build and asset validation**

Run: `npm run build && npm run validate:assets`

Expected: TypeScript/Vite build and asset validation exit 0; no focus assets materially increase installer size.

- [ ] **Step 3: Run Rust validation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: exit 0 with the new window configuration accepted.

- [ ] **Step 4: Perform local manual acceptance**

Run: `npm run tauri dev`

Verify all of the following:

1. Old student data opens normally and no focus modal appears.
2. A 5-minute custom session can start, pause, resume and finish.
3. Navigating to quiz, resources and pet pages does not stop the timer.
4. The mini window can drag, hide, reopen on the next session and never appears without an active session.
5. Switching to a browser or document does not show a “走神” warning.
6. Completion review uses neutral wording and changes no coins, experience, achievements or star-path state.
7. Exported backup contains focus data; restoring it recovers records without changing core student data.

- [ ] **Step 5: Inspect the final diff and installer-size impact**

Run: `git diff --check && git status --short && du -sh dist && du -sh src-tauri/target/release/bundle 2>/dev/null || true`

Expected: no whitespace errors or unintended generated files; size increase is limited to code and CSS because no media is bundled.

- [ ] **Step 6: Commit final corrections**

```bash
git add src/components/focus src/stores/focusStore.ts src/stores/focusStore.test.ts src/utils/focusTimer.ts src/utils/focusTimer.test.ts src/lib/backup.ts src/lib/backup.test.ts src/App.tsx src/components/layout/AppShell.tsx src/components/pet/PetCopy.ts src/components/pet/PetWindow.tsx docs/superpowers
git commit -m "test: verify study focus workflow"
```
