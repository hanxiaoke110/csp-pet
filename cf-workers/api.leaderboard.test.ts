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

  it('拒绝未知范围，避免错误参数静默退化成全服榜', async () => {
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/leaderboard?scope=other&type=power&season_id=2026-season-2'),
      { DB: makeDb() },
      { waitUntil() {} } as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '无效的排行榜范围' });
  });

  it('勇者榜只给胜利的 S/SS 评级加分', async () => {
    const db = makeDb();
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/leaderboard?scope=global&type=warrior&season_id=2026-season-2'),
      { DB: db },
      { waitUntil() {} } as any,
    );

    expect(response.status).toBe(200);
    const query = db.queries.find(q => q.includes('FROM dungeon_season_attempts a')) || '';
    expect(query).toContain("a.is_win = 1 AND a.rating = 'SS'");
    expect(query).toContain("a.is_win = 1 AND a.rating = 'S'");
  });

  it('同分玩家使用稳定顺序并共享并列名次', async () => {
    const queries: string[] = [];
    const db = {
      async exec() {},
      prepare(sql: string) {
        queries.push(sql);
        return {
          bind() { return this; },
          async first() { return null; },
          async run() { return { meta: { changes: 1 } }; },
          async all() {
            if (sql.includes('FROM dungeon_season_stats s')) {
              return { results: [
                { device_hash: 'a', display_name: '甲', school: 'code', rank_tier: 2, value: 100 },
                { device_hash: 'b', display_name: '乙', school: 'star', rank_tier: 2, value: 100 },
                { device_hash: 'c', display_name: '丙', school: 'dream', rank_tier: 2, value: 100 },
                { device_hash: 'd', display_name: '丁', school: 'code', rank_tier: 1, value: 80 },
              ] };
            }
            return { results: [] };
          },
        };
      },
    };
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/leaderboard?scope=global&type=power&season_id=2026-season-2&device_hash=b'),
      { DB: db },
      { waitUntil() {} } as any,
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.entries.map((entry: any) => entry.rank)).toEqual([1, 1, 1, 4]);
    expect(body.playerEntry).toMatchObject({ rank: 1, display_name: '乙', value: 100 });
    expect(queries.find(q => q.includes('FROM dungeon_season_stats s'))).toContain('p.display_name COLLATE NOCASE ASC');
  });

  it('重复挑战不再发金币，但会同步更高的赛季段位积分', async () => {
    const statWrites: any[][] = [];
    const db = {
      async exec() {},
      prepare(sql: string) {
        let args: any[] = [];
        return {
          bind(...values: any[]) { args = values; return this; },
          async first() {
            if (sql.includes('FROM dungeon_players WHERE device_hash=? AND class_code=?')) {
              return { device_hash: 'device-1', class_code: 'CLASS1', status: 'active' };
            }
            if (sql.includes('FROM rate_limits')) return null;
            return null;
          },
          async run() {
            if (sql.includes('INSERT OR IGNORE INTO dungeon_season_attempts')) return { meta: { changes: 0 } };
            if (sql.includes('INSERT INTO dungeon_season_stats')) statWrites.push(args);
            return { meta: { changes: 1 } };
          },
          async all() { return { results: [] }; },
        };
      },
    };
    const response = await worker.fetch(
      new Request('https://api.example.test/api/dungeon/report-battle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          device_hash: 'device-1', class_code: 'CLASS1', season_id: '2026-season-2',
          dungeon_id: 'dungeon-01', stage_id: 'dungeon-01-stage-01', is_win: 1,
          rating: 'SS', questions_answered: 5, correct_count: 5,
          player_level: 4, exp: 30, rank_tier: 2, rank_points: 180,
          current_streak: 6, max_streak: 8,
        }),
      }),
      { DB: db },
      { waitUntil() {} } as any,
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.gold_added).toBe(0);
    expect(statWrites).toEqual([['device-1', '2026-season-2', 4, 30, 2, 180, 0, 0, 6, 8]]);
  });
});
