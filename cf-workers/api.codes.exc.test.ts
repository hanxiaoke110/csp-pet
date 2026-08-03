import { describe, expect, it } from 'vitest';
import worker from './api.js';

const CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SECRET = 'csp-coach-2025';

// 与 api.js codeHash 完全一致的实现，用于构造测试码
function codeHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  let result = '';
  let v = Math.abs(h);
  for (let i = 0; i < 4; i++) { result = CHARS[v % CHARS.length] + result; v = Math.floor(v / CHARS.length); }
  return result;
}

function beijingMMDD(offsetDays = 0): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86400000);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function excCode(level: string, date: string, rand = 'AB12'): string {
  return `EXC-${level}-${date}-${codeHash(`${level}-${date}-${rand}-${SECRET}`)}-${rand}`;
}

function makeDb() {
  const claims = new Map<string, { created_at: string }>();
  const rateLimits = new Map<string, { count: number; reset_at: string }>();
  const db: any = {
    async exec() {},
    prepare(sql: string) {
      const call: any = { sql, bindings: [] as unknown[] };
      return {
        bind(...values: unknown[]) { call.bindings = values; return this; },
        async first() {
          if (sql.includes('FROM rate_limits WHERE key=')) {
            return rateLimits.get(String(call.bindings[0] || '')) || null;
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT OR IGNORE INTO exc_claims')) {
            const [code, deviceHash] = call.bindings;
            const key = `${code}:${deviceHash}`;
            if (claims.has(key)) return { meta: { changes: 0 } };
            claims.set(key, { created_at: '2026-08-03' });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT OR REPLACE INTO rate_limits")) {
            const [key, resetAt] = call.bindings;
            rateLimits.set(String(key), { count: 1, reset_at: String(resetAt) });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE rate_limits SET count = count + 1')) {
            const key = String(call.bindings[0] || '');
            const row = rateLimits.get(key);
            if (row) row.count += 1;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
        async all() { return { results: [] }; },
      };
    },
  };
  return db;
}

function call(db: any, body: unknown) {
  return worker.fetch(
    new Request('https://api.example.test/api/codes/redeem-exc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'vitest' },
      body: JSON.stringify(body),
    }),
    { DB: db, ADMIN_TOKEN: 'admin-token' },
    { waitUntil() {} } as any,
  );
}

describe('优秀码服务端校验 /api/codes/redeem-exc', () => {
  it('当天有效码：按等级返回固定奖励，一等 100EXP+60金币', async () => {
    const db = makeDb();
    const resp = await call(db, { code: excCode('1', beijingMMDD()), device_hash: 'DEV-1' });
    const data = await resp.json() as any;
    expect(resp.status).toBe(200);
    expect(data).toMatchObject({ success: true, level: '1', exp: 100, coins: 60 });
  });

  it('昨天的码（哈希正确）→ 已过期；篡改末尾 → 无效', async () => {
    const db = makeDb();
    const expired = await call(db, { code: excCode('1', beijingMMDD(-1)), device_hash: 'DEV-1' });
    expect(expired.status).toBe(400);
    const expiredData = await expired.json() as any;
    expect(expiredData.error).toContain('已过期');

    const good = excCode('1', beijingMMDD());
    const tampered = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A');
    const bad = await call(db, { code: tampered, device_hash: 'DEV-1' });
    expect(bad.status).toBe(400);
    const badData = await bad.json() as any;
    expect(badData.error).toContain('无效');
  });

  it('每设备一次：同设备重复 400，其他设备可再兑', async () => {
    const db = makeDb();
    const code = excCode('2', beijingMMDD());
    const first = await call(db, { code, device_hash: 'DEV-1' });
    expect(first.status).toBe(200);
    const again = await call(db, { code, device_hash: 'DEV-1' });
    expect(again.status).toBe(400);
    const other = await call(db, { code, device_hash: 'DEV-2' });
    expect(other.status).toBe(200);
  });

  it('并发同设备：只有一个成功', async () => {
    const db = makeDb();
    const code = excCode('3', beijingMMDD());
    const [r1, r2] = await Promise.all([
      call(db, { code, device_hash: 'DEV-1' }),
      call(db, { code, device_hash: 'DEV-1' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
  });

  it('兑换限流：同设备 1 分钟最多 5 次', async () => {
    const db = makeDb();
    const codes = Array.from({ length: 6 }, (_, i) => excCode('1', beijingMMDD(), `R${i}00`.slice(0, 4)));
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await call(db, { code: codes[i], device_hash: 'DEV-RL' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});
