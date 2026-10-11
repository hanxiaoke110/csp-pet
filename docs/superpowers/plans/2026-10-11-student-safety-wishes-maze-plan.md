# Student Safety, Wishes, and Maze Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove exploitable training-camp rewards, add secure wish self-deletion and 14-day revoting, and guarantee that every maze exit state has a progress-preserving escape path.

**Architecture:** Keep training-camp fields readable only for backup compatibility while all runtime selectors return disabled behavior. Add D1-backed ownership and vote-cooldown enforcement before exposing new Wish Wall controls. Isolate maze recovery in pure pathfinding helpers, then connect those helpers to the existing exploration store and modal.

**Tech Stack:** React 19, TypeScript 5.8, Zustand 5, Vitest 4, Cloudflare Workers, D1 SQLite, ROT.js maze data.

---

## Execution progress — 2026-10-11

- [x] Training camp runtime disabled, legacy resource balances preserved, daily completion keys migrated to weekly keys.
- [x] Training camp controls and guide copy removed.
- [x] Wish self-deletion and monthly quota preservation implemented.
- [x] Server-side 14-day vote cooldown implemented with atomic D1 batch; migration and rollback tested with real SQLite.
- [x] Wish Wall delete confirmation, cooldown label, explicit-success ticket consumption, and duplicate-click guard implemented.
- [x] Maze recovery paths tested across all 40 maps with 0/1/2/3 resolved seals.
- [x] Exit guidance and safe relocation implemented; invalid or locked-region legacy positions repaired on load.
- [x] Complete Vitest suite, TypeScript check, desktop frontend build and dungeon build passed.
- [ ] Production API deployment and Windows installer smoke test pending the coordinated release.

Implementation corrections to the original examples: this repository stores pets via `dualLoad`/`dualSave`, not `pet-storage`; the actual availability method is `canDoSuperChallenge`; the equipment store's existing test lives in `explorationStore.test.ts`. Tests use the actual interfaces. Wish API tests are `.mjs` so Node's built-in SQLite can validate real SQL without adding a dependency. The maze store exposes validated `recoverToSafePath(map)` rather than arbitrary relocation coordinates.

## File Structure

- Modify `src/stores/petStore.ts`: permanently disable camp activation, multipliers, and food claims while preserving old backup parsing.
- Modify `src/stores/quizStore.ts`: remove camp-based daily super-challenge behavior.
- Modify `src/components/settings/SettingsPage.tsx`: remove camp activation UI.
- Modify `src/components/pet/RaisingGuide.tsx`: remove camp copy.
- Modify `src/stores/petStore.test.ts` and `src/stores/quizStore.test.ts`: migration and reward regressions.
- Modify `cf-workers/api.js`: D1 schema v12, wish ownership, self-delete endpoint, 14-day vote cooldown.
- Create `cf-workers/api.wishes.test.ts`: API security, quota, cooldown, and concurrency regressions.
- Modify `src/components/pet/WishWall.tsx`: ownership, delete confirmation, cooldown display, revised rules.
- Create `src/components/pet/wishWallLogic.ts`: pure cooldown labels and server-result handling.
- Create `src/components/pet/WishWall.test.tsx`: server-rendered controls and pure client behavior.
- Create `src-dungeon/utils/explorationRecovery.ts`: pure BFS target and safe-cell helpers.
- Create `src-dungeon/utils/explorationRecovery.test.ts`: recovery tests across all 40 maps.
- Modify `src-dungeon/stores/explorationStore.ts`: add safe relocation action without resetting progress.
- Modify `src-dungeon/stores/explorationStore.test.ts`: persistence and relocation tests.
- Modify `src-dungeon/components/screens/ExplorationScreen.tsx`: target guidance and recovery controls.
- Modify `src-dungeon/App.css`: target/recovery visual states.

### Task 1: Disable Training Camp at Runtime

**Files:**
- Modify: `src/stores/petStore.test.ts`
- Modify: `src/stores/quizStore.test.ts`
- Modify: `src/stores/petStore.ts`
- Modify: `src/stores/quizStore.ts`

- [ ] **Step 1: Write failing migration and reward tests**

Add assertions that an old active camp state cannot produce rewards:

```ts
it('disables legacy training camp state after load', () => {
  localStorage.setItem('pet-storage', JSON.stringify({
    state: {
      trainingCampActive: true,
      trainingCampEndDate: '2099-12-31',
      trainingCampFoodsClaimed: [],
    },
  }));
  usePetStore.getState().loadFromLocalStorage();
  expect(usePetStore.getState().trainingCampActive).toBe(false);
  expect(usePetStore.getState().getRewardMultiplier()).toBe(1);
  expect(usePetStore.getState().claimTrainingCampFoods()).toBe(false);
});

it('does not make super challenge daily for a legacy camp save', () => {
  usePetStore.setState({ trainingCampActive: true, trainingCampEndDate: '2099-12-31' });
  expect(useQuizStore.getState().isSuperChallengeAvailable()).toBe(false);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run src/stores/petStore.test.ts src/stores/quizStore.test.ts`

Expected: FAIL because active legacy fields still enable multiplier, food, or daily challenge behavior.

- [ ] **Step 3: Replace runtime camp behavior with compatibility no-ops**

Keep the interface stable for callers, but implement these results in `petStore.ts`:

```ts
activateTrainingCamp: () => ({ ok: false, message: '集训模式已关闭' }),
getRewardMultiplier: () => 1,
claimTrainingCampFoods: () => false,
```

During load/import, set:

```ts
trainingCampActive: false,
trainingCampEndDate: '',
trainingCampFoodsClaimed: [],
```

In `quizStore.ts`, remove the branch reading camp state from super-challenge availability and use only the existing weekly completion rule.

- [ ] **Step 4: Run tests and verify pass**

Run: `npx vitest run src/stores/petStore.test.ts src/stores/quizStore.test.ts`

Expected: both files PASS.

- [ ] **Step 5: Commit runtime shutdown**

```bash
git add src/stores/petStore.ts src/stores/petStore.test.ts src/stores/quizStore.ts src/stores/quizStore.test.ts
git commit -m "fix: disable training camp rewards"
```

### Task 2: Remove Training Camp UI and Copy

**Files:**
- Modify: `src/components/settings/SettingsPage.tsx`
- Modify: `src/components/pet/RaisingGuide.tsx`

- [ ] **Step 1: Add source-level regression assertions**

Add a small test in the nearest existing settings/guide test file, or create `src/components/settings/trainingCampRemoval.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('training camp removal', () => {
  it('does not expose activation controls or reward copy', () => {
    const settings = readFileSync('src/components/settings/SettingsPage.tsx', 'utf8');
    const guide = readFileSync('src/components/pet/RaisingGuide.tsx', 'utf8');
    expect(settings).not.toContain('激活集训');
    expect(settings).not.toContain('教师激活码');
    expect(guide).not.toContain('集训模式');
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run src/components/settings/trainingCampRemoval.test.ts`

Expected: FAIL while the current UI remains.

- [ ] **Step 3: Remove camp-only state, handlers, markup, and guide entries**

Delete only the camp section and imports/selectors used solely by it. Do not remove backup-compatible fields from the store interface in this task.

- [ ] **Step 4: Run the focused test and TypeScript build**

Run: `npx vitest run src/components/settings/trainingCampRemoval.test.ts && npm run build`

Expected: PASS and production build exits 0.

- [ ] **Step 5: Commit UI removal**

```bash
git add src/components/settings/SettingsPage.tsx src/components/pet/RaisingGuide.tsx src/components/settings/trainingCampRemoval.test.ts
git commit -m "feat: remove training camp controls"
```

### Task 3: Migrate Wish Voting to a 14-Day Server Cooldown

**Files:**
- Modify: `cf-workers/api.js`
- Create: `cf-workers/api.wishes.test.ts`

- [ ] **Step 1: Add failing schema and cooldown tests**

Create a worker harness matching the other `cf-workers/api.*.test.ts` files and cover:

```ts
it('allows the same device to vote again only after 14 days', async () => {
  const first = await vote({ wish_id: 7, device_hash: 'device-a', class_code: 'CLASS1' });
  expect(first.status).toBe(200);
  const blocked = await vote({ wish_id: 7, device_hash: 'device-a', class_code: 'CLASS1' });
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({ next_vote_at: expect.any(String) });
  await db.prepare("UPDATE wish_vote_cooldowns SET next_allowed_at=datetime('now','-1 second') WHERE wish_id=7 AND device_hash='device-a'").run();
  expect((await vote({ wish_id: 7, device_hash: 'device-a', class_code: 'CLASS1' })).status).toBe(200);
  expect((await db.prepare('SELECT COUNT(*) c FROM votes WHERE wish_id=7').first()).c).toBe(2);
});

it('records only one vote for concurrent requests', async () => {
  const results = await Promise.all([
    vote({ wish_id: 7, device_hash: 'device-b', class_code: 'CLASS1' }),
    vote({ wish_id: 7, device_hash: 'device-b', class_code: 'CLASS1' }),
  ]);
  expect(results.filter(r => r.status === 200)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the worker test and verify failure**

Run: `npx vitest run cf-workers/api.wishes.test.ts`

Expected: FAIL because the permanent unique index rejects all revotes and no cooldown table exists.

- [ ] **Step 3: Add schema v12 migration**

Set `SCHEMA_VERSION = 12` and add:

```sql
DROP INDEX IF EXISTS idx_votes_unique;
CREATE TABLE IF NOT EXISTS wish_vote_cooldowns (
  wish_id INTEGER NOT NULL,
  device_hash TEXT NOT NULL,
  next_allowed_at TEXT NOT NULL,
  lease_token TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (wish_id, device_hash)
);
INSERT OR IGNORE INTO wish_vote_cooldowns(wish_id, device_hash, next_allowed_at)
SELECT wish_id, device_hash, datetime(MAX(created_at), '+14 days')
FROM votes GROUP BY wish_id, device_hash;
CREATE INDEX IF NOT EXISTS idx_wish_vote_cooldown_time
ON wish_vote_cooldowns(next_allowed_at);
```

- [ ] **Step 4: Replace permanent vote uniqueness with an atomic lease batch**

Generate `leaseToken = crypto.randomUUID()` and run a D1 batch containing:

```sql
INSERT INTO wish_vote_cooldowns(wish_id, device_hash, next_allowed_at, lease_token)
VALUES (?, ?, datetime('now', '+14 days'), ?)
ON CONFLICT(wish_id, device_hash) DO UPDATE SET
  next_allowed_at=datetime('now', '+14 days'), lease_token=excluded.lease_token
WHERE wish_vote_cooldowns.next_allowed_at <= datetime('now');
```

Then insert history and update the denormalized total only when the row owns the current lease token:

```sql
INSERT INTO votes(wish_id, device_hash, class_code)
SELECT ?, ?, ? FROM wish_vote_cooldowns
WHERE wish_id=? AND device_hash=? AND lease_token=?;

UPDATE wishes SET votes=votes+1 WHERE id=? AND EXISTS(
  SELECT 1 FROM wish_vote_cooldowns
  WHERE wish_id=? AND device_hash=? AND lease_token=?
);
```

Return HTTP 409 plus `next_vote_at` when the cooldown statement changes zero rows. Return `next_vote_at` after a successful vote.

- [ ] **Step 5: Run cooldown tests**

Run: `npx vitest run cf-workers/api.wishes.test.ts cf-workers/api.leaderboard.test.ts`

Expected: PASS; leaderboard totals include every legal revote.

- [ ] **Step 6: Commit cooldown migration**

```bash
git add cf-workers/api.js cf-workers/api.wishes.test.ts
git commit -m "feat: allow wish revotes after cooldown"
```

### Task 4: Add Secure Wish Ownership and Self-Deletion

**Files:**
- Modify: `cf-workers/api.js`
- Modify: `cf-workers/api.wishes.test.ts`

- [ ] **Step 1: Add failing ownership and quota tests**

```ts
it('marks only the requesting device wishes as mine', async () => {
  const response = await getWishes('CLASS1', 'device-owner');
  const items = await response.json();
  expect(items.find((w: any) => w.id === 7).is_mine).toBe(true);
  expect(items.find((w: any) => w.id === 8).is_mine).toBe(false);
  expect(JSON.stringify(items)).not.toContain('device-owner');
});

it('soft deletes only an owned wish without resetting monthly quota', async () => {
  expect((await deleteWish(7, 'device-owner', 'CLASS1')).status).toBe(200);
  expect((await deleteWish(8, 'device-owner', 'CLASS1')).status).toBe(403);
  const stats = await (await getStats('device-owner')).json();
  expect(stats.activeWishes).toBe(0);
  expect(stats.monthlySubmitted).toBe(1);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run cf-workers/api.wishes.test.ts`

Expected: FAIL because `is_mine` and student DELETE do not exist.

- [ ] **Step 3: Add deletion timestamp and ownership projection**

Add to schema v12:

```sql
ALTER TABLE wishes ADD COLUMN deleted_at TEXT;
```

Accept `device_hash` on GET `/api/wishes` and project only:

```sql
CASE WHEN device_hash=? THEN 1 ELSE 0 END AS is_mine
```

Do not include `device_hash` in the result columns.

- [ ] **Step 4: Add student DELETE endpoint**

Handle `DELETE /api/wishes/:id` with JSON `{ device_hash, class_code }`. Validate active class membership, resolve all active classes for the same teacher, and execute:

```sql
UPDATE wishes SET status='deleted', deleted_at=datetime('now')
WHERE id=? AND device_hash=? AND class_code IN (<teacher class placeholders>)
  AND status IN ('active','completed');
```

Return 403 when ownership/scope does not match. Treat an already deleted owned row as idempotent success. Change monthly queries to count every wish created by the device during the month regardless of status. Keep active count restricted to `status='active'`.

- [ ] **Step 5: Run worker tests**

Run: `npx vitest run cf-workers/api.wishes.test.ts cf-workers/api.codes.comp.test.ts cf-workers/api.codes.exc.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit self-delete API**

```bash
git add cf-workers/api.js cf-workers/api.wishes.test.ts
git commit -m "feat: let students remove owned wishes"
```

### Task 5: Update Wish Wall Interaction

**Files:**
- Modify: `src/components/pet/WishWall.tsx`
- Create: `src/components/pet/wishWallLogic.ts`
- Create: `src/components/pet/WishWall.test.tsx`

- [ ] **Step 1: Add failing client tests**

Use pure helpers plus `renderToStaticMarkup`, matching the repository's existing component-test pattern:

```ts
it('does not spend a ticket when the server returns cooldown', async () => {
  const result = interpretVoteResponse(409, {
    error: '14天后可再次投票', next_vote_at: '2026-10-25T00:00:00Z',
  });
  expect(result.spendTicket).toBe(false);
  expect(result.message).toContain('可再次投票');
});

it('renders delete control only for an owned wish', () => {
  expect(renderWishMarkup({ id: 7, is_mine: true })).toContain('删除我的愿望');
  expect(renderWishMarkup({ id: 8, is_mine: false })).not.toContain('删除我的愿望');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/components/pet/WishWall.test.tsx`

Expected: FAIL because the fields and controls are absent.

- [ ] **Step 3: Add typed ownership/cooldown fields and GET identity**

Extend `Wish`:

```ts
interface Wish {
  id: number;
  content: string;
  display_name: string;
  votes: number;
  created_at: string;
  status?: string;
  is_mine?: boolean;
  next_vote_at?: string | null;
}
```

Append `device_hash=${encodeURIComponent(getDeviceId())}` to list requests. Render cooldown text when `next_vote_at` is in the future.

Implement `interpretVoteResponse` and `formatVoteCooldown` in `wishWallLogic.ts`; call `useTicket()` only when `interpretVoteResponse(...).spendTicket` is true.

- [ ] **Step 4: Add delete confirmation and successful refresh**

Use `ModalPortal` for confirmation. On confirmation call `DELETE /api/wishes/:id` with device and class identity. On success, invalidate both list caches, reload wishes and stats, and show `✅ 愿望已删除`.

- [ ] **Step 5: Update user-facing rules**

Replace permanent-one-vote copy with “同一愿望每 14 天可再投 1 票”；add “只能删除自己发布的愿望，删除不返还许愿票，也不重置本月提交次数”。

- [ ] **Step 6: Run tests and build**

Run: `npx vitest run src/components/pet/WishWall.test.tsx && npm run build`

Expected: PASS and build exits 0.

- [ ] **Step 7: Commit Wish Wall UI**

```bash
git add src/components/pet/WishWall.tsx src/components/pet/wishWallLogic.ts src/components/pet/WishWall.test.tsx
git commit -m "feat: show wish ownership and cooldowns"
```

### Task 6: Create Pure Maze Recovery Helpers

**Files:**
- Create: `src-dungeon/utils/explorationRecovery.ts`
- Create: `src-dungeon/utils/explorationRecovery.test.ts`

- [ ] **Step 1: Write failing BFS tests**

```ts
it.each(EXPLORATION_STAGES)('finds every unresolved seal and a safe neighbor on $id', stage => {
  const map = buildExplorationMap(stage);
  const unresolved = map.events.filter(e => e.type === 'seal');
  for (const event of unresolved) {
    const route = findShortestRoute(map, map.exit, event.position);
    expect(route.length).toBeGreaterThan(1);
  }
  expect(findNearestSafeCell(map, map.exit)).not.toEqual(map.exit);
});

it('uses stable event id ordering when routes tie', () => {
  const result = findNearestUnresolvedSeal(tiedMap, tiedProgress);
  expect(result?.eventId).toBe('seal-a');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/utils/explorationRecovery.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement deterministic BFS helpers**

Export:

```ts
export interface RecoveryTarget { eventId: string; position: GridPoint; nextStep: GridPoint; distance: number }
export function findShortestRoute(map: ExplorationMapDefinition, from: GridPoint, to: GridPoint): GridPoint[];
export function findNearestUnresolvedSeal(map: ExplorationMapDefinition, progress: ExplorationProgress): RecoveryTarget | null;
export function findNearestSafeCell(map: ExplorationMapDefinition, from: GridPoint): GridPoint | null;
```

Traverse only floor tiles, visit neighbors in fixed `up, right, down, left` order, and sort equal-distance seal candidates by event ID. A safe cell must be reachable, must differ from `from`, and must not contain an unresolved event.

- [ ] **Step 4: Run helper and existing map tests**

Run: `npx vitest run src-dungeon/utils/explorationRecovery.test.ts src-dungeon/utils/explorationLogic.test.ts src-dungeon/data/explorationAssets.test.ts`

Expected: PASS for all 40 maps.

- [ ] **Step 5: Commit recovery helpers**

```bash
git add src-dungeon/utils/explorationRecovery.ts src-dungeon/utils/explorationRecovery.test.ts
git commit -m "feat: add deterministic maze recovery paths"
```

### Task 7: Connect Maze Recovery to Store and UI

**Files:**
- Modify: `src-dungeon/stores/explorationStore.ts`
- Modify: `src-dungeon/stores/explorationStore.test.ts`
- Modify: `src-dungeon/components/screens/ExplorationScreen.tsx`
- Modify: `src-dungeon/App.css`

- [ ] **Step 1: Add failing state-preservation tests**

```ts
it('relocates without resetting exploration progress', () => {
  const before = useExplorationStore.getState().current!;
  useExplorationStore.getState().recoverTo({ x: 2, y: 3 });
  const after = useExplorationStore.getState().current!;
  expect(after.position).toEqual({ x: 2, y: 3 });
  expect(after.questionIds).toEqual(before.questionIds);
  expect(after.resolvedEventIds).toEqual(before.resolvedEventIds);
  expect(after.pendingCoins).toBe(before.pendingCoins);
  expect(after.dismissedEventId).toBeUndefined();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/stores/explorationStore.test.ts`

Expected: FAIL because `recoverTo` is not defined.

- [ ] **Step 3: Add `recoverTo` action**

Validate the target is in bounds and walkable, update only `position`, `revealed`, and `dismissedEventId`, persist immediately, and return `boolean` for success.

- [ ] **Step 4: Add exit guidance and recovery controls**

For an unready exit:

```tsx
<button className="explore-action primary" onClick={onGuideToSeal}>
  前往最近的未完成封印
</button>
<button className="explore-action secondary" onClick={onRecover}>
  返回最近安全通路
</button>
```

Use `findNearestUnresolvedSeal` to store/render a directional target marker. Use `findNearestSafeCell` plus `recoverTo` for the fallback. Closing the exit sets `dismissedEventId`; moving off the tile clears it as today.

- [ ] **Step 5: Run maze tests and build dungeon**

Run: `npx vitest run src-dungeon/stores/explorationStore.test.ts src-dungeon/utils/explorationRecovery.test.ts src-dungeon/utils/explorationLogic.test.ts && npm run build:dungeon`

Expected: PASS and dungeon build exits 0.

- [ ] **Step 6: Commit maze recovery UI**

```bash
git add src-dungeon/stores/explorationStore.ts src-dungeon/stores/explorationStore.test.ts src-dungeon/components/screens/ExplorationScreen.tsx src-dungeon/App.css
git commit -m "fix: prevent maze exit soft locks"
```

### Task 8: Safety Release Gate

**Files:**
- Modify only if failures expose defects in files already listed above.

- [ ] **Step 1: Run focused safety suite**

Run:

```bash
npx vitest run \
  src/stores/petStore.test.ts \
  src/stores/quizStore.test.ts \
  src/components/settings/trainingCampRemoval.test.ts \
  src/components/pet/WishWall.test.tsx \
  cf-workers/api.wishes.test.ts \
  src-dungeon/utils/explorationRecovery.test.ts \
  src-dungeon/stores/explorationStore.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run complete regression suite**

Run: `npm test`

Expected: all test files PASS with no unhandled rejection.

- [ ] **Step 3: Build both entry points and check Rust**

Run: `npm run build && npm run build:dungeon && cargo check --manifest-path src-tauri/Cargo.toml`

Expected: both builds exit 0; Rust check has no new warnings beyond existing macOS objc cfg warnings.

- [ ] **Step 4: Deploy API before client release**

Run the repository's existing Worker deployment command/config after confirming Cloudflare authentication. Verify old GET/POST wish calls still work, then verify new DELETE and cooldown responses against production using a test class/device.

- [ ] **Step 5: Commit any release-only test fixture updates**

```bash
git add cf-workers src src-dungeon
git commit -m "test: validate student safety release"
```
