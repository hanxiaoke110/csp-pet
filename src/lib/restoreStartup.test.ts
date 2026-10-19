import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestLockManager } from '../testSupport/webLocks';
vi.mock('./sqlite-storage', () => ({ sqliteSetFireAndForget: vi.fn(), sqliteGet: vi.fn() }));
let data: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
  vi.stubGlobal('navigator', { locks: createTestLockManager() });
});
afterEach(() => vi.unstubAllGlobals());
it('settles an interrupted rollback before allowing a fresh page to write', async () => {
  data.set('csp_restore_generation_v1', 'restoring:test');
  data.set('csp_example', 'partial');
  data.set('csp_partner_transaction_v1', JSON.stringify({ version: 1, phase: 'rollback',
    before: { csp_example: 'before' }, after: { csp_example: 'after' }, mirrors: {} }));
  const barrier = await import('./restoreBarrier');
  expect(barrier.storageWritesAllowed()).toBe(false);
  const { recoverInterruptedRestore } = await import('./restoreStartup');
  expect(await recoverInterruptedRestore()).toBe(true);
  expect(data.get('csp_example')).toBe('before');
  expect(data.has('csp_partner_transaction_v1')).toBe(false);
  expect(barrier.storageWritesAllowed()).toBe(false);
  vi.resetModules();
  expect((await import('./restoreBarrier')).storageWritesAllowed()).toBe(true);
});
it('does not release a corrupt interrupted journal or erase its evidence', async () => {
  data.set('csp_restore_generation_v1', 'restoring:test');
  data.set('csp_partner_transaction_v1', '{broken');
  const { recoverInterruptedRestore } = await import('./restoreStartup');
  await expect(recoverInterruptedRestore()).rejects.toThrow();
  expect(data.get('csp_partner_transaction_v1')).toBe('{broken');
  expect(data.get('csp_restore_generation_v1')).toBe('restoring:test');
});
