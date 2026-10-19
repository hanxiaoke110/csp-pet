// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import DungeonSyncRuntime from './DungeonSyncRuntime';
import { syncProgress } from '../utils/api';

it('retries pending progress after reconnect without polling the server when idle; cleans up on unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  localStorage.clear();
  const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<StrictMode><DungeonSyncRuntime /></StrictMode>));
    await act(async () => vi.advanceTimersByTimeAsync(120000));
    expect(fetcher).not.toHaveBeenCalled();
    expect(localStorage.getItem('csp_wish_device')).toBeNull();
    localStorage.setItem('csp_device_hash', 'runtime-student');
    localStorage.setItem('csp_class_code', 'CLASS1');
    await syncProgress({ badges: ['first_blood'] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockImplementation(async () => new Response('{"success":true,"synced":true}'));
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(60000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(120000));
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount()); host.remove();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear();
  }
});
