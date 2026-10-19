import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commitLocalSnapshots, recoverPartnerTransaction, recoverPartnerState, withPartnerTransactionLock, PARTNER_JOURNAL_KEY } from './partnerTransactions';
import { createTestLockManager } from '../testSupport/webLocks';
import { dualSave } from './persist';
function makeLocalStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

vi.mock('./persist', () => ({ dualSave: vi.fn() }));
beforeEach(() => { vi.mocked(dualSave).mockReset(); vi.stubGlobal('localStorage', makeLocalStorage()); });
describe('durable multi snapshot transactions', () => {
  it.each(['commit', 'rollback'] as const)('中文存储记录在 %s 日志恢复时同样兼容', phase => {
    const key = 'dungeon_healing_recent_C++ 语法（基础）';
    localStorage.setItem(PARTNER_JOURNAL_KEY, JSON.stringify({ version: 1, phase,
      before: { [key]: 'old' }, after: { [key]: 'new' }, mirrors: {} }));
    recoverPartnerTransaction();
    expect(localStorage.getItem(key)).toBe(phase === 'commit' ? 'new' : 'old');
    expect(localStorage.getItem(PARTNER_JOURNAL_KEY)).toBeNull();
  });
  it.each(['unrelated_key', '__proto__', PARTNER_JOURNAL_KEY, 'csp_bad\nkey', 'dungeon_bad\u0000key', 'csp_bad\u007fkey', 'csp_' + 'x'.repeat(161)])('兼容中文仍拒绝非法存储键 %j', key => {
    const writer = vi.spyOn(localStorage, 'setItem');
    expect(commitLocalSnapshots(Object.fromEntries([[key, 'blocked']]))).toBe(false);
    expect(writer).not.toHaveBeenCalled();
  });
  it('中文键写入失败仍回滚金币和最近题目记录', () => {
    const key = 'dungeon_healing_recent_函数与递归';
    localStorage.setItem('csp_pet_data', '{"ownedPets":[],"coins":99}');
    localStorage.setItem(key, 'old');
    const write = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((k, value) => {
      if (k === key && value === 'new') throw new Error('quota');
      write(k, value);
    });
    expect(commitLocalSnapshots({ csp_pet_data: '{"ownedPets":[],"coins":100}', [key]: 'new' })).toBe(false);
    expect(localStorage.getItem('csp_pet_data')).toBe('{"ownedPets":[],"coins":99}');
    expect(localStorage.getItem(key)).toBe('old');
  });
  it('serializes another window recovery behind an active transaction', async () => {
    vi.stubGlobal('navigator', { locks: createTestLockManager() });
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const active = withPartnerTransactionLock(async () => {
      localStorage.setItem(PARTNER_JOURNAL_KEY, JSON.stringify({ version: 1, phase: 'rollback', before: { csp_one: 'old' }, after: { csp_one: 'new' }, mirrors: {} }));
      localStorage.setItem('csp_one', 'new');
      entered();
      await new Promise<void>(resolve => { release = resolve; });
      localStorage.removeItem(PARTNER_JOURNAL_KEY);
    });
    await started;
    const recovery = recoverPartnerState();
    await Promise.resolve();
    expect(localStorage.getItem('csp_one')).toBe('new');
    expect(localStorage.getItem(PARTNER_JOURNAL_KEY)).not.toBeNull();
    release(); await active; await recovery;
    expect(localStorage.getItem('csp_one')).toBe('new');
  });
  it('fails closed for paid operations without Web Locks but permits clean read-only recovery', async () => {
    vi.stubGlobal('navigator', {});
    const action = vi.fn();
    await expect(withPartnerTransactionLock(action)).rejects.toThrow('安全交易');
    expect(action).not.toHaveBeenCalled();
    await expect(recoverPartnerState()).resolves.toBeUndefined();
  });
  it('commits all snapshots and removes its journal', () => {
    expect(commitLocalSnapshots({ csp_one: '{"balance":2}', csp_two: '{"balance":3}' })).toBe(true);
    expect(localStorage.getItem('csp_one')).toBe('{"balance":2}');
    expect(localStorage.getItem(PARTNER_JOURNAL_KEY)).toBeNull();
  });
  it('rolls back a failed second write, without a half paid state', () => {
    localStorage.setItem('csp_one', '{"balance":9}');
    const real = localStorage.setItem.bind(localStorage);
    let failed = false;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'csp_two' && !failed) { failed = true; throw new Error('disk full'); }
      real(key, value);
    });
    expect(commitLocalSnapshots({ csp_one: '{"balance":2}', csp_two: '{"balance":3}' })).toBe(false);
    expect(localStorage.getItem('csp_one')).toBe('{"balance":9}');
    expect(localStorage.getItem('csp_two')).toBeNull();
  });
  it('replays an interrupted journal exactly once and rejects malformed journals', () => {
    localStorage.setItem(PARTNER_JOURNAL_KEY, JSON.stringify({ version: 1, phase: 'commit', before: { csp_one: null }, after: { csp_one: '{"balance":2}' }, mirrors: {} }));
    recoverPartnerTransaction(); recoverPartnerTransaction();
    expect(localStorage.getItem('csp_one')).toBe('{"balance":2}');
    localStorage.setItem(PARTNER_JOURNAL_KEY, '{"version":1,"after":{"bad":12}}');
    expect(() => recoverPartnerTransaction()).toThrow();
  });
  it('never commits a rejected purchase when disk failure prevents rollback writes', () => {
    localStorage.setItem('csp_one', '{"balance":9}');
    const real = localStorage.setItem.bind(localStorage);
    let full = false;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'csp_two') full = true;
      if (full) throw new Error('disk unavailable');
      real(key, value);
    });
    expect(commitLocalSnapshots({ csp_one: '{"balance":2}', csp_two: '{"balance":3}' })).toBe(false);
    spy.mockRestore();
    recoverPartnerTransaction();
    expect(localStorage.getItem('csp_one')).toBe('{"balance":9}');
    expect(localStorage.getItem('csp_two')).toBeNull();
  });
  it('retains durable local authority when the SQLite mirror fails', () => {
    vi.mocked(dualSave).mockImplementation(() => { throw new Error('SQLite offline'); });
    expect(commitLocalSnapshots({ csp_one: '{"balance":2}' }, { csp_one: 'one' })).toBe(true);
    recoverPartnerTransaction();
    expect(localStorage.getItem('csp_one')).toBe('{"balance":2}');
    expect(localStorage.getItem(PARTNER_JOURNAL_KEY)).toBeNull();
  });
});
