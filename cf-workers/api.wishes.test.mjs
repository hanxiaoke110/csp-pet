import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
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
  // Fresh schema must be initialized even if another worker instance was tested.
  sql.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO meta VALUES('schema_version','12');
    CREATE TABLE classes(class_code TEXT PRIMARY KEY, teacher_id TEXT, status TEXT);
    CREATE TABLE class_students(class_code TEXT, device_hash TEXT, status TEXT);
    CREATE TABLE wishes(id INTEGER PRIMARY KEY, content TEXT, display_name TEXT, device_hash TEXT, votes INTEGER DEFAULT 0, status TEXT, created_at TEXT DEFAULT (datetime('now')), class_code TEXT, deleted_at TEXT);
    CREATE TABLE votes(id INTEGER PRIMARY KEY AUTOINCREMENT, wish_id INTEGER, device_hash TEXT, class_code TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE wish_vote_cooldowns(wish_id INTEGER, device_hash TEXT, next_allowed_at TEXT, lease_token TEXT DEFAULT '', PRIMARY KEY(wish_id,device_hash));
    CREATE TABLE rate_limits(key TEXT PRIMARY KEY, count INTEGER, reset_at TEXT);
    INSERT INTO classes VALUES('CLASS1','teacher-1','active'),('CLASS2','teacher-2','active');
    INSERT INTO class_students VALUES('CLASS1','owner','active'),('CLASS1','voter','active'),('CLASS2','outsider','active');
    INSERT INTO wishes(id,content,display_name,device_hash,status,class_code) VALUES(7,'新武器','同学','owner','active','CLASS1');`);
});
afterEach(() => sql.close());

async function request(path, method = 'GET', body) {
  return worker.fetch(new Request(`https://api.cspstudy.top${path}`, {
    method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  }), { DB: db }, { waitUntil() {} });
}
const vote = () => request('/api/vote', 'POST', { wish_id: 7, device_hash: 'voter', class_code: 'CLASS1' });

describe('许愿所有权与14天冷却', () => {
  it('并发请求仅有一次成功，历史与票数同步', async () => {
    const responses = await Promise.all([vote(), vote()]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(1);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(1);
  });
  it('冷却期间不重复计票，满14天后可再次投票', async () => {
    expect((await vote()).status).toBe(200);
    const blocked = await vote();
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).next_vote_at).toBeTruthy();
    sql.exec("UPDATE wish_vote_cooldowns SET next_allowed_at=datetime('now','-1 second')");
    expect((await vote()).status).toBe(200);
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(2);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(2);
  });
  it('服务端拒绝跨教师投票', async () => {
    const response = await request('/api/vote', 'POST', { wish_id: 7, device_hash: 'outsider', class_code: 'CLASS2' });
    expect(response.status).toBe(403);
  });
  it('仅所有者可删除，重复删除幂等且月度次数保留', async () => {
    expect((await request('/api/wishes/7', 'DELETE', { device_hash: 'voter', class_code: 'CLASS1' })).status).toBe(403);
    expect((await request('/api/wishes/7', 'DELETE', { device_hash: 'owner', class_code: 'CLASS2' })).status).toBe(403);
    for (let i = 0; i < 2; i++) expect((await request('/api/wishes/7', 'DELETE', { device_hash: 'owner', class_code: 'CLASS1' })).status).toBe(200);
    expect(sql.prepare('SELECT status FROM wishes WHERE id=7').get().status).toBe('deleted');
    const stats = await (await request('/api/wishes/my-stats?device_hash=owner')).json();
    expect(stats).toMatchObject({ monthlySubmitted: 1, activeWishes: 0 });
  });
  it('列表标明所有权但不暴露设备标识', async () => {
    const items = await (await request('/api/wishes?class_code=CLASS1&device_hash=owner')).json();
    expect(items[0].is_mine).toBe(true);
    expect(items[0]).not.toHaveProperty('device_hash');
  });
});
