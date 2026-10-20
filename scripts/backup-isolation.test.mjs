// Production restore/store/persistence code, fresh DOM storage and a temporary
// on-disk SQLite DB. Only the native IPC boundary is adapted; never uses AppData.
import { JSDOM } from 'jsdom';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestLockManager } from '../src/testSupport/webLocks';

let sandbox, dom, db, databasePath;
const checksum = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sqlPut = (key, value) => db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, value);
const sqlGet = key => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? null;
const nativeBoundary = async (command, args = {}) => {
  if (command === 'get_setting') return sqlGet(args.key);
  if (command === 'set_setting') { sqlPut(args.key, args.value); return; }
  if (command === 'get_all_settings') return db.prepare('SELECT key,value FROM settings').all().map(row => [row.key, row.value]);
  if (command === 'plugin:app|version') return '1.7.53-isolated-test';
  throw new Error(`Unexpected native call in isolation: ${command}`);
};
function sourceBackup() {
  const pets = Array.from({ length: 10 }, (_, i) => ({
    petId: `isolated-pet-${i}`, speciesId: 'capi', petName: `测试智子${i}`,
    level: i + 1, exp: 0, expToNext: 100, hunger: 100, mood: 80, affection: 50,
    obtainedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }));
  const pet = JSON.stringify({ ownedPets: pets, activePetId: pets[0].petId, coins: 12360, foods: { basic: 8 }, gachaRewardMigrationDone: true, companionSlots: 2, desktopCompanionIds: [pets[1].petId] });
  const history = JSON.stringify(Object.fromEntries(Array.from({ length: 375 }, (_, i) => [`p${i}`, 'completed'])));
  return {
    format: 'csp-pet-backup', version: 1, appVersion: '1.7.52', exportedAt: '2026-10-17T09:58:05.121Z',
    localStorage: {
      csp_pet_data: pet, csp_problem_status: history,
      csp_exam_bank_v3: 'x'.repeat(700_000), dungeon_exam_bank_v1: 'x'.repeat(700_000),
      ...Object.fromEntries(['C++ 语法基础', '控制结构', '函数与递归', '数组和字符串', '树与图'].map((topic, i) => [`dungeon_healing_recent_${topic}`, JSON.stringify([`synthetic-q-${i}`])])),
    }, sqlite: { pet_data: pet, problem_status: history }, sprites: {},
  };
}
beforeEach(() => {
  vi.resetModules();
  sandbox = mkdtempSync(join(tmpdir(), 'csp-backup-isolation-'));
  databasePath = join(sandbox, 'test-settings.sqlite');
  db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  // Deliberately conservative 5 MiB UTF-16 quota, not a mock Map.
  dom = new JSDOM('', { url: 'https://isolated-test.invalid/', storageQuota: 5 * 1024 * 1024 / 2 });
  dom.window.__TAURI_INTERNALS__ = { invoke: nativeBoundary };
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  vi.stubGlobal('navigator', { locks: createTestLockManager() });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden during isolated restore'); }));
});
afterEach(async () => {
  const { flushSqliteWrites } = await import('../src/lib/sqlite-storage');
  await flushSqliteWrites();
  db.close(); dom.window.close(); vi.unstubAllGlobals();
  // Only our exact mkdtemp path; contains synthetic fixtures, never private data.
  rmSync(sandbox, { recursive: true });
});

it.each(['empty', 'existing-with-caches'])('restores a legacy-sized backup into %s, reopens SQLite and hydrates without adoption or data loss', async (mode) => {
  const original = sourceBackup();
  const input = join(sandbox, 'synthetic-old-backup.json');
  writeFileSync(input, JSON.stringify(original));
  const beforeHash = checksum(input);
  if (mode !== 'empty') {
    for (const [key, value] of Object.entries(original.localStorage)) localStorage.setItem(key, value);
    const staleWallet = JSON.stringify({ ownedPets: [], coins: 999, savedAt: '2026-10-18T00:00:00Z' });
    sqlPut('pet_data', staleWallet);
  }
  const { applyBackup, parseBackup } = await import('../src/lib/backup');
  const parsed = parseBackup(readFileSync(input, 'utf8'));
  expect(parsed.ok).toBe(true);
  expect(await applyBackup(parsed.data)).toMatchObject({ sqliteFailures: 0, spriteCount: 0 });
  const restored = JSON.parse(localStorage.getItem('csp_pet_data'));
  expect(restored.coins).toBe(12360); expect(restored.ownedPets).toEqual(JSON.parse(original.localStorage.csp_pet_data).ownedPets);
  expect(sqlGet('pet_data')).toBe(localStorage.getItem('csp_pet_data'));
  // A stale window cannot put its old wallet back after the restore.
  const { dualSave } = await import('../src/lib/persist');
  dualSave('pet_data', 'csp_pet_data', '{"ownedPets":[],"coins":0}');
  expect(JSON.parse(localStorage.getItem('csp_pet_data')).coins).toBe(12360);
  db.close(); db = new DatabaseSync(databasePath); vi.resetModules();
  const { usePetStore } = await import('../src/stores/petStore');
  expect(await usePetStore.getState().load()).toBe(true);
  const state = usePetStore.getState();
  expect(state).toMatchObject({ loaded: true, loadError: null, coins: 12360, companionSlots: 2 });
  expect(state.ownedPets.map(p => [p.petId, p.speciesId, p.petName, p.level])).toEqual(JSON.parse(original.localStorage.csp_pet_data).ownedPets.map(p => [p.petId, p.speciesId, p.petName, p.level]));
  const { buildBackup, summarizeBackup } = await import('../src/lib/backup');
  const exported = await buildBackup();
  expect(summarizeBackup(exported)).toMatchObject({ petCount: 10, coins: 12360, completedCourses: 375 });
  expect(exported.localStorage).not.toHaveProperty('csp_exam_bank_v3');
  for (const [key, value] of Object.entries(original.localStorage)) if (key.startsWith('dungeon_healing_recent_')) expect(exported.localStorage[key]).toBe(value);
  expect(checksum(input)).toBe(beforeHash);
  expect(fetch).not.toHaveBeenCalled();
});

it('reports a real SQLite write rejection, retains the local restored wallet, and reloads without choosing the older SQL copy', async () => {
  sqlPut('pet_data', JSON.stringify({ ownedPets: [], coins: 999, savedAt: '2026-10-18T00:00:00Z' }));
  db.exec("CREATE TRIGGER reject_restore BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT,'synthetic disk write failure'); END");
  const { applyBackup } = await import('../src/lib/backup');
  const result = await applyBackup(sourceBackup());
  expect(result.sqliteFailures).toBeGreaterThan(0);
  expect(JSON.parse(sqlGet('pet_data')).coins).toBe(999);
  vi.resetModules();
  const { usePetStore } = await import('../src/stores/petStore');
  expect(await usePetStore.getState().load()).toBe(true);
  expect(usePetStore.getState()).toMatchObject({ coins: 12360, loaded: true, loadError: null });
  expect(usePetStore.getState().ownedPets).toHaveLength(10);
});

it('rejects a quota-exhausted restore without changing the existing wallet or database', async () => {
  const old = JSON.stringify({ ownedPets: [], coins: 789, savedAt: '2026-10-18T00:00:00Z' });
  localStorage.setItem('csp_pet_data', old); sqlPut('pet_data', old);
  const beforeHash = checksum(databasePath);
  // Leave room for the short restore barrier but not a multi-snapshot journal.
  const used = [...Array(localStorage.length)].reduce((n, _, i) => {
    const key = localStorage.key(i); return n + key.length + localStorage.getItem(key).length;
  }, 0);
  localStorage.setItem('unrelated-test-filler', 'x'.repeat(5 * 1024 * 1024 / 2 - used - 1200));
  const { applyBackup } = await import('../src/lib/backup');
  await expect(applyBackup(sourceBackup())).rejects.toThrow('存储');
  expect(localStorage.getItem('csp_pet_data')).toBe(old);
  expect(sqlGet('pet_data')).toBe(old);
  expect(checksum(databasePath)).toBe(beforeHash);
  const { storageWritesAllowed } = await import('../src/lib/restoreBarrier');
  expect(storageWritesAllowed()).toBe(true);
});

it('upgrades a legacy installation in place without a restore, keeping pets, currency, histories and local private notes', async () => {
  const original = sourceBackup();
  for (const [key, value] of Object.entries(original.localStorage)) localStorage.setItem(key, value);
  for (const [key, value] of Object.entries(original.sqlite)) sqlPut(key, value);
  const note = '{"nickname":"测试学生","journal":{"2026-10-18":"仅本机的合成记录"}}';
  localStorage.setItem('csp_profile_data', note); sqlPut('profile_data', note);
  const { usePetStore } = await import('../src/stores/petStore');
  expect(await usePetStore.getState().load()).toBe(true);
  expect(usePetStore.getState()).toMatchObject({ coins: 12360, loaded: true, companionSlots: 2 });
  expect(usePetStore.getState().ownedPets).toHaveLength(10);
  expect(localStorage.getItem('csp_profile_data')).toBe(note);
  expect(localStorage.getItem('csp_problem_status')).toBe(original.localStorage.csp_problem_status);
  expect(fetch).not.toHaveBeenCalled();
});
