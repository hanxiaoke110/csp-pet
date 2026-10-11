# Trial Equipment and Economy Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backward-compatible five-element equipment system with 20 weapons, 15 armors, upgrades, exploration materials, deterministic purchases, 80% dismantling, and uncapped rating-based battle coins.

**Architecture:** Separate immutable catalog definitions from local ownership records and combat calculations. Load a validated static Cloudflare catalog with bundled fallback, but allow only whitelisted effect primitives. Route every purchase, upgrade, dismantle, reward, and settlement through testable store services so UI actions cannot create or destroy currency inconsistently.

**Tech Stack:** TypeScript, Zustand, React, Phaser 3, Vitest, Cloudflare static assets, existing Tauri backup pipeline.

---

## File Structure

- Modify `src-dungeon/types/exploration.ts`: catalog, ownership, materials, acquisition, and effect types.
- Create `src-dungeon/data/equipmentCatalog.ts`: bundled 20-weapon/15-armor definitions.
- Create `src-dungeon/data/equipmentCatalog.test.ts`: cardinality, IDs, price, elements, and effect validation.
- Create `src-dungeon/services/equipmentCatalogService.ts`: cached remote catalog with bundled fallback.
- Create `src-dungeon/services/equipmentCatalogService.test.ts`: remote validation and fallback.
- Modify `src-dungeon/stores/trialEquipmentStore.ts`: schema v2 migration, purchase, upgrade, dismantle, materials.
- Modify `src-dungeon/stores/trialEquipmentStore.test.ts`: migration and economic invariants.
- Create `src-dungeon/utils/equipmentCombat.ts`: pure weapon/armor formulas.
- Create `src-dungeon/utils/equipmentCombat.test.ts`: exact 0–5 formulas and element cycle.
- Modify `src-dungeon/utils/combatLogic.ts`: remove pet-element damage multiplier from base damage.
- Modify `src-dungeon/phaser/scenes/BattleScene.ts`: apply generic equipment combat result and metrics.
- Modify `src-dungeon/utils/trialEquipmentEffects.ts`: retain whitelisted special effects only.
- Modify `src-dungeon/components/screens/BattleScreen.tsx`: show attack/defense relation.
- Modify `src-dungeon/components/screens/RewardScreen.tsx`: effect and rating breakdown.
- Modify `src-dungeon/stores/dungeonStore.ts`: rating coins and idempotent settlement.
- Modify `src-dungeon/stores/dungeonStore.test.ts`: uncapped rewards and duplicate settlement.
- Modify `src-dungeon/components/screens/TrialSupplyScreen.tsx`: equipment shop, filtering, compare, upgrade, dismantle.
- Create `src-dungeon/components/screens/trialSupplyViewModel.ts`: pure filters, comparisons, and confirmation copy.
- Modify `src-dungeon/App.css`: equipment detail/compare layout.
- Modify `src/lib/backup.test.ts`: v2 equipment round-trip.
- Create `cloud-assets-source/equipment/catalog.json`: online catalog source.
- Modify `scripts/build-cloud-assets.mjs`: publish equipment catalog/static assets.
- Create `scripts/validate-equipment-catalog.mjs` and test: release validation.

### Task 1: Define Equipment Schema and Bundled Catalog

**Files:**
- Modify: `src-dungeon/types/exploration.ts`
- Create: `src-dungeon/data/equipmentCatalog.ts`
- Create: `src-dungeon/data/equipmentCatalog.test.ts`

- [ ] **Step 1: Write failing catalog invariants**

```ts
it('contains five elements at every weapon rarity', () => {
  for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
    const items = Object.values(BUNDLED_EQUIPMENT).filter(i => i.category === 'weapon' && i.rarity === rarity);
    expect(items.map(i => i.element).sort()).toEqual(['earth', 'fire', 'light', 'water', 'wind']);
  }
});

it('contains three armor rarities for every element', () => {
  for (const element of ['earth', 'fire', 'wind', 'water', 'light'] as const) {
    expect(Object.values(BUNDLED_EQUIPMENT).filter(i => i.category === 'armor' && i.element === element)).toHaveLength(3);
  }
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/data/equipmentCatalog.test.ts`

Expected: FAIL because the new catalog does not exist.

- [ ] **Step 3: Add exact types**

Define:

```ts
export type EquipmentElement = 'earth' | 'fire' | 'wind' | 'water' | 'light';
export type EquipmentCategory = 'weapon' | 'armor' | 'artifact' | 'consumable';
export type AcquisitionSource = 'legacy' | 'shop' | 'exploration' | 'reward';
export type EquipmentEffect =
  | { type: 'openingShield'; percent: number; maxTriggers: 1 }
  | { type: 'correctAnswerDamage'; percent: number; maxTriggers: number }
  | { type: 'comboDamage'; combo: number; percent: number; maxTriggers: number }
  | { type: 'lowHealthRecovery'; threshold: number; healPercent: number; shieldPercent: number; maxTriggers: 1 };

export interface TrialEquipmentDefinition {
  id: string;
  name: string;
  category: EquipmentCategory;
  rarity: EquipmentRarity;
  element?: EquipmentElement;
  icon: string;
  description: string;
  scope: string;
  price: number;
  attack?: number;
  defense?: number;
  effects?: EquipmentEffect[];
  materialId?: string;
}
```

- [ ] **Step 4: Create 20 weapons and 15 armors**

Preserve the eight current weapon IDs and four armor IDs. Add 12 missing weapons and enough armor definitions to reach three rarities per element. Use fixed prices inside the approved bands and validate all IDs, icons, elements, prices, and effect values at module load.

- [ ] **Step 5: Run catalog tests**

Run: `npx vitest run src-dungeon/data/equipmentCatalog.test.ts`

Expected: PASS with exactly 20 weapons and 15 armors.

- [ ] **Step 6: Commit schema and catalog**

```bash
git add src-dungeon/types/exploration.ts src-dungeon/data/equipmentCatalog.ts src-dungeon/data/equipmentCatalog.test.ts
git commit -m "feat: define five-element equipment catalog"
```

### Task 2: Add Validated Online Catalog Loading

**Files:**
- Create: `src-dungeon/services/equipmentCatalogService.ts`
- Create: `src-dungeon/services/equipmentCatalogService.test.ts`
- Create: `cloud-assets-source/equipment/catalog.json`
- Create: `scripts/validate-equipment-catalog.mjs`
- Create: `scripts/validate-equipment-catalog.test.mjs`
- Modify: `scripts/build-cloud-assets.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failure/fallback tests**

```ts
it('rejects unknown executable effect types', async () => {
  mockFetch({ catalogVersion: 2, items: [{ ...validWeapon, effects: [{ type: 'runScript', code: 'x' }] }] });
  expect(await loadEquipmentCatalog()).toEqual(BUNDLED_EQUIPMENT);
});

it('keeps owned compatibility definitions when an item is remotely hidden', async () => {
  mockFetch({ catalogVersion: 2, items: [] });
  const catalog = await loadEquipmentCatalog(['xuanwu-hammer-common']);
  expect(catalog['xuanwu-hammer-common']).toBeDefined();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/services/equipmentCatalogService.test.ts`

Expected: FAIL because the loader is absent.

- [ ] **Step 3: Implement cache-first loader**

Use `https://cards.cspstudy.top/equipment/catalog.json`, a 5-second timeout, a versioned local cache, and bundled fallback. Reject duplicate IDs, unknown effects, missing element on weapons/armors, prices outside 0–2000, levels outside the supported schema, and more than 300 entries.

- [ ] **Step 4: Add build-time validator and package scripts**

Add:

```json
"equipment-catalog:validate": "node scripts/validate-equipment-catalog.mjs"
```

Make `cloud-assets:build` execute this validator before copying the equipment directory.

- [ ] **Step 5: Run loader and catalog validation**

Run: `npx vitest run src-dungeon/services/equipmentCatalogService.test.ts scripts/validate-equipment-catalog.test.mjs && npm run equipment-catalog:validate`

Expected: PASS.

- [ ] **Step 6: Commit online catalog infrastructure**

```bash
git add src-dungeon/services cloud-assets-source/equipment scripts/validate-equipment-catalog.mjs scripts/validate-equipment-catalog.test.mjs scripts/build-cloud-assets.mjs package.json
git commit -m "feat: load equipment from static catalog"
```

### Task 3: Migrate Equipment Ownership to Schema v2

**Files:**
- Modify: `src-dungeon/stores/trialEquipmentStore.ts`
- Modify: `src-dungeon/stores/trialEquipmentStore.test.ts`

- [ ] **Step 1: Write failing legacy migration tests**

```ts
it('migrates legacy owned items exactly once', () => {
  localStorage.setItem('csp_trial_equipment_v1', JSON.stringify({
    ownedItems: [{ id: 'legacy-1', definitionId: 'xuanwu-hammer-common', acquiredAt: 1, quantity: 1 }],
    equippedWeaponId: 'legacy-1', soulFragments: 9,
  }));
  useTrialEquipmentStore.getState().load();
  const item = useTrialEquipmentStore.getState().ownedItems[0];
  expect(item).toMatchObject({ upgradeLevel: 0, purchasePrice: 0, investedCoins: 0, acquisitionSource: 'legacy' });
  useTrialEquipmentStore.getState().load();
  expect(useTrialEquipmentStore.getState().ownedItems).toHaveLength(1);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/stores/trialEquipmentStore.test.ts`

Expected: FAIL because v1 items lack v2 fields.

- [ ] **Step 3: Add v2 ownership and material state**

Use:

```ts
export interface OwnedTrialItem {
  id: string;
  definitionId: string;
  acquiredAt: number;
  quantity: number;
  upgradeLevel: 0 | 1 | 2 | 3 | 4 | 5;
  purchasePrice: number;
  investedCoins: number;
  acquisitionSource: AcquisitionSource;
}
```

Persist `schemaVersion: 2`, `materials: Record<string, number>`, all equipment slots, and compatibility IDs. Unknown definitions remain stored but are excluded from equip actions.

- [ ] **Step 4: Run store tests**

Run: `npx vitest run src-dungeon/stores/trialEquipmentStore.test.ts`

Expected: PASS including repeated-load idempotence.

- [ ] **Step 5: Commit v2 migration**

```bash
git add src-dungeon/types/exploration.ts src-dungeon/stores/trialEquipmentStore.ts src-dungeon/stores/trialEquipmentStore.test.ts
git commit -m "feat: migrate trial equipment ownership"
```

### Task 4: Implement Purchase, Upgrade, and Dismantle Transactions

**Files:**
- Modify: `src-dungeon/stores/trialEquipmentStore.ts`
- Modify: `src-dungeon/stores/trialEquipmentStore.test.ts`

- [ ] **Step 1: Add failing economic invariant tests**

```ts
it('refunds floor 80 percent of purchase and upgrade coins only', () => {
  buy('fire-weapon-epic', 400);
  grantMaterial('ember-core', 99);
  upgrade('fire-weapon-epic'); // 45g
  expect(dismantle('fire-weapon-epic').refundedCoins).toBe(Math.floor(445 * 0.8));
  expect(materialCount('ember-core')).toBeLessThan(99);
});

it('refunds no purchase value for exploration drops', () => {
  grantItem('water-armor-rare', 'exploration');
  expect(dismantle('water-armor-rare').refundedCoins).toBe(0);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/stores/trialEquipmentStore.test.ts`

Expected: FAIL because transactions are missing.

- [ ] **Step 3: Implement service actions**

Expose typed results:

```ts
buyItem(definitionId: string): { ok: boolean; reason?: string };
upgradeItem(ownedItemId: string): { ok: boolean; level?: number; reason?: string };
dismantleItem(ownedItemId: string): { ok: boolean; refundedCoins: number; reason?: string };
grantMaterial(materialId: string, amount: number): void;
```

Check wallet and materials before mutation. Spend/refund through `usePetStore`. For dismantle, calculate `Math.floor((purchasePrice + investedCoins) * 0.8)`, never return materials, clear an equipped slot before deleting the item, and persist once after the complete operation.

- [ ] **Step 4: Run store and pet wallet tests**

Run: `npx vitest run src-dungeon/stores/trialEquipmentStore.test.ts src/stores/petStore.test.ts`

Expected: PASS with currency conservation.

- [ ] **Step 5: Commit equipment transactions**

```bash
git add src-dungeon/stores/trialEquipmentStore.ts src-dungeon/stores/trialEquipmentStore.test.ts
git commit -m "feat: add equipment upgrades and dismantling"
```

### Task 5: Implement Exact Equipment Combat Formulas

**Files:**
- Create: `src-dungeon/utils/equipmentCombat.ts`
- Create: `src-dungeon/utils/equipmentCombat.test.ts`
- Modify: `src-dungeon/utils/combatLogic.ts`
- Modify: `src-dungeon/utils/combatLogic.test.ts`

- [ ] **Step 1: Write exact table tests**

```ts
it.each([
  [0, 105], [1, 110], [2, 115], [3, 120], [4, 125], [5, 130],
])('weapon +%i changes 100 damage to %i', (level, expected) => {
  expect(applyWeaponDamage(100, weapon('fire', level), enemy('earth'))).toBe(expected);
});

it('stacks base weapon and elemental advantage multiplicatively', () => {
  expect(applyWeaponDamage(100, weapon('fire', 0), enemy('wind'))).toBe(126);
});

it.each([[0, 90], [1, 86], [2, 82], [3, 78], [4, 74], [5, 70]])(
  'armor +%i reduces 100 damage to %i when it counters the enemy',
  (level, expected) => expect(applyArmorReduction(100, armor('fire', level), enemy('wind'))).toBe(expected),
);
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/utils/equipmentCombat.test.ts src-dungeon/utils/combatLogic.test.ts`

Expected: FAIL because current combat uses pet 1.25/0.85 multipliers.

- [ ] **Step 3: Implement pure formulas**

```ts
export const ELEMENT_COUNTERS = { fire: 'wind', wind: 'earth', earth: 'water', water: 'light', light: 'fire' } as const;
export const weaponMultiplier = (level: number) => 1.05 + clampLevel(level) * 0.05;
export const armorReduction = (level: number) => 0.10 + clampLevel(level) * 0.04;
```

Apply `1.20` only when the weapon/armor counter matches. Use `Math.floor`, minimum damage 1, and remove pet element multiplication from `calculateDamage` while keeping the pet element field for display/passives.

- [ ] **Step 4: Run formula tests**

Run: `npx vitest run src-dungeon/utils/equipmentCombat.test.ts src-dungeon/utils/combatLogic.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit formulas**

```bash
git add src-dungeon/utils/equipmentCombat.ts src-dungeon/utils/equipmentCombat.test.ts src-dungeon/utils/combatLogic.ts src-dungeon/utils/combatLogic.test.ts
git commit -m "feat: apply equipment elemental combat rules"
```

### Task 6: Connect Equipment Effects and Battle Metrics

**Files:**
- Modify: `src-dungeon/phaser/scenes/BattleScene.ts`
- Modify: `src-dungeon/utils/trialEquipmentEffects.ts`
- Modify: `src-dungeon/utils/trialEquipmentEffects.test.ts`
- Modify: `src-dungeon/types/dungeon.ts`
- Modify: `src-dungeon/components/screens/BattleScreen.tsx`
- Modify: `src-dungeon/components/screens/RewardScreen.tsx`

- [ ] **Step 1: Add failing battle metric tests**

Assert a fire weapon against wind records `elementBonusDamage`, a countering armor records `equipmentDamagePrevented`, and max-trigger effects stop exactly at their catalog limit.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/utils/trialEquipmentEffects.test.ts`

Expected: FAIL until generic definitions and metrics are connected.

- [ ] **Step 3: Apply weapon and armor around base damage**

In player attacks, compute base damage first, then `applyWeaponDamage`. In enemy attacks, compute base incoming damage, then `applyArmorReduction`, then consume shields. Store these metrics on battle state:

```ts
equipmentDamageAdded: number;
equipmentDamagePrevented: number;
equipmentTriggers: Record<string, number>;
```

- [ ] **Step 4: Replace ID-specific branches with effect-type switches**

Every switch must be exhaustive over `EquipmentEffect['type']`; unknown remote effects have already been rejected by the catalog loader. Preserve current visible behavior for legacy hammer, spear, armor, and artifacts where it does not contradict the new base formula.

- [ ] **Step 5: Add battle and reward explanations**

Show equipped attack/defense elements at battle start. RewardScreen displays added damage, prevented damage, and trigger counts under a collapsible “本场装备效果”.

- [ ] **Step 6: Run tests and dungeon build**

Run: `npx vitest run src-dungeon/utils/trialEquipmentEffects.test.ts src-dungeon/utils/equipmentCombat.test.ts && npm run build:dungeon`

Expected: PASS and build exits 0.

- [ ] **Step 7: Commit battle integration**

```bash
git add src-dungeon/phaser/scenes/BattleScene.ts src-dungeon/utils/trialEquipmentEffects.ts src-dungeon/utils/trialEquipmentEffects.test.ts src-dungeon/types/dungeon.ts src-dungeon/components/screens/BattleScreen.tsx src-dungeon/components/screens/RewardScreen.tsx
git commit -m "feat: connect equipment to trial combat"
```

### Task 7: Replace Coin Caps with Rating Rewards and Idempotent Settlement

**Files:**
- Modify: `src-dungeon/stores/dungeonStore.ts`
- Modify: `src-dungeon/stores/dungeonStore.test.ts`
- Modify: `src-dungeon/types/dungeon.ts`

- [ ] **Step 1: Add failing reward tests**

```ts
it.each([['D', 40], ['C', 45], ['B', 50], ['A', 60], ['S', 75], ['SS', 90]])(
  'grants %s rating at least %i coins without weekly cap',
  (rating, expected) => expect(settleWonBattle({ rating }).petCoinsEarned).toBeGreaterThanOrEqual(expected),
);

it('does not settle the same battle twice', () => {
  const first = finalizeBattle('d1', false);
  const second = finalizeBattle('d1', false);
  expect(first?.petCoinsEarned).toBeGreaterThan(0);
  expect(second).toBeNull();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/stores/dungeonStore.test.ts`

Expected: FAIL because the ledger caps daily/weekly grants and battle settlement is not keyed by a durable ID.

- [ ] **Step 3: Add battle settlement IDs and rating table**

Create a battle UUID at battle start and persist a bounded list of recently settled IDs. Use:

```ts
export const RATING_COIN_REWARD = { D: 40, C: 45, B: 50, A: 60, S: 75, SS: 90 } as const;
```

Only a won, reward-eligible battle with completed questions receives the rating amount. Add first-clear/Boss bonuses afterward.

- [ ] **Step 4: Remove daily/weekly coin clipping**

Make `grantPetCoins(amount)` grant the validated non-negative integer directly through `usePetStore.addCoins`. Retain compatibility-shaped `dailyRemaining` and `weeklyRemaining` as `null` until the old UI fields are removed, then update their types and RewardScreen copy to “本周不限次数”.

- [ ] **Step 5: Run reward tests**

Run: `npx vitest run src-dungeon/stores/dungeonStore.test.ts src/stores/petStore.test.ts`

Expected: PASS, including totals well above the old weekly 150 cap.

- [ ] **Step 6: Commit reward economy**

```bash
git add src-dungeon/stores/dungeonStore.ts src-dungeon/stores/dungeonStore.test.ts src-dungeon/types/dungeon.ts src-dungeon/components/screens/RewardScreen.tsx
git commit -m "feat: reward every rated trial clear"
```

### Task 8: Add Exploration Materials and Deterministic Sources

**Files:**
- Modify: `src-dungeon/data/explorationStages.ts`
- Modify: `src-dungeon/components/screens/ExplorationScreen.tsx`
- Modify: `src-dungeon/stores/explorationStore.ts`
- Modify: `src-dungeon/stores/explorationStore.test.ts`

- [ ] **Step 1: Add failing deterministic drop tests**

For all 40 stage configs, assert each configured material ID is valid and every rarity's +1 through +5 material path is reachable from a stage at the corresponding difficulty.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/stores/explorationStore.test.ts`

Expected: FAIL because material rewards are absent.

- [ ] **Step 3: Define material reward entries**

Add explicit `materialRewards` to stage configs and event resolution. A reward entry includes `{ materialId, amount, source: 'seal' | 'treasure' | 'boss-first-clear' }`. Do not use hidden random rarity or paid acquisition.

- [ ] **Step 4: Grant materials once at settlement**

Use the exploration `settled` flag and resolved event IDs to prevent reload duplication. Display material icons/amounts in the exploration result.

- [ ] **Step 5: Run all exploration tests**

Run: `npx vitest run src-dungeon/stores/explorationStore.test.ts src-dungeon/utils/explorationLogic.test.ts src-dungeon/data/explorationAssets.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit exploration materials**

```bash
git add src-dungeon/data/explorationStages.ts src-dungeon/components/screens/ExplorationScreen.tsx src-dungeon/stores/explorationStore.ts src-dungeon/stores/explorationStore.test.ts
git commit -m "feat: add deterministic upgrade materials"
```

### Task 9: Build Equipment Shop, Compare, Upgrade, and Dismantle UI

**Files:**
- Modify: `src-dungeon/components/screens/TrialSupplyScreen.tsx`
- Create: `src-dungeon/components/screens/trialSupplyViewModel.ts`
- Modify: `src-dungeon/App.css`
- Create: `src-dungeon/components/screens/TrialSupplyScreen.test.tsx`

- [ ] **Step 1: Add failing view-model and server-render tests**

Use pure view-model tests for element/rarity filters, comparison deltas, upgrade confirmation, insufficient-material copy, dismantle refund preview, and equipped-item confirmation. Use `renderToStaticMarkup` to assert the shop/inventory tabs and fixed detail controls are present; store transaction behavior remains covered by `trialEquipmentStore.test.ts`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src-dungeon/components/screens/TrialSupplyScreen.test.tsx`

Expected: FAIL because the equipment shop and actions do not exist.

- [ ] **Step 3: Add shop and inventory tabs**

Render filters for all five elements and four rarities. Clicking a card opens a persistent detail panel; hover may preview but cannot be the only access path.

- [ ] **Step 4: Add complete rule explanation**

The panel shows current +N, fixed stats, weapon/armor formula, counter target, special effect, trigger/reset conditions, next-level cost, invested coins, and exact dismantle refund. Comparison rows use green increases and red decreases against the equipped slot.

- [ ] **Step 5: Wire transactional confirmations**

Use store results as the source of truth. Disable repeated submissions while pending and close confirmation only after success.

- [ ] **Step 6: Run UI tests and dungeon build**

Run: `npx vitest run src-dungeon/components/screens/TrialSupplyScreen.test.tsx && npm run build:dungeon`

Expected: PASS and build exits 0.

- [ ] **Step 7: Commit equipment UI**

```bash
git add src-dungeon/components/screens/TrialSupplyScreen.tsx src-dungeon/components/screens/trialSupplyViewModel.ts src-dungeon/components/screens/TrialSupplyScreen.test.tsx src-dungeon/App.css
git commit -m "feat: add trial equipment workshop"
```

### Task 10: Verify Backup and Full Release

**Files:**
- Modify: `src/lib/backup.test.ts`
- Modify only affected files when a regression exposes a defect.

- [ ] **Step 1: Add v2 round-trip tests**

Back up and restore an owned +3 legendary weapon, purchase price, invested coins, acquisition source, materials, and all three equipped slots. Also restore a v1 backup and assert +0 migration.

- [ ] **Step 2: Run backup tests**

Run: `npx vitest run src/lib/backup.test.ts src-dungeon/stores/trialEquipmentStore.test.ts`

Expected: PASS.

- [ ] **Step 3: Run all tests and validation**

Run: `npm test && npm run equipment-catalog:validate && npm run validate:assets`

Expected: all tests and validators PASS.

- [ ] **Step 4: Build desktop, dungeon, and Rust shell**

Run: `npm run build && npm run build:dungeon && cargo check --manifest-path src-tauri/Cargo.toml`

Expected: exit 0 with no new warnings.

- [ ] **Step 5: Measure Windows package and perform smoke test**

Build the Windows installer in the established release environment. Record installer size, upgrade over an old user profile, verify old equipment and wallet, finish a D/SS battle, upgrade and dismantle an item, export backup, and restore it into a clean profile.

- [ ] **Step 6: Commit release validation**

```bash
git add src/lib/backup.test.ts src-dungeon src scripts cloud-assets-source package.json
git commit -m "test: validate equipment economy release"
```
