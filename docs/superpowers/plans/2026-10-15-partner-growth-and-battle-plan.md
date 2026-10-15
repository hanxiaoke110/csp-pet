# Partner Growth and Battle Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a locally tested, unreleased upgrade for clear battle art/effects, deterministic partner ascension, and cosmetic partner accessories.

**Architecture:** Preserve Canvas and existing pet instance IDs. Isolate trusted portrait loading, quality calculations, growth transactions, and accessory visuals into focused modules. New assets/catalogs remain online-authoring files until an authorized release; local previews must work without deploying.

**Tech Stack:** TypeScript, React, Zustand, Phaser Canvas, Tauri localStorage/SQLite, Vitest, Sharp, built-in imagegen.

Approved specification: `docs/superpowers/specs/2026-10-15-partner-growth-and-battle-design.md`. User approved 2026-10-15. Existing isolated worktree: `/Users/hanliuliu/.codex/worktrees/csp-student-feedback`, branch `feature/student-feedback`. Baseline: 507 tests / 77 files passing. No deployment, no desktop release.

## Task 1 — Battle rendering and trusted portraits

**Files:** Create `src-dungeon/utils/battlePortraits.ts`, `src-dungeon/utils/battlePortraits.test.ts`, `src-dungeon/phaser/effects/ElementAttackEffect.ts`, `src-dungeon/utils/battleVisuals.ts`, `src-dungeon/utils/battleVisuals.test.ts`; modify `src-dungeon/phaser/BattlePhaserGame.ts`, `src-dungeon/phaser/types.ts`, `src-dungeon/phaser/entities/PetSprite.ts`, `src-dungeon/phaser/scenes/BattleScene.ts`, `src-dungeon/components/screens/BattleScreen.tsx`; create authoring assets under `cloud-assets-source/battle-portraits/` and a builder under `scripts/`.

- [ ] Add failing unit tests for bounded backing resolution, the five element effect palettes, exactly-once impact/cancel behavior, catalog/path validation, corrupted/oversized/missing assets, timeout and cached fallback.

```ts
expect(computeBattleResolution(1920, 1080, 2).pixelCount).toBeLessThanOrEqual(3840 * 2160);
expect(isAllowedBattlePortraitUrl('https://evil.test/hero.webp')).toBe(false);
expect(isAllowedBattlePortraitUrl('https://cards.cspstudy.top/battle-portraits/capi.webp')).toBe(true);
```

- [ ] Run `npx vitest run src-dungeon/utils/battlePortraits.test.ts src-dungeon/utils/battleVisuals.test.ts` and confirm missing exports fail before implementation.
- [ ] Implement portrait catalog entries with `speciesId`, version, URL, bytes, width, height, style and SHA-256; enforce HTTPS trusted host/path, safe identifiers, download-byte and decoded-pixel caps. Keep verified cache, timeout/broken-image fallback, and URL lifecycle cleanup. Never block battle indefinitely or replace one pet with another. Load online data only after baseline identity is known. Build authoring catalog for supplied four original-pet artworks and nine existing independently layered subjects; never publish it in this task. Tests must inject fetch/cache to avoid real network and Tauri dependencies.
- [ ] Add Canvas backing-resolution budget and responsive measurement without unbounded per-frame resizing. Preserve logical 1280×720 gameplay coordinates, handling both pixel-art nearest and painted-art linear sampling. Keep readable controls and actor bounds; do not assume every preview is pixel art.
- [ ] Implement elemental effects for player and enemy attacks with short wind-up/projectile/impact, clear shield support, correct five-element palette, reduced-motion mode and persisted simple/full toggle. Use scoped cleanup; shutdown, pause and scene exit cannot cause double damage or fire delayed callbacks into dead scenes. Existing damage calculations remain unchanged.

```ts
const once = (callback: () => void) => {
  let fired = false;
  return () => { if (!fired) { fired = true; callback(); } };
};
```

- [ ] Run focused tests, `npx tsc --noEmit`, and `npm run build:dungeon`. Commit only task files and report exact checks.
- [ ] Independent spec review, resolve gaps; independent quality review, resolve important issues before Task 2.

## Task 2 — Growth model, transactions, starsand, ascension UI

**Files:** Create `src/types/partnerGrowth.ts`, `src/utils/partnerQuality.ts`, `src/utils/partnerQuality.test.ts`, `src/lib/partnerTransactions.ts`, `src/lib/partnerTransactions.test.ts`, `src/stores/partnerGrowthStore.ts`, `src/stores/partnerGrowthStore.test.ts`, `src/components/pet/PartnerAscensionPanel.tsx`; modify `src/types/pet.ts`, `src/stores/petStore.ts`, `src/lib/persist.ts`, `src/lib/backup.ts`, answer submission call sites, exploration settlement, `src-dungeon/components/screens/BattleScreen.tsx`, active-pet storage adapters, and pet detail entry.

- [ ] Write failing tests using deterministic pet fixtures for independent same-species instances, legacy native tier, 100/240 coin prices, 2/5 sand costs, levels 5/10, affection 60/80, and common/rare/legendary 0/3/6% boosts.

```ts
expect(getPartnerQualityBonus('common')).toBe(0);
expect(getPartnerQualityBonus('rare')).toBe(.03);
expect(getPartnerQualityBonus('legendary')).toBe(.06);
```

- [ ] Write failing store tests: 20 distinct first-correct questions -> 1 sand; repeated same ID -> none; one unique completed map -> 1 sand; migration of aggregate correct totals/completed maps happens once. Across pages normalize canonical question IDs, never treat a bank-version change as a new question. Transaction tests inject setItem/SQLite failure and interruption, assert no partial debit, fresh timestamps, recovery before hydration and backup, no duplicate ascent on double click.
- [ ] Implement optional per-instance ascension fields and effective-tier resolver preserving all valid legacy tier information and no downgrade. Preserve species/global catalog tiers, pet IDs, names, affection, level, exp, source cost and slots. Maintain legacy trial base multiplier by dungeon level; apply the small quality bonus once to HP/attack/defense only. Display actual before/after trial stats with the same central calculator.
- [ ] Implement starsand accounting independent from equipment crystals, including one-time legacy compatibility credit plus completed-map backfill. Persist dedupe/migration state, nonnegative integer validation, and explicit local-only semantics. Use csp-prefixed localStorage and SQLite backup key, integrate export/import and transactional recovery. New answers and exploration settlement must call this in real success paths, including old completed-map detection.
- [ ] Implement a recoverable transaction encompassing pet wallet, growth balance and quality, with UI state updated only after durable local commit. Deduplicate repeated UI action through expected source-tier / guarded action. Freeze acquisition-cost inference before upgrading; record ascension spending separately and refund it at most once through actual final dismantle logic, never recovery or a new-tier price estimate.
- [ ] Add partner detail UI: current/target quality, explicit conditions and balances, 100% success explanation, stat deltas, native confirm component, busy/error states, full-quality state. No random rolls or daily deadlines. Refresh other windows through existing persistence/events.
- [ ] Run new tests, pet safety tests, persistence and backup tests, trial-stat tests, `npx tsc --noEmit`. Commit, then spec and quality review with fixes.

## Task 3 — Six cosmetics, wardrobe integration, desktop and battle

**Files:** Create `src/types/partnerAccessory.ts`, `src/data/partnerAccessories.ts`, `src/data/partnerAccessories.test.ts`, `src/stores/partnerAccessoryStore.ts`, `src/stores/partnerAccessoryStore.test.ts`, `src/components/pet/PartnerAccessoryLayers.tsx`, `src/components/pet/PartnerAccessoryPanel.tsx` and scoped CSS; modify wardrobe page, pet detail, `src/components/pet/PetWindow.tsx`, `src-dungeon/phaser/entities/PetSprite.ts`, battle config creation and backup SQLite-key list. Keep instance equipped slots separate from profile wardrobe categories.

- [ ] Test catalog validation, three distinct slots, free default ring, permanent ownership, safe coin spends, no extra charge on re-equip, two pets independently equipped, invalid/unsupported IDs and cosmetic-only battle stats.
- [ ] Implement first 6 bounded primitives: `halo-clear` free, `halo-prism` 240g, `orbit-stars` 120g, `orbit-lantern` 180g, `trail-comet` 300g, `trail-pixel` 360g. Four cool/two cute. All renderers consume whitelisted primitive parameters, never executable remote data. Online catalog version/price support with offline defaults; unsupported renderer versions/items cannot be purchased. Permanent purchases use transaction guarantees from Task 2 or equivalent recoverable journal and dual storage.
- [ ] Implement CSS/SVG-native ring/orbit/trail effects with pointer-events:none; use graphics primitives for Phaser counterparts. No large raster-placeholder art, no new WebView/dependency. At rest show ring/orbit, trail only during genuine movement, sleep/hidden/reduced-motion simplifies, scene exit clears graphics. Unknown item -> no layer, not broken pet.
- [ ] Add wardrobe category for partner accessories and pet detail switcher; actual selected pet and owned slots visible, preview before purchase, three equip/clear actions, visible cost/unlock state. Keep personal profile equipment independent. Existing dragging and focused mini strip remain operable.
- [ ] Extend backup/restore, dual persistence and live desktop refresh. Test old snapshots load unchanged and new snapshots restore purchases/equipment per pet without image blobs.
- [ ] Run focused tests and both builds. Commit; independent spec review then code quality review with fixes.

## Task 4 — Integrated acceptance and handoff

- [ ] Execute `npm test`, `npm run build`, `npm run build:dungeon`, `npm run validate:assets`, and `git diff --check`. Compare failures against 507-test baseline, do not waive regressions.
- [ ] Use local browser preview to exercise tier transitions, insufficient balances, accessory purchase/equip, battle full/simple effects and image fallbacks. Seed only dedicated local preview/test storage, never user's real desktop saves. Inspect four display scales and narrow viewport, actual hover/click targets, console errors and reduce-motion behavior. Native drag is not proven by browser simulation: report actual platform checks honestly.
- [ ] Confirm cloud-only art absent from dist and public; record new download bytes vs code/bundled delta. Document built-in image generation prompts and project paths; keep raw original art outside installer.
- [ ] Final independent review of integrated changes, fix important defects, update this plan and spec status, commit results. Leave feature branch intact; no cloud deployment, desktop release or Windows real-machine claim.
