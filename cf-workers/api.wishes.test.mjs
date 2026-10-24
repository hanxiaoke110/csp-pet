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
  // Fresh schema must be initialized even if another worker instance was tested.
  sql.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO meta VALUES('schema_version','13');
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

describe('许愿所有权与7天冷却', () => {
  it.each([8,15])('线上内置唯一约束旧表在上次投票 %i 天后升级，能再投并保留历史', async days => {
    sql.exec(`UPDATE meta SET value='12' WHERE key='schema_version'; DROP TABLE votes;
      CREATE TABLE votes(id INTEGER PRIMARY KEY AUTOINCREMENT, wish_id INTEGER NOT NULL, device_hash TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), class_code TEXT DEFAULT '', UNIQUE(wish_id,device_hash));
      INSERT INTO votes(id,wish_id,device_hash,class_code,created_at) VALUES(42,7,'voter','CLASS1',datetime('now','-${days} days'));
      INSERT INTO wish_vote_cooldowns VALUES(7,'voter',datetime('now','+${14-days} days'),'old-lease');
      UPDATE wishes SET votes=1 WHERE id=7;`);
    vi.resetModules();
    const fresh = (await import('./api.js')).default;
    const response = await fresh.fetch(new Request('https://api.cspstudy.top/api/vote', {
      method:'POST', body:JSON.stringify({wish_id:7,device_hash:'voter',class_code:'CLASS1'}),
    }), {DB:db}, {waitUntil(){}});
    expect(response.status).toBe(200);
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(2);
    expect(sql.prepare('SELECT class_code FROM votes WHERE id=42').get().class_code).toBe('CLASS1');
    expect(sql.prepare('SELECT MAX(id) n FROM votes').get().n).toBeGreaterThan(42);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(2);
    const next = Date.parse((await response.json()).next_vote_at);
    expect(next-Date.now()).toBeGreaterThan(7*86400000-5000);
    expect(next-Date.now()).toBeLessThanOrEqual(7*86400000);
  });
  it('旧永久投票锁迁移为冷却，保留历史与排行榜票数', async () => {
    sql.exec(`DROP TABLE wish_vote_cooldowns;
      UPDATE meta SET value='11' WHERE key='schema_version';
      CREATE UNIQUE INDEX idx_votes_unique ON votes(wish_id,device_hash);
      INSERT INTO votes(wish_id,device_hash,class_code) VALUES(7,'voter','CLASS1');
      UPDATE wishes SET votes=1 WHERE id=7;`);
    vi.resetModules();
    const fresh = (await import('./api.js')).default;
    const response = await fresh.fetch(new Request('https://api.cspstudy.top/api/vote', {
      method: 'POST', body: JSON.stringify({ wish_id: 7, device_hash: 'voter', class_code: 'CLASS1' }),
    }), { DB: db }, { waitUntil() {} });
    expect(response.status).toBe(409);
    expect(sql.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value).toBe('13');
    expect(sql.prepare("SELECT name FROM sqlite_master WHERE name='idx_votes_unique'").get()).toBeUndefined();
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(1);
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(1);
  });

  it('旧14天等待缩为7天，未满7天仍阻止且再次冷启动不重复缩短', async () => {
    sql.exec(`UPDATE meta SET value='12' WHERE key='schema_version';
      INSERT INTO votes(wish_id,device_hash,class_code,created_at) VALUES(7,'voter','CLASS1',datetime('now','-6 days'));
      INSERT INTO wish_vote_cooldowns VALUES(7,'voter',datetime('now','+8 days'),'old-lease');
      UPDATE wishes SET votes=1 WHERE id=7;`);
    for (let i=0;i<2;i++) {
      vi.resetModules();
      const fresh=(await import('./api.js')).default;
      const response=await fresh.fetch(new Request('https://test.invalid/api/vote', {
        method:'POST',body:JSON.stringify({wish_id:7,device_hash:'voter',class_code:'CLASS1'}),
      }),{DB:db},{waitUntil(){}});
      expect(response.status).toBe(409);
      const data=await response.json();
      expect(data.error).toContain('7天');
      expect(Date.parse(data.next_vote_at)-Date.now()).toBeGreaterThan(86400000-5000);
      expect(Date.parse(data.next_vote_at)-Date.now()).toBeLessThanOrEqual(86400000);
    }
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(1);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(1);
  });

  it('迁移写入失败会整体回滚，旧表、历史和版本保持可恢复', async () => {
    sql.exec(`UPDATE meta SET value='12' WHERE key='schema_version';
      INSERT INTO votes(wish_id,device_hash,class_code) VALUES(7,'voter','CLASS1');
      CREATE TRIGGER reject_schema BEFORE INSERT ON meta WHEN NEW.key='schema_version' AND NEW.value='13' BEGIN SELECT RAISE(ABORT,'synthetic migration failure'); END;`);
    vi.resetModules();
    const fresh=(await import('./api.js')).default;
    await expect(fresh.fetch(new Request('https://test.invalid/api/health'),{DB:db},{waitUntil(){}})).rejects.toThrow('synthetic migration failure');
    expect(sql.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value).toBe('12');
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(1);
    expect(sql.prepare("SELECT name FROM sqlite_master WHERE name='votes_history_v13'").get()).toBeUndefined();
  });

  it('记录投票失败时整个事务回滚，不占用7天冷却', async () => {
    sql.exec("CREATE TRIGGER reject_vote BEFORE INSERT ON votes BEGIN SELECT RAISE(ABORT,'test write failure'); END;");
    expect((await vote()).status).toBe(500);
    expect(sql.prepare('SELECT COUNT(*) n FROM wish_vote_cooldowns').get().n).toBe(0);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(0);
  });
  it('并发请求仅有一次成功，历史与票数同步', async () => {
    const responses = await Promise.all([vote(), vote()]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(1);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(1);
  });
  it('冷却期间不重复计票，满7天后可再次投票', async () => {
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
