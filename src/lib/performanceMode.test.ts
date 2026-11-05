// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ emit: vi.fn().mockResolvedValue(undefined), listen: vi.fn(), receive: null as null | ((event: { payload: unknown }) => void), stop: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ emit: native.emit, listen: native.listen }));
import { PERFORMANCE_MODE_KEY, readPerformanceMode, subscribePerformanceMode, writePerformanceMode } from './performanceMode';
beforeEach(() => {
  localStorage.clear(); writePerformanceMode('standard'); vi.clearAllMocks();
  native.listen.mockImplementation((_name, receive) => { native.receive = receive; return Promise.resolve(native.stop); });
});
it('persists a local switch and notifies mounted visual subscribers', () => {
  const update = vi.fn(); const stop = subscribePerformanceMode(update);
  writePerformanceMode('economy');
  expect(readPerformanceMode()).toBe('economy'); expect(localStorage.getItem(PERFORMANCE_MODE_KEY)).toBe('economy'); expect(update).toHaveBeenCalledOnce(); stop();
});
it('receives another browser window preference and ignores malformed events', () => {
  const update = vi.fn(); const stop = subscribePerformanceMode(update);
  window.dispatchEvent(new StorageEvent('storage', { key: PERFORMANCE_MODE_KEY, newValue: 'economy' }));
  expect(readPerformanceMode()).toBe('economy');
  window.dispatchEvent(new StorageEvent('storage', { key: PERFORMANCE_MODE_KEY, newValue: 'invalid' }));
  expect(update).toHaveBeenCalledOnce(); stop();
});
it('propagates to native windows and tears down an asynchronously installed listener', async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  try {
    const update = vi.fn(); const stop = subscribePerformanceMode(update);
    writePerformanceMode('economy'); expect(native.emit).toHaveBeenCalledWith('csp-performance-mode', 'economy');
    native.receive?.({ payload: 'standard' }); expect(readPerformanceMode()).toBe('standard');
    native.receive?.({ payload: 'corrupt' }); expect(readPerformanceMode()).toBe('standard');
    stop(); await Promise.resolve(); expect(native.stop).toHaveBeenCalledOnce();
  } finally { delete (window as any).__TAURI_INTERNALS__; }
});
