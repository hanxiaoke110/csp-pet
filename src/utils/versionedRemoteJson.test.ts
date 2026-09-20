import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadVersionedRemoteJson } from './versionedRemoteJson';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe('versioned remote json', () => {
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: originalStorage, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true, writable: true });
  });

  it('falls back from the primary CDN to the mirror and keeps bundled data until the refresh completes', async () => {
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/course-data/data.json') return new Response(JSON.stringify({ value: 'bundled' }));
      if (url === '/course-data/version.json') return new Response(JSON.stringify({ version: 1 }));
      if (url === 'https://cdn.test/version.json') throw new Error('offline');
      if (url === 'https://mirror.test/version.json') return new Response(JSON.stringify({ version: 2 }));
      if (url === 'https://mirror.test/data.json') return new Response(JSON.stringify({ value: 'remote' }));
      return new Response('', { status: 404 });
    });
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true, writable: true });

    const initial = await loadVersionedRemoteJson<{ value: string }>({
      cacheKey: 'course-cache',
      versionKey: 'course-version',
      versionFile: 'version.json',
      dataFile: 'data.json',
      bundledUrl: '/course-data/data.json',
      remoteBases: ['https://cdn.test', 'https://mirror.test'],
      updateJitterMs: 0,
      validate: (value): value is { value: string } => Boolean(value && typeof value === 'object' && 'value' in value),
    });

    expect(initial).toEqual({ value: 'bundled' });
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('course-cache') || '{}')).toEqual({ value: 'remote' }));
    expect(localStorage.getItem('course-version')).toBe('2');
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.test/version.json', expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith('https://mirror.test/data.json', expect.any(Object));
  });
});
