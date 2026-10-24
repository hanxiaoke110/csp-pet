import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worker from './api.js';

let sql;
let db;
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  let transactionQueue = Promise.resolve();
  db = {
    async exec(query) { sql.exec(query); },
    prepare(query) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async all() { return { results: sql.prepare(query).all(...args) }; },
        async run() {
          const result = sql.prepare(query).run(...args);
          return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        },
      };
    },
    batch(statements) {
      const task = transactionQueue.then(async () => {
        sql.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          sql.exec('COMMIT');
          return results;
        } catch (error) { sql.exec('ROLLBACK'); throw error; }
      });
      transactionQueue = task.catch(() => {});
      return task;
    },

  };
  sql.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO meta VALUES('schema_version','13');
    CREATE TABLE rate_limits(key TEXT PRIMARY KEY, count INTEGER, reset_at TEXT);
    CREATE TABLE generated_codes(code TEXT PRIMARY KEY, type TEXT, coins INTEGER, exp INTEGER, class_code TEXT, status TEXT, used_at TEXT, used_device_hash TEXT);
    CREATE TABLE comp_claims(code TEXT PRIMARY KEY, device_hash TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE class_students(class_code TEXT, device_hash TEXT, student_name TEXT, phone TEXT, status TEXT);
    INSERT INTO generated_codes VALUES('CMP-TEST','comp',100,200,'','unused',NULL,NULL);
    INSERT INTO class_students VALUES('CLASS1','device','原名','13800000000','active');`);
});
afterEach(() => sql.close());
const request = (path, body) => worker.fetch(new Request('https://test.invalid' + path, {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}), { DB: db }, { waitUntil() {} });
const claim = (device = 'device', path = '/api/codes/redeem-v2') => request(path, { code: 'CMP-TEST', device_hash: device });

it('replays an identical V2 receipt to its device after a lost response', async () => {
  const first = await claim();
  expect(first.status).toBe(200);
  const receipt = await first.json();
  expect(receipt.receipt_id).toBe('cmp-v2:CMP-TEST');
  const retry = await claim();
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual(receipt);
  expect((await claim('other')).status).toBe(400);
  expect((await claim('device', '/api/codes/redeem')).status).toBe(400);
});
it('does not replay a historical V1 claim through V2', async () => {
  expect((await claim('device', '/api/codes/redeem')).status).toBe(200);
  expect((await claim()).status).toBe(400);
});
it('rolls back claim ownership when the status update fails', async () => {
  sql.exec("CREATE TRIGGER reject_claim BEFORE UPDATE ON generated_codes BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  expect((await claim()).status).toBe(500);
  expect(sql.prepare('SELECT COUNT(*) n FROM comp_claims').get().n).toBe(0);
  sql.exec('DROP TRIGGER reject_claim');
  expect((await claim()).status).toBe(200);
});
it('simultaneous different devices cannot both claim the same code', async () => {
  const results = await Promise.all([claim('one'), claim('two')]);
  expect(results.filter(r => r.status === 200)).toHaveLength(1);
});
it('an old client omitting phone cannot erase the registered number', async () => {
  expect((await request('/api/classes/update-info', { class_code: 'CLASS1', device_hash: 'device', student_name: '新名' })).status).toBe(200);
  expect(sql.prepare('SELECT phone FROM class_students').get().phone).toBe('13800000000');
});

it.each(['2026-season-2', '2026-autumn'])('concurrent progress syncs cannot lower a newer best score/rating (%s)', async (season) => {
  sql.exec(`CREATE TABLE dungeon_players(device_hash TEXT PRIMARY KEY, updated_at TEXT);
    INSERT INTO dungeon_players VALUES('device','2020-01-01 00:00:00');
    CREATE TABLE dungeon_progress(device_hash TEXT, dungeon_id TEXT, status TEXT, completed_stages INTEGER, total_stages INTEGER, current_stage_id TEXT, boss_defeated INTEGER, best_score INTEGER, best_rating TEXT, updated_at TEXT, PRIMARY KEY(device_hash,dungeon_id));
    CREATE TABLE dungeon_season_progress(device_hash TEXT, season_id TEXT, dungeon_id TEXT, status TEXT, completed_stages INTEGER, total_stages INTEGER, current_stage_id TEXT, boss_defeated INTEGER, best_score INTEGER, best_rating TEXT, updated_at TEXT, PRIMARY KEY(device_hash,season_id,dungeon_id));`);
  const payload = (score, rating) => ({ device_hash: 'device', season_id: season,
    dungeon_progress: [{ dungeonId: 'dungeon-01', completedStages: 5, totalStages: 5, bossDefeated: true, bestScore: score, bestRating: rating }] });
  const responses = await Promise.all([
    request('/api/dungeon/sync', payload(100, 'SS')),
    request('/api/dungeon/sync', payload(10, 'B')),
  ]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  const table = season === '2026-season-2' ? 'dungeon_season_progress' : 'dungeon_progress';
  expect(sql.prepare(`SELECT best_score, best_rating, status FROM ${table}`).get())
    .toMatchObject({ best_score: 100, best_rating: 'SS', status: 'cleared' });
});
