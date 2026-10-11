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

    const onUpdated = vi.fn();
    const initial = await loadVersionedRemoteJson<{ value: string }>({
      cacheKey: 'course-cache',
      versionKey: 'course-version',
      versionFile: 'version.json',
      dataFile: 'data.json',
      bundledUrl: '/course-data/data.json',
      remoteBases: ['https://cdn.test', 'https://mirror.test'],
      updateJitterMs: 0,
      validate: (value): value is { value: string } => Boolean(value && typeof value === 'object' && 'value' in value),
      onUpdated,
    });

    expect(initial).toEqual({ value: 'bundled' });
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('course-cache') || '{}')).toEqual({ value: 'remote' }));
    expect(localStorage.getItem('course-version')).toBe('2');
    expect(onUpdated).toHaveBeenCalledWith({ value: 'remote' });
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.test/version.json', expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith('https://mirror.test/data.json', expect.any(Object));
  });

  it('does not downgrade a newer cached catalog or call the update callback', async () => {
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: true });
    const storage = new MemoryStorage();
    storage.setItem('course-cache', JSON.stringify({ value: 'newer-cache' }));
    storage.setItem('course-version', '8');
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/version.json')) return new Response(JSON.stringify({ version: 7 }));
      return new Response(JSON.stringify({ value: 'older-remote' }));
    });
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true, writable: true });
    const onUpdated = vi.fn();

    const initial = await loadVersionedRemoteJson<{ value: string }>({
      cacheKey: 'course-cache',
      versionKey: 'course-version',
      versionFile: 'version.json',
      dataFile: 'data.json',
      bundledUrl: '/course-data/data.json',
      remoteBase: 'https://cdn.test',
      updateJitterMs: 0,
      validate: (value): value is { value: string } => Boolean(value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string'),
      onUpdated,
    });

    expect(initial).toEqual({ value: 'newer-cache' });
    expect(onUpdated).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith('https://cdn.test/data.json', expect.anything());
    expect(localStorage.getItem('course-version')).toBe('8');
  });

  it('keeps the cached value when a newer remote payload is invalid', async () => {
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: true });
    const storage = new MemoryStorage();
    storage.setItem('course-cache', JSON.stringify({ value: 'valid-cache' }));
    storage.setItem('course-version', '2');
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(async (input: string | URL | Request) => String(input).endsWith('/version.json')
        ? new Response(JSON.stringify({ version: 3 }))
        : new Response(JSON.stringify({ wrong: true }))),
      configurable: true,
      writable: true,
    });
    const onUpdated = vi.fn();

    await loadVersionedRemoteJson<{ value: string }>({
      cacheKey: 'course-cache',
      versionKey: 'course-version',
      versionFile: 'version.json',
      dataFile: 'data.json',
      bundledUrl: '/course-data/data.json',
      remoteBase: 'https://cdn.test',
      updateJitterMs: 0,
      validate: (value): value is { value: string } => Boolean(value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string'),
      onUpdated,
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(JSON.parse(localStorage.getItem('course-cache') || '{}')).toEqual({ value: 'valid-cache' });
    expect(localStorage.getItem('course-version')).toBe('2');
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
