import { describe, expect, it } from 'vitest';
import worker from './api.js';

type Ballot = {
  device_hash: string;
  choices_json: string;
  receipt_code: string;
  created_at: string;
};

function makeDb(petIds = ['ws-AAAAAA', 'ws-BBBBBB', 'ws-CCCCCC']) {
  const ballots = new Map<string, Ballot>();
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];

  return {
    ballots,
    calls,
    async exec() {},
    prepare(sql: string) {
      const call = { sql: sql.replace(/\s+/g, ' ').trim(), bindings: [] as unknown[] };
      calls.push(call);
      return {
        bind(...values: unknown[]) { call.bindings = values; return this; },
        async first() {
          if (call.sql.includes("key='schema_version'")) return { value: '11' };
          if (call.sql === 'SELECT value FROM meta WHERE key=?') {
            return { value: JSON.stringify({ status: 'open', title: '典藏投票', startsAt: '', endsAt: '' }) };
          }
          if (call.sql.startsWith('SELECT choices_json, receipt_code, created_at FROM collector_ballots')) {
            return ballots.get(String(call.bindings[0])) || null;
          }
          if (call.sql.startsWith('SELECT count, reset_at FROM rate_limits')) return null;
          if (call.sql.startsWith('SELECT COUNT(*) AS count FROM collector_ballots')) return { count: ballots.size };
          return null;
        },
        async all() {
          if (call.sql.startsWith("SELECT id FROM workshop_pets WHERE status='active'")) {
            return { results: call.bindings.filter(value => petIds.includes(String(value))).map(id => ({ id })) };
          }
          return { results: [] };
        },
        async run() {
          if (call.sql.startsWith('INSERT OR IGNORE INTO collector_ballots')) {
            const [device_hash, choices_json, , receipt_code] = call.bindings.map(String);
            if (ballots.has(device_hash)) return { meta: { changes: 0 } };
            ballots.set(device_hash, {
              device_hash,
              choices_json,
              receipt_code,
              created_at: '2026-09-12 12:00:00',
            });
            return { meta: { changes: 1, last_row_id: ballots.size } };
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

const ctx = { waitUntil() {} } as any;
const deviceHash = 'vote_1234567890abcdefghijklmn';

describe('智子典藏卡投票', () => {
  it('数据库确认写入后才返回带唯一回执的成功结果', async () => {
    const db = makeDb();
    const response = await worker.fetch(new Request('https://api.example.test/api/collector-vote/ballots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_hash: deviceHash, choices: ['ws-AAAAAA', 'ws-BBBBBB'] }),
    }), { DB: db, SERVER_SECRET: 'test-secret' }, ctx);

    expect(response.status).toBe(201);
    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.receiptCode).toMatch(/^STAR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(db.ballots.get(deviceHash)?.choices_json).toBe('["ws-AAAAAA","ws-BBBBBB"]');
  });

  it('同一设备重复提交不会产生第二张选票，并返回原回执', async () => {
    const db = makeDb();
    const request = () => new Request('https://api.example.test/api/collector-vote/ballots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_hash: deviceHash, choices: ['ws-AAAAAA'] }),
    });
    const first = await worker.fetch(request(), { DB: db, SERVER_SECRET: 'test-secret' }, ctx);
    const firstBody = await first.json() as any;
    const second = await worker.fetch(request(), { DB: db, SERVER_SECRET: 'test-secret' }, ctx);
    const secondBody = await second.json() as any;

    expect(second.status).toBe(409);
    expect(secondBody.voted).toBe(true);
    expect(secondBody.receiptCode).toBe(firstBody.receiptCode);
    expect(db.ballots.size).toBe(1);
  });

  it('拒绝超过五只、重复或已离开候选名单的选择', async () => {
    const db = makeDb();
    const tooMany = await worker.fetch(new Request('https://api.example.test/api/collector-vote/ballots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_hash: deviceHash, choices: ['ws-AAAAAA', 'ws-BBBBBB', 'ws-CCCCCC', 'ws-DDDDDD', 'ws-EEEEEE', 'ws-FFFFFF'] }),
    }), { DB: db }, ctx);
    const missing = await worker.fetch(new Request('https://api.example.test/api/collector-vote/ballots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_hash: deviceHash, choices: ['ws-DDDDDD'] }),
    }), { DB: db, SERVER_SECRET: 'test-secret' }, ctx);

    expect(tooMany.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(db.ballots.size).toBe(0);
  });

  it('管理员结束活动时先封存最终结果，再公开关闭状态', async () => {
    const db = makeDb();
    const response = await worker.fetch(new Request('https://api.example.test/api/admin/collector-vote/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'admin-token' },
      body: JSON.stringify({ status: 'closed' }),
    }), { DB: db, ADMIN_TOKEN: 'admin-token' }, ctx);

    expect(response.status).toBe(200);
    const writes = db.calls.filter(call => call.sql.startsWith('INSERT OR REPLACE INTO meta'));
    expect(writes).toHaveLength(2);
    expect(writes[0].bindings[0]).toBe('collector_vote_final_results');
    expect(writes[1].bindings[0]).toBe('collector_vote_config');
  });
});
