import { describe, expect, it } from 'vitest';
import worker from './api.js';

// 捕获 SQL 与绑定参数，验证 sync 的通关状态修复通道
function makeDb(existingProgress: Record<string, unknown> | null = null) {
  const calls: { sql: string; bindings: unknown[] }[] = [];
  return {
    calls,
    async exec() {},
    prepare(sql: string) {
      return {
        bindings: [] as unknown[],
        bind(...args: unknown[]) { this.bindings = args; calls.push({ sql, bindings: args }); return this; },
        async first() {
          if (/FROM dungeon_players/.test(sql) && /updated_at/.test(sql)) return null; // 无 5s 去重
          if (/FROM meta/.test(sql)) return null; // 写预算为空
          if (/FROM dungeon_progress/.test(sql)) return existingProgress;
          return null;
        },
        async run() { return { meta: { changes: 1 } }; },
        async all() { return { results: [] }; },
      };
    },
  };
}

function syncRequest(progress: Record<string, unknown>[]) {
  return new Request('https://api.example.test/api/dungeon/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_hash: 'dev1', dungeon_progress: progress }),
  });
}

describe('dungeon sync 通关状态修复通道', () => {
  it('客户端上报 bossDefeated → 插入 cleared 并带只升不降的 CASE 子句', async () => {
    const db = makeDb(null);
    const resp = await worker.fetch(syncRequest([{
      dungeonId: 'dungeon-01', status: 'cleared', completedStages: 5, totalStages: 5,
      bossDefeated: true, bestScore: 50, bestRating: 'A',
    }]), { DB: db } as never, { waitUntil() {} } as never);
    expect(resp.status).toBe(200);
    const upsert = db.calls.find(c => c.sql.includes('INSERT INTO dungeon_progress'));
    expect(upsert).toBeTruthy();
    expect(upsert!.sql).toContain("status=CASE WHEN excluded.status='cleared' THEN 'cleared'");
    expect(upsert!.bindings[2]).toBe('cleared'); // status 绑定值
  });

  it('满关（completedStages>=totalStages）也升级为 cleared', async () => {
    const db = makeDb(null);
    await worker.fetch(syncRequest([{
      dungeonId: 'dungeon-02', completedStages: 5, totalStages: 5,
      bossDefeated: false, bestScore: 0, bestRating: 'D',
    }]), { DB: db } as never, { waitUntil() {} } as never);
    const upsert = db.calls.find(c => c.sql.includes('INSERT INTO dungeon_progress'));
    expect(upsert!.bindings[2]).toBe('cleared');
  });

  it('未通关的进度保持 locked，不影响已有状态', async () => {
    const db = makeDb(null);
    await worker.fetch(syncRequest([{
      dungeonId: 'dungeon-03', completedStages: 2, totalStages: 5,
      bossDefeated: false, bestScore: 10, bestRating: 'C',
    }]), { DB: db } as never, { waitUntil() {} } as never);
    const upsert = db.calls.find(c => c.sql.includes('INSERT INTO dungeon_progress'));
    expect(upsert!.bindings[2]).toBe('locked');
    // ON CONFLICT 只在 excluded 为 cleared 时升级，否则保留原状态
    expect(upsert!.sql).toContain("ELSE dungeon_progress.status END");
  });
});
