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
    INSERT INTO meta VALUES('schema_version','14');
    CREATE TABLE classes(class_code TEXT PRIMARY KEY, teacher_id TEXT, status TEXT);
    CREATE TABLE class_students(class_code TEXT, device_hash TEXT, status TEXT);
    CREATE TABLE wishes(id INTEGER PRIMARY KEY, content TEXT, display_name TEXT, device_hash TEXT, votes INTEGER DEFAULT 0, status TEXT, created_at TEXT DEFAULT (datetime('now')), class_code TEXT, deleted_at TEXT);
    CREATE TABLE votes(id INTEGER PRIMARY KEY AUTOINCREMENT, wish_id INTEGER, device_hash TEXT, class_code TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE wish_vote_cooldowns(wish_id INTEGER, device_hash TEXT, next_allowed_at TEXT, lease_token TEXT DEFAULT '', PRIMARY KEY(wish_id,device_hash));
    CREATE TABLE wish_vote_requests(request_id TEXT PRIMARY KEY, wish_id INTEGER NOT NULL, device_hash TEXT NOT NULL, class_code TEXT NOT NULL, lease_token TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
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
const vote = (requestId = 'test-request-1') => request('/api/vote', 'POST', { wish_id: 7, device_hash: 'voter', class_code: 'CLASS1', request_id: requestId });

describe('许愿按票券投票与请求防重', () => {
  it('当前线上v13升级只新增请求记录表，旧票数保留且即刻可投', async () => {
    sql.exec(`UPDATE meta SET value='13' WHERE key='schema_version';
      DROP TABLE wish_vote_requests;
      INSERT INTO votes(id,wish_id,device_hash,class_code) VALUES(42,7,'voter','CLASS1');
      INSERT INTO wish_vote_cooldowns VALUES(7,'voter',datetime('now','+7 days'),'old');
      UPDATE wishes SET votes=1 WHERE id=7;`);
    vi.resetModules();
    const fresh=(await import('./api.js')).default;
    const response=await fresh.fetch(new Request('https://test.invalid/api/vote',{
      method:'POST',body:JSON.stringify({wish_id:7,device_hash:'voter',class_code:'CLASS1',request_id:'new-client-vote'}),
    }),{DB:db},{waitUntil(){}});
    expect(response.status).toBe(200);
    expect((await response.json()).next_vote_at).toBeNull();
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(2);
    expect(sql.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value).toBe('14');
  });
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
    expect((await response.json()).next_vote_at).toBeNull();
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
    expect(response.status).toBe(200);
    expect(sql.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value).toBe('14');
    expect(sql.prepare("SELECT name FROM sqlite_master WHERE name='idx_votes_unique'").get()).toBeUndefined();
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(2);
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(2);
  });

  it('旧等待不再限制连续投票，列表向旧客户端返回空等待时间', async () => {
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
      expect(response.status).toBe(200);
      const data=await response.json();
      expect(data.next_vote_at).toBeNull();
    }
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(3);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(3);
    const list=await (await request('/api/wishes?class_code=CLASS1&device_hash=voter')).json();
    expect(list[0].next_vote_at).toBeNull();
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

  it('记录投票失败时回滚请求占用，原请求可重试', async () => {
    sql.exec("CREATE TRIGGER reject_vote BEFORE INSERT ON votes BEGIN SELECT RAISE(ABORT,'test write failure'); END;");
    expect((await vote()).status).toBe(500);
    expect(sql.prepare('SELECT COUNT(*) n FROM wish_vote_cooldowns').get().n).toBe(0);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(0);
    expect(sql.prepare('SELECT COUNT(*) n FROM wish_vote_requests').get().n).toBe(0);
    sql.exec('DROP TRIGGER reject_vote');
    expect((await vote()).status).toBe(200);
  });
  it('同一请求并发重试只记一票，返回相同请求回执', async () => {
    const responses = await Promise.all([vote(), vote()]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    for(const response of responses) expect((await response.json()).request_id).toBe('test-request-1');
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(1);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(1);
  });
  it('不同请求可连续支持同一愿望，票数与历史同步增加', async () => {
    expect((await vote('first-purchased-ticket')).status).toBe(200);
    expect((await vote('second-purchased-ticket')).status).toBe(200);
    expect(sql.prepare('SELECT COUNT(*) n FROM votes').get().n).toBe(2);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(2);
  });
  it('请求编号不能用于另一个学生或愿望', async () => {
    expect((await vote()).status).toBe(200);
    const response=await request('/api/vote','POST',{wish_id:7,device_hash:'owner',class_code:'CLASS1',request_id:'test-request-1'});
    expect(response.status).toBe(409);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(1);
  });
  it('旧客户端未携带编号仍可连续投票，异常高频会被拦截', async () => {
    for(let i=0;i<10;i++) expect((await request('/api/vote','POST',{wish_id:7,device_hash:'voter',class_code:'CLASS1'})).status).toBe(200);
    expect(sql.prepare('SELECT votes FROM wishes WHERE id=7').get().votes).toBe(10);
    expect((await vote('over-limit')).status).toBe(429);
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
