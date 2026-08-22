import { describe, expect, it } from 'vitest';
import worker from './api.js';

function makeDb(initialValue: string | null = null) {
  let storedValue = initialValue;
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  return {
    calls,
    get storedValue() { return storedValue; },
    async exec() {},
    prepare(sql: string) {
      const call = { sql, bindings: [] as unknown[] };
      calls.push(call);
      return {
        bind(...values: unknown[]) { call.bindings = values; return this; },
        async first() {
          if (sql.includes("key='schema_version'")) return { value: '6' };
          if (sql.includes('SELECT value FROM meta WHERE key=?')) {
            return storedValue == null ? null : { value: storedValue };
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT OR REPLACE INTO meta(key,value)')) {
            storedValue = String(call.bindings[1]);
          }
          return { meta: { changes: 1 } };
        },
        async all() { return { results: [] }; },
      };
    },
  };
}

const ctx = { waitUntil() {} } as any;

describe('在线排行榜说明', () => {
  it('无在线配置时公开接口返回完整内置规则', async () => {
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/leaderboard-rules'),
      { DB: makeDb() },
      ctx,
    );

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.rules.rules.map((item: any) => item.key)).toEqual([
      'power', 'streak', 'progress', 'warrior', 'wins', 'ss_count',
    ]);
    expect(data.rules.ssCriteria).toHaveLength(4);
  });

  it('只有管理员能修改，教师令牌不能代替管理员令牌', async () => {
    const response = await worker.fetch(
      new Request('https://api.example.test/api/admin/dungeon/leaderboard-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Teacher-Token': 'teacher-token' },
        body: JSON.stringify({ title: '新规则' }),
      }),
      { DB: makeDb(), ADMIN_TOKEN: 'admin-token' },
      ctx,
    );

    expect(response.status).toBe(401);
  });

  it('管理员更新时补齐缺失榜单并过滤未知榜单', async () => {
    const db = makeDb();
    const response = await worker.fetch(
      new Request('https://api.example.test/api/admin/dungeon/leaderboard-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'admin-token' },
        body: JSON.stringify({
          title: '在线规则',
          rules: [
            { key: 'power', label: '积分', description: '新的积分说明' },
            { key: 'unknown', label: '错误', description: '不应保存' },
          ],
          ssCriteria: ['全部答对'],
          footer: '补充说明',
        }),
      }),
      { DB: db, ADMIN_TOKEN: 'admin-token' },
      ctx,
    );

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.rules.title).toBe('在线规则');
    expect(data.rules.rules).toHaveLength(6);
    expect(data.rules.rules[0]).toMatchObject({ key: 'power', label: '积分' });
    expect(data.rules.rules.some((item: any) => item.key === 'unknown')).toBe(false);
    expect(JSON.parse(db.storedValue || '{}').updatedAt).toBeTruthy();
  });
});
