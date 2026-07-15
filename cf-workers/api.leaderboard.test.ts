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
});
