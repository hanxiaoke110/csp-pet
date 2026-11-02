import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCollectorSnapshot } from './api.js';

let sql;
let db;
let calls;
let backup;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T15:59:00Z'));
  sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE collector_vote_snapshots(snapshot_date TEXT PRIMARY KEY, ballot_count INTEGER NOT NULL, results_json TEXT NOT NULL, created_at TEXT);
    CREATE TABLE collector_ballots(device_hash TEXT PRIMARY KEY, choices_json TEXT);
    CREATE TABLE workshop_pets(id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO workshop_pets VALUES('pet1','智子一号');
    INSERT INTO collector_ballots VALUES('device1','["pet1"]');`);
  calls = [];
  db = { prepare(query) {
    calls.push(query.replace(/\s+/g, ' ').trim());
    let bindings = [];
    return {
      bind(...values) { bindings = values; return this; },
      async first() { return sql.prepare(query).get(...bindings) || null; },
      async all() { return { results: sql.prepare(query).all(...bindings) }; },
      async run() { const result = sql.prepare(query).run(...bindings); return { meta: { changes: Number(result.changes) } }; },
    };
  } };
  backup = { put: vi.fn(async () => {}) };
  setConfig({ status: 'open' });
});
afterEach(() => { sql.close(); vi.useRealTimers(); });
function setConfig(config) { sql.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('collector_vote_config', JSON.stringify(config)); }
function aggregates() { return calls.filter(query => query.includes('FROM collector_ballots')); }
function completed() { return sql.prepare('SELECT value FROM meta WHERE key=?').get('collector_vote_snapshot_backup_date')?.value; }
function snapshots() { return sql.prepare('SELECT * FROM collector_vote_snapshots ORDER BY snapshot_date').all(); }

describe('典藏投票每日快照', () => {
  it.each([
    { status: 'closed' },
    { status: 'open', endsAt: '2026-11-01T00:00:00Z' },
    { status: 'open', startsAt: '2026-11-03T00:00:00Z' },
    { status: 'open', endsAt: '2026-11-02T15:59:00Z' },
  ])('活动未开放或已截止时不聚合、写快照或删除投票：%j', async config => {
    setConfig(config);
    await saveCollectorSnapshot(db, backup);
    await saveCollectorSnapshot(db, backup);
    expect(aggregates()).toEqual([]);
    expect(snapshots()).toEqual([]);
    expect(backup.put).not.toHaveBeenCalled();
    expect(sql.prepare('SELECT count(*) AS count FROM collector_ballots').get().count).toBe(1);
    expect(calls.some(query => /DELETE FROM collector_|UPDATE collector_ballots/i.test(query))).toBe(false);
  });

  it('开放期间同一北京日只封存一次，下一北京日允许新快照', async () => {
    await saveCollectorSnapshot(db, backup);
    await saveCollectorSnapshot(db, backup);
    expect(aggregates()).toHaveLength(2); // count + grouped results, one aggregation pass
    expect(snapshots().map(row => row.snapshot_date)).toEqual(['2026-11-02']);
    expect(backup.put).toHaveBeenCalledTimes(1);
    expect(completed()).toBe('2026-11-02');
    vi.setSystemTime(new Date('2026-11-02T16:00:00Z'));
    await saveCollectorSnapshot(db, backup);
    expect(snapshots().map(row => row.snapshot_date)).toEqual(['2026-11-02', '2026-11-03']);
    expect(backup.put).toHaveBeenCalledTimes(2);
  });

  it('对象存储失败不标记完成，重试复用已封存结果，不重新扫描或覆盖快照', async () => {
    backup.put.mockRejectedValueOnce(new Error('backup unavailable'));
    await expect(saveCollectorSnapshot(db, backup)).rejects.toThrow('backup unavailable');
    const first = snapshots()[0];
    expect(completed()).toBeUndefined();
    sql.prepare('INSERT INTO collector_ballots VALUES(?,?)').run('device2', '["pet1"]');
    await saveCollectorSnapshot(db, backup);
    expect(aggregates()).toHaveLength(2);
    expect(snapshots()).toEqual([first]);
    expect(JSON.parse(backup.put.mock.calls[1][1]).ballotCount).toBe(1);
    expect(completed()).toBe('2026-11-02');
    await saveCollectorSnapshot(db, backup);
    expect(backup.put).toHaveBeenCalledTimes(2);
  });

  it('数据库写入失败后可重试，不提前写对象存储或完成标记', async () => {
    sql.exec("CREATE TRIGGER fail_snapshot BEFORE INSERT ON collector_vote_snapshots BEGIN SELECT RAISE(ABORT, 'snapshot failed'); END;");
    await expect(saveCollectorSnapshot(db, backup)).rejects.toThrow('snapshot failed');
    expect(completed()).toBeUndefined();
    expect(backup.put).not.toHaveBeenCalled();
    sql.exec('DROP TRIGGER fail_snapshot');
    await saveCollectorSnapshot(db, backup);
    expect(snapshots()).toHaveLength(1);
    expect(completed()).toBe('2026-11-02');
  });

  it('重叠 cron 不重复聚合或并发备份同日快照', async () => {
    let finish;
    backup.put.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = saveCollectorSnapshot(db, backup);
    for (let turn = 0; turn < 20 && !finish; turn++) await Promise.resolve();
    expect(finish).toBeTypeOf('function');
    await saveCollectorSnapshot(db, backup);
    expect(aggregates()).toHaveLength(2);
    expect(backup.put).toHaveBeenCalledTimes(1);
    finish(); await first;
    expect(snapshots()).toHaveLength(1);
  });

  it('进程崩溃遗留租约到期后可恢复备份', async () => {
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    sql.prepare('INSERT INTO meta VALUES(?,?)').run('collector_vote_snapshot_lock:2026-11-02', `${Date.now() + 60_000}:crashed`);
    await saveCollectorSnapshot(db, backup);
    expect(backup.put).not.toHaveBeenCalled();
    vi.setSystemTime(new Date(Date.now() + 60_001));
    await saveCollectorSnapshot(db, backup);
    expect(backup.put).toHaveBeenCalledTimes(1);
    expect(completed()).toBe('2026-11-02');
  });

  it('未绑定对象存储时仍可每天只保存一个 D1 快照', async () => {
    await saveCollectorSnapshot(db);
    await saveCollectorSnapshot(db);
    expect(aggregates()).toHaveLength(2);
    expect(snapshots()).toHaveLength(1);
    expect(completed()).toBe('2026-11-02');
  });
});
