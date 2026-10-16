import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commitLocalSnapshots, recoverPartnerTransaction, PARTNER_JOURNAL_KEY } from './partnerTransactions';
import { dualSave } from './persist';
function makeLocalStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

vi.mock('./persist', () => ({ dualSave: vi.fn() }));
beforeEach(() => { vi.mocked(dualSave).mockReset(); vi.stubGlobal('localStorage', makeLocalStorage()); });
describe('durable multi snapshot transactions', () => {
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
