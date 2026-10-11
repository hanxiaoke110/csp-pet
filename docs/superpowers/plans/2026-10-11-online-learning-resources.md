# Online Learning Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the P1–Pn classroom-material cards and make all future lesson links, titles, ordering, and visibility update from a Cloudflare static catalog without another desktop release.

**Architecture:** Keep lesson bodies in stable public Feishu documents. Add a small, independently versioned `learning-catalog.json` with a bundled fallback, local cache, Cloudflare/Gitee remote sources, strict validation, and a React update callback. Render classroom materials as C1–C4 accordions beside the existing knowledge rescue and topic review views; do not restore course progress, rewards, downloads, or AI features.

**Tech Stack:** React 19, TypeScript, Zustand-free local metadata caching, Vitest, Node.js validation scripts, Vite, Tauri opener plugin, Cloudflare static assets.

---

### Task 1: Define and validate the learning catalog domain

**Files:**
- Create: `src/components/resources/learningCatalog.ts`
- Create: `src/components/resources/learningCatalog.test.ts`
- Modify: `src/components/resources/types.ts`

- [ ] **Step 1: Write failing validator tests**

Add tests covering a valid two-lesson catalog and rejection of duplicate IDs, duplicate lesson numbers, invalid stages, non-HTTPS/non-Feishu URLs, missing ready URLs, over-500 entries, invalid status, and malformed timestamps.

```ts
expect(validateLearningCatalog(validCatalog)).toBe(true);
expect(validateLearningCatalog({ ...validCatalog, lessons: [lesson, lesson] })).toBe(false);
expect(validateLearningCatalog({ ...validCatalog, lessons: [{ ...lesson, stage: 'C9' }] })).toBe(false);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/components/resources/learningCatalog.test.ts`

Expected: FAIL because `validateLearningCatalog` does not exist.

- [ ] **Step 3: Add focused catalog types and validation**

Define `LearningCatalogStatus`, `LearningCatalogStage`, `LearningCatalogLesson`, and `LearningCatalogData`. Implement a validator that requires schema/catalog versions, validates up to 500 lessons, accepts only `https://*.feishu.cn/docx/*` and `https://*.larksuite.com/docx/*`, permits an empty URL only for `coming_soon`/`hidden`, rejects duplicates, and ignores future unknown fields.

```ts
export type LearningCatalogStage = 'C1' | 'C2' | 'C3' | 'C4';
export type LearningCatalogStatus = 'ready' | 'coming_soon' | 'hidden';

export function validateLearningCatalog(value: unknown): value is LearningCatalogData {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<LearningCatalogData>;
  if (catalog.schemaVersion !== 1 || !Number.isInteger(catalog.catalogVersion)) return false;
  if (!Array.isArray(catalog.lessons) || catalog.lessons.length > 500) return false;
  // validate lesson fields and duplicate sets
  return true;
}
```

- [ ] **Step 4: Add pure filtering and grouping helpers**

Implement `visibleCatalogLessons`, `filterCatalogLessons`, and `groupCatalogLessons` so UI behavior can be tested without a browser.

```ts
export const CATALOG_STAGES: LearningCatalogStage[] = ['C1', 'C2', 'C3', 'C4'];
export function filterCatalogLessons(lessons: LearningCatalogLesson[], query: string) {
  const needle = query.trim().toLowerCase().replace(/^p/, '');
  return lessons.filter(item => !needle || String(item.lessonNo) === needle
    || `p${item.lessonNo}`.includes(query.trim().toLowerCase())
    || [item.title, item.description, ...(item.tags || [])].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
}
```

- [ ] **Step 5: Run the focused tests**

Run: `npx vitest run src/components/resources/learningCatalog.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the domain layer**

```bash
git add src/components/resources/types.ts src/components/resources/learningCatalog.ts src/components/resources/learningCatalog.test.ts
git commit -m "feat: define online learning catalog"
```

### Task 2: Generate and validate the bundled P1–P77 catalog

**Files:**
- Create: `scripts/build-learning-catalog.mjs`
- Create: `scripts/build-learning-catalog.test.mjs`
- Create: `public/course-data/learning-catalog.json`
- Create: `public/course-data/learning-catalog.version.json`
- Modify: `package.json`

- [ ] **Step 1: Write a failing migration test**

Use a temporary directory with a two-entry legacy `course-card-index.json` and a three-lesson `lessons.json`. Assert that existing URLs remain unchanged and the lesson without a URL is emitted as `coming_soon`.

```js
assert.equal(catalog.lessons[0].feishuUrl, legacy.lessons[0].feishuUrl);
assert.equal(catalog.lessons[2].status, 'coming_soon');
assert.equal(catalog.lessons[2].feishuUrl, '');
```

- [ ] **Step 2: Run the migration test and confirm it fails**

Run: `node --test scripts/build-learning-catalog.test.mjs`

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement a deterministic generator**

Export `buildLearningCatalog({ cardIndex, lessonsData, previousCatalog, now })`. Preserve published lesson IDs and URLs, parse `lesson-N`, normalize stage names to C1–C4, derive concise descriptions from existing card metadata when present, emit P70–P77 as `coming_soon`, sort by `lessonNo`, and reject duplicate or missing lesson numbers.

```js
const existing = new Map((cardIndex.lessons || []).map(item => [item.lessonNo, item]));
const lessons = flattenLessons(lessonsData).map(item => {
  const lessonNo = Number(String(item.id).replace(/^lesson-/, ''));
  const card = existing.get(lessonNo);
  return {
    id: `lesson-material-p${String(lessonNo).padStart(3, '0')}`,
    lessonNo,
    title: stripLessonPrefix(item.title),
    stage: normalizeStage(item.stageId),
    feishuUrl: card?.feishuUrl || '',
    status: card?.feishuUrl ? 'ready' : 'coming_soon',
    requiresClassCode: false,
  };
});
```

- [ ] **Step 4: Generate the real bundled files**

Run: `node scripts/build-learning-catalog.mjs`

Expected: `learning-catalog.json` contains 77 unique lessons, P1–P69 preserve their current Feishu URLs, and P70–P77 are `coming_soon` with no guessed URL. The version file contains the same positive catalog version.

- [ ] **Step 5: Add package scripts**

Add:

```json
"learning-catalog:build": "node scripts/build-learning-catalog.mjs",
"learning-catalog:test": "node --test scripts/build-learning-catalog.test.mjs"
```

- [ ] **Step 6: Run the migration and domain tests**

Run: `npm run learning-catalog:test && npx vitest run src/components/resources/learningCatalog.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit catalog generation**

```bash
git add scripts/build-learning-catalog.mjs scripts/build-learning-catalog.test.mjs public/course-data/learning-catalog.json public/course-data/learning-catalog.version.json package.json package-lock.json
git commit -m "feat: migrate classroom materials catalog"
```

### Task 3: Add cached Cloudflare loading with live React refresh

**Files:**
- Modify: `src/utils/versionedRemoteJson.ts`
- Modify: `src/utils/versionedRemoteJson.test.ts`
- Modify: `src/components/resources/learningCatalog.ts`
- Modify: `src/components/resources/learningCatalog.test.ts`

- [ ] **Step 1: Write failing callback and downgrade tests**

Add tests asserting that a newer valid remote catalog calls `onUpdated`, an older remote version does not replace a newer cache, malformed remote JSON does not overwrite cache, and Cloudflare failure falls back to Gitee.

```ts
const onUpdated = vi.fn();
await loadVersionedRemoteJson({ ...options, onUpdated });
await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(remoteCatalog));
```

- [ ] **Step 2: Run the loader tests and confirm they fail**

Run: `npx vitest run src/utils/versionedRemoteJson.test.ts src/components/resources/learningCatalog.test.ts`

Expected: FAIL because `onUpdated` and the catalog loader are absent.

- [ ] **Step 3: Extend the generic versioned loader**

Add `onUpdated?: (data: T) => void` to `LoadVersionedJsonOptions`. Invoke it only after remote data passes validation and is written to cache. Never lower the stored version.

```ts
if (options.validate(remoteData)) {
  writeCached(options.cacheKey, remoteData);
  localStorage.setItem(options.versionKey, String(options.version));
  options.onUpdated?.(remoteData);
}
```

- [ ] **Step 4: Implement the learning-catalog loader**

Wrap `loadVersionedRemoteJson` with independent keys and filenames.

```ts
export function loadLearningCatalog(onUpdated?: (data: LearningCatalogData) => void) {
  return loadVersionedRemoteJson<LearningCatalogData>({
    cacheKey: 'csp_learning_catalog_cache_v1',
    versionKey: 'csp_learning_catalog_version_v1',
    versionFile: 'learning-catalog.version.json',
    dataFile: 'learning-catalog.json',
    bundledUrl: '/course-data/learning-catalog.json',
    validate: validateLearningCatalog,
    onUpdated,
  });
}
```

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/utils/versionedRemoteJson.test.ts src/components/resources/learningCatalog.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit remote loading**

```bash
git add src/utils/versionedRemoteJson.ts src/utils/versionedRemoteJson.test.ts src/components/resources/learningCatalog.ts src/components/resources/learningCatalog.test.ts
git commit -m "feat: load learning materials from static catalog"
```

### Task 4: Restore classroom materials as stage accordions

**Files:**
- Create: `src/components/resources/ClassroomResources.tsx`
- Create: `src/components/resources/ClassroomResources.test.tsx`
- Modify: `src/components/resources/LearningResourcesPage.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing render tests**

Render with `react-dom/server` and assert C1–C4 headings, counts, P labels, ready/coming-soon states, no hidden lessons, no reward/progress wording, and a locked label for class-code-only material when no class code exists.

```tsx
const html = renderToStaticMarkup(<ClassroomResources catalog={catalog} query="" hasClassCode={false} onOpen={() => {}} onCopy={() => {}} />);
expect(html).toContain('C1 入门阶段');
expect(html).toContain('P1');
expect(html).toContain('制作中');
expect(html).not.toMatch(/金币|经验|奖励|完成进度/);
```

- [ ] **Step 2: Run the component test and confirm it fails**

Run: `npx vitest run src/components/resources/ClassroomResources.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the accordion component**

Keep accordion state inside the component, default the first non-empty stage to open, auto-expand all matching stages while searching, display stage count/range, and render accessible buttons. Ready cards open Feishu, coming-soon cards show their state, hidden cards never reach the component.

```tsx
const groups = groupCatalogLessons(filterCatalogLessons(visibleCatalogLessons(catalog.lessons), query));
const [openStages, setOpenStages] = useState<Set<LearningCatalogStage>>(
  () => new Set(groups.find(group => group.lessons.length)?.stage ? [groups.find(group => group.lessons.length)!.stage] : []),
);
```

- [ ] **Step 4: Integrate the three top-level views**

Change the view keys to `classroom | rescue | review`, default to `classroom`, load catalog independently from existing knowledge data, and keep a catalog failure from blocking knowledge rescue or topic review. Rename existing content without changing its underlying JSON:

```ts
const VIEWS = [
  { key: 'classroom', label: '课堂资料', hint: '按 C1–C4 查找每节课的讲义' },
  { key: 'rescue', label: '知识点救援', hint: '做题后查漏补缺' },
  { key: 'review', label: '专题复习', hint: '一轮专题与二轮路径' },
] as const;
```

- [ ] **Step 5: Add robust open/copy behavior**

Use the Tauri opener for valid HTTPS URLs, browser fallback outside Tauri, and a small inline status message. When open fails, call `navigator.clipboard.writeText(url)` only after the student presses “复制链接”. Class-code-only entries send unbound users to `/settings` instead of opening the document.

- [ ] **Step 6: Add responsive styles**

Add focused classes for stage headers, lesson rows/cards, status chips, and action buttons. Verify no horizontal overflow at 1366×768 and narrow desktop windows.

- [ ] **Step 7: Run focused UI and type tests**

Run: `npx vitest run src/components/resources/ClassroomResources.test.tsx src/components/resources/learningCatalog.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 8: Commit the page**

```bash
git add src/components/resources/ClassroomResources.tsx src/components/resources/ClassroomResources.test.tsx src/components/resources/LearningResourcesPage.tsx src/App.css
git commit -m "feat: restore online classroom materials"
```

### Task 5: Add publishing gates and Cloudflare packaging

**Files:**
- Create: `scripts/validate-learning-catalog.mjs`
- Create: `scripts/validate-learning-catalog.test.mjs`
- Modify: `scripts/build-cloud-assets.mjs`
- Modify: `package.json`
- Modify: `docs/release/cloud-static-assets.md`

- [ ] **Step 1: Write failing publishing-gate tests**

Test duplicate lesson numbers, duplicate IDs, invalid Feishu domains, missing ready URLs, mismatched version files, and a valid catalog. The validator must return nonzero on any failure.

```js
assert.deepEqual(validateCatalog(validCatalog, { version: 3 }), []);
assert.match(validateCatalog(duplicateCatalog, { version: 3 }).join('\n'), /lessonNo.*重复/);
assert.match(validateCatalog(validCatalog, { version: 2 }).join('\n'), /版本不一致/);
```

- [ ] **Step 2: Run the gate test and confirm it fails**

Run: `node --test scripts/validate-learning-catalog.test.mjs`

Expected: FAIL because the gate does not exist.

- [ ] **Step 3: Implement the standalone validator**

Export a pure `validateCatalog(catalog, versionInfo)` and add a CLI that reads the public files, prints all failures, and exits with code 1. Keep network permission auditing as a warning/report because Feishu may redirect automated no-cookie requests even for public documents.

- [ ] **Step 4: Wire it into asset validation and Cloudflare build**

Add:

```json
"learning-catalog:validate": "node scripts/validate-learning-catalog.mjs"
```

Run it before `cloud-assets:build`, and make `build-cloud-assets.mjs` parse both catalog files. Do not add the new files to the production prune list.

- [ ] **Step 5: Document the no-release workflow**

Update `docs/release/cloud-static-assets.md` with two exact paths:

1. Existing lesson edit: edit the same Feishu document and verify public-read permission; no deploy or app release.
2. New lesson/metadata change: update the catalog, increment the catalog version, validate, run `npm run cloud-assets:deploy`, verify the two Cloudflare URLs and the new Feishu document in an incognito browser; no app release.

- [ ] **Step 6: Run publishing tests and build staging**

Run: `node --test scripts/validate-learning-catalog.test.mjs && npm run learning-catalog:validate && npm run cloud-assets:build`

Expected: PASS; `.cloudflare-static/course-data/learning-catalog.json` and its version file exist and parse.

- [ ] **Step 7: Commit the publishing workflow**

```bash
git add scripts/validate-learning-catalog.mjs scripts/validate-learning-catalog.test.mjs scripts/build-cloud-assets.mjs package.json package-lock.json docs/release/cloud-static-assets.md
git commit -m "build: validate online learning materials"
```

### Task 6: Perform regression, migration, and manual UI verification

**Files:**
- Modify only if verification finds a concrete defect.

- [ ] **Step 1: Verify the migration exactly**

Run a comparison script asserting all P1–P69 lesson numbers, titles, and Feishu URLs match `course-card-index.json`; P70–P77 are present only as `coming_soon`; all 77 IDs are unique.

Expected: no mismatches.

- [ ] **Step 2: Run all automated checks**

Run:

```bash
npm test -- --run
npm run learning-catalog:validate
npm run validate:assets
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

Expected: all commands pass. Existing `objc` cfg warnings on macOS are acceptable if unchanged.

- [ ] **Step 3: Inspect the page in the built UI**

Open `/resources` and verify:

- 课堂资料 is the default tab;
- C1–C4 are stage accordions;
- P1 and P69 show active Feishu actions;
- P70–P77 show 制作中;
- searching `P69`, `69`, and `栈` reaches P69;
- knowledge rescue and topic review still render;
- no course progress, rewards, or AI controls appear.

- [ ] **Step 4: Simulate remote failure and refresh**

Verify the bundled catalog appears with no network. Then serve a higher-version test catalog, verify the current page refreshes after the background download, reload the page, and verify the cache survives.

- [ ] **Step 5: Confirm repository cleanliness and summarize release impact**

Run: `git status --short && git log --oneline -8`

Expected: no uncommitted files. Report that this feature requires one client release, while later Feishu body edits require no deploy and later lesson additions require only a static Cloudflare catalog deploy.

