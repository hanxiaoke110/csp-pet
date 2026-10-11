# Collector Card Online Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish additional high-quality collector cards in small online-only batches without increasing installer size or requiring a desktop release.

**Architecture:** Treat the existing Cloudflare collector catalog as the source of truth and select new subjects from the latest vote ranking that are not already represented. Each card ships as optimized layered static assets plus validated metadata; the current client supplies tilt, parallax, lighting, purchase, ownership, and backup behavior.

**Tech Stack:** Cloudflare static assets, JSON catalog, Sharp asset validation/optimization, existing collector-card React renderer, Holo Card visual guidelines.

---

## File Structure

- Modify `cloud-assets-source/collector-cards/catalog.json`: append stable card metadata.
- Create `cloud-assets-source/collector-cards/<card-id>/`: foreground, background, effects, thumbnail, and back assets.
- Create `scripts/select-collector-card-batch.mjs`: select highest-ranked unrepresented candidates.
- Create `scripts/select-collector-card-batch.test.mjs`: deterministic selection tests.
- Modify `scripts/build-cloud-assets.mjs`: copy and size-check layered card assets.
- Modify the existing collector catalog tests: IDs, layers, dimensions, and total batch size.

### Task 1: Select a Deterministic 3–5 Card Batch

**Files:**
- Create: `scripts/select-collector-card-batch.mjs`
- Create: `scripts/select-collector-card-batch.test.mjs`

- [ ] **Step 1: Write failing selection tests**

```js
it('selects the highest-voted candidates missing from the catalog', () => {
  const ranking = [{ id: 'a', votes: 12 }, { id: 'b', votes: 11 }, { id: 'c', votes: 11 }];
  expect(selectBatch(ranking, new Set(['a']), 2).map(x => x.id)).toEqual(['b', 'c']);
});

it('breaks tied votes by stable candidate id', () => {
  const ranking = [{ id: 'z', votes: 8 }, { id: 'a', votes: 8 }];
  expect(selectBatch(ranking, new Set(), 2).map(x => x.id)).toEqual(['a', 'z']);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run scripts/select-collector-card-batch.test.mjs`

Expected: FAIL because the selector is absent.

- [ ] **Step 3: Implement ranking selection**

Read the exported vote ranking, remove IDs already present in `catalog.json`, sort by votes descending then stable ID ascending, and output the first 5 candidates. The output is a review manifest only and never deploys automatically.

- [ ] **Step 4: Run selector tests**

Run: `npx vitest run scripts/select-collector-card-batch.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit selection tooling**

```bash
git add scripts/select-collector-card-batch.mjs scripts/select-collector-card-batch.test.mjs
git commit -m "chore: select collector card batches"
```

### Task 2: Produce and Review Layered Card Assets

**Files:**
- Create: `cloud-assets-source/collector-cards/<card-id>/background.webp`
- Create: `cloud-assets-source/collector-cards/<card-id>/subject.webp`
- Create: `cloud-assets-source/collector-cards/<card-id>/effects.webp`
- Create: `cloud-assets-source/collector-cards/<card-id>/thumbnail.webp`
- Create: `cloud-assets-source/collector-cards/<card-id>/back.webp`

- [ ] **Step 1: Generate each subject as separate visual layers**

For every approved candidate, create a background without the character, a transparent subject cutout, a transparent foreground/effect layer, a shop thumbnail, and a non-mirrored unique card back. Keep face, name, and silhouette clear at card size.

- [ ] **Step 2: Optimize files**

Use the repository Sharp pipeline to convert to WebP. Target each complete card under 2 MB and the five-card batch under 10 MB. Preserve transparency on subject/effect layers.

- [ ] **Step 3: Perform visual review in the real renderer**

Check mouse-follow tilt, edge depth, restrained highlight, automatic appreciation mode, flip typography, and low-powered animation mode. Reject any card whose light obscures the subject or whose foreground feels pasted onto a single flat image.

- [ ] **Step 4: Keep only approved assets**

Do not publish failed variants. The batch may contain 3 or 4 cards if fewer than 5 pass; quality takes priority over count.

- [ ] **Step 5: Commit approved assets**

```bash
git add cloud-assets-source/collector-cards
git commit -m "feat: add collector card art batch"
```

### Task 3: Append Catalog Entries and Validate

**Files:**
- Modify: `cloud-assets-source/collector-cards/catalog.json`
- Modify: `scripts/build-cloud-assets.mjs`
- Modify: `src/data/collectorCards.test.ts`

- [ ] **Step 1: Add failing catalog asset assertions**

For every entry assert stable unique ID/number, HTTPS-safe relative layer paths, existing files, valid element/rarity, positive fixed coin price, nonempty description, and unique back.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/data/collectorCards.test.ts && npm run cloud-assets:build`

Expected: FAIL while new assets are not represented in the catalog.

- [ ] **Step 3: Append reviewed metadata**

Increment `catalogVersion`, preserve all existing IDs and numbers, and add only the approved batch. Use the next unused permanent card numbers; never renumber owned cards.

- [ ] **Step 4: Build and validate static assets**

Run: `npm run cloud-assets:build && npm run validate:assets`

Expected: PASS; output contains all five layer types for each published card and remains within the batch size budget.

- [ ] **Step 5: Commit catalog**

```bash
git add cloud-assets-source/collector-cards/catalog.json scripts/build-cloud-assets.mjs scripts
git commit -m "feat: publish collector card catalog batch"
```

### Task 4: Deploy Without a Desktop Release

**Files:**
- No source modification unless production verification exposes a catalog/asset defect.

- [ ] **Step 1: Deploy static assets**

Run: `npm run cloud-assets:deploy`

Expected: Wrangler reports successful deployment of the cards static Worker.

- [ ] **Step 2: Verify production catalog**

Fetch the production collector catalog with a cache-busting query and confirm the new `catalogVersion`, entry count, IDs, and asset URLs.

- [ ] **Step 3: Verify a clean client cache**

Open the released desktop client or local production build with collector cache cleared. Confirm the cards appear in 星辉工坊 without reinstalling and that existing ownership remains unchanged.

- [ ] **Step 4: Verify purchase and backup semantics**

Purchase one new card, reopen the app, export a backup, restore it into a clean profile, and confirm ownership restores while card assets redownload from Cloudflare.

- [ ] **Step 5: Record deployment version**

Commit only generated manifest/version changes produced by the established asset pipeline:

```bash
git add cloud-assets-source deploy
git commit -m "chore: record collector card deployment"
```
