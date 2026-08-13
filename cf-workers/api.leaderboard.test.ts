import { describe, expect, it } from 'vitest';
import worker from './api.js';

function makeDb() {
  const queries: string[] = [];
  return {
    queries,
    async exec() {},
    prepare(sql: string) {
      queries.push(sql);
      return {
        bind() { return this; },
        async first() {
          if (/SELECT 1/.test(sql)) return { ok: 1 };
          return null;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async all() {
          if (/FROM dungeon_progress dp/.test(sql) && /dp\.best_rating = 'SS'/.test(sql)) {
            return {
              results: [
                { device_hash: 'd1', display_name: '甲', school: 'cultivation', rank_tier: 1, value: 2 },
              ],
            };
          }
          if (/FROM dungeon_attempts a/.test(sql)) {
            return {
              results: [
                { device_hash: 'd2', display_name: '乙', school: 'code', rank_tier: 1, value: 7 },
              ],
            };
          }
          return { results: [] };
        },
      };
    },
  };
}

describe('Worker 智子试炼场排行榜', () => {
  it('SS副本榜按副本最好评级统计，不按可重复战斗次数统计', async () => {
    const db = makeDb();
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/leaderboard?scope=global&type=ss_count'),
      { DB: db },
      { waitUntil() {} } as any
    );

    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.entries[0]).toMatchObject({ display_name: '甲', value: 2 });

    const leaderboardQuery = db.queries.find(q => q.includes('FROM dungeon_progress dp') && q.includes("dp.best_rating = 'SS'"));
    expect(leaderboardQuery).toBeTruthy();
    expect(leaderboardQuery).not.toContain('FROM dungeon_attempts a');
  });

  it('第二赛季排行榜只查询赛季表', async () => {
    const db = makeDb();
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/leaderboard?scope=global&type=ss_count&season_id=2026-season-2'),
      { DB: db },
      { waitUntil() {} } as any
    );

    expect(response.status).toBe(200);
    const query = db.queries.find(q => q.includes('FROM dungeon_season_progress dp'));
    expect(query).toBeTruthy();
    expect(query).toContain('dp.season_id=?');
  });

  it('第二赛季战力榜只展示已进入本赛季的玩家', async () => {
    const db = makeDb();
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/leaderboard?scope=global&type=power&season_id=2026-season-2'),
      { DB: db },
      { waitUntil() {} } as any,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.season).toBe('2026-season-2');
    const query = db.queries.find(q => q.includes('FROM dungeon_season_stats s'));
    expect(query).toBeTruthy();
    expect(query).toContain('s.season_id=?');
    expect(query).not.toContain('LEFT JOIN dungeon_season_stats');
  });

  it('旧账号首次登录第二赛季会补齐八个副本进度', async () => {
    const inserted: Array<{ dungeonId: string; status: string }> = [];
    const db = {
      async exec() {},
      prepare(sql: string) {
        let args: any[] = [];
        return {
          bind(...values: any[]) { args = values; return this; },
          async first() {
            if (/SELECT 1/.test(sql)) return { ok: 1 };
            if (/FROM dungeon_players WHERE real_name/.test(sql)) {
              return {
                device_hash: 'legacy-device', class_code: '6WB74A1ZPP9E', display_name: '旧生',
                real_name: '测试', phone: '13800000000', status: 'active', school: 'cultivation',
                login_streak: 3, last_login_date: '', gold: 88,
              };
            }
            if (/FROM dungeon_season_stats/.test(sql)) {
              return { player_level: 1, exp: 0, rank_tier: 1, rank_points: 0, total_answered: 0, total_correct: 0, current_streak: 0, max_streak: 0 };
            }
            return null;
          },
          async run() {
            if (/INSERT OR IGNORE INTO dungeon_season_progress/.test(sql)) {
              inserted.push({ dungeonId: String(args[2]), status: String(args[3]) });
            }
            return { meta: { changes: 1 } };
          },
          async all() { return { results: [] }; },
        };
      },
    };
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ real_name: '测试', phone: '13800000000', season_id: '2026-season-2' }),
      }),
      { DB: db },
      { waitUntil() {} } as any,
    );

    expect(response.status).toBe(200);
    expect(inserted).toHaveLength(8);
    expect(inserted[0]).toEqual({ dungeonId: 'dungeon-01', status: 'unlocked' });
    expect(inserted.slice(1).every(item => item.status === 'locked')).toBe(true);
  });

  it('已注册账号重新进入新赛季不会覆盖流派和永久资产', async () => {
    const updates: Array<{ sql: string; args: any[] }> = [];
    const existing = {
      device_hash: 'existing-device', class_code: 'OLDCLASS', teacher_id: 'old-teacher',
      display_name: '旧昵称', real_name: '旧姓名', phone: '13900000000', status: 'active',
      school: 'star', gold: 4321, player_level: 15, exp: 488,
    };
    const db = {
      async exec() {},
      prepare(sql: string) {
        let args: any[] = [];
        return {
          bind(...values: any[]) { args = values; return this; },
          async first() {
            if (/SELECT 1/.test(sql)) return { ok: 1 };
            if (/FROM classes/.test(sql)) return { class_code: 'NEWCLASS', teacher_id: 'teacher-2', teacher_name: '老师', label: '班级' };
            if (/SELECT \* FROM dungeon_players/.test(sql)) return existing;
            return null;
          },
          async run() {
            if (/UPDATE dungeon_players/.test(sql)) updates.push({ sql, args });
            return { meta: { changes: 1 } };
          },
          async all() { return { results: [] }; },
        };
      },
    };

    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          device_hash: 'existing-device', class_code: 'NEWCLASS', display_name: '新昵称',
          real_name: '伪造姓名', phone: '13800000000', school: 'dream', season_id: '2026-season-2',
        }),
      }),
      { DB: db },
      { waitUntil() {} } as any,
    );

    expect(response.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).not.toMatch(/school=|gold=|player_level=|exp=|real_name=|phone=/);
    expect(updates[0].args).toEqual(['NEWCLASS', 'teacher-2', '新昵称', 'existing-device']);
  });
});
