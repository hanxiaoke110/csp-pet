// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import StorageSafety from './StorageSafety';
const state = vi.hoisted(() => ({ writable: true }));
vi.mock('../lib/restoreBarrier', () => ({ storageWritesAllowed: () => state.writable, RESTORE_GENERATION_KEY: 'test-restore', interruptedRestore: false }));
vi.mock('../stores/petStore', () => ({ usePetStore: (select: (value: { loadError: null }) => unknown) => select({ loadError: null }) }));
it('shows partial database-mirror failures above the blocked old page after restoring', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  const oldAction = vi.fn();
  try {
    await act(async () => { root.render(<><button id="old-action" onClick={oldAction}>旧操作</button><StorageSafety /></>); });
    state.writable = false;
    localStorage.setItem('test-restore', 'complete:test');
    await act(async () => { window.dispatchEvent(new CustomEvent('backup-restore-completed', { detail: { lsCount: 12, sqliteFailures: 2 } })); });
    expect(host.textContent).toContain('已恢复 12 项');
    expect(host.textContent).toContain('2 项数据库镜像写入失败');
    expect(host.querySelector<HTMLButtonElement>('[data-storage-reload]')?.disabled).toBe(false);
    await act(async () => { host.querySelector<HTMLButtonElement>('#old-action')!.click(); });
    expect(oldAction).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.removeItem('test-restore');
    state.writable = true; vi.unstubAllGlobals();
  }
});
