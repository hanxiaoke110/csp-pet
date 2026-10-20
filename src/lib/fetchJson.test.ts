import { afterEach, expect, it, vi } from 'vitest';
import { fetchJson } from './fetchJson';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('rejects HTML and HTTP failures rather than returning an empty catalog', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('<!doctype html>', { status: 200 }))
    .mockResolvedValueOnce(new Response('{"error":"temporarily unavailable"}', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchJson('/catalog')).rejects.toThrow('非 JSON');
  await expect(fetchJson('/catalog')).rejects.toThrow('temporarily unavailable');
});
it('keeps valid empty results distinct from a network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"items":[]}')));
  await expect(fetchJson('/catalog')).resolves.toEqual({ items: [] });
});
it('applies the timeout through body reading, not just response headers', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async (_url, options: RequestInit) => ({
    status: 200, ok: true,
    text: () => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }),
  })));
  const pending = expect(fetchJson('/catalog', {}, 100)).rejects.toThrow('aborted');
  await vi.advanceTimersByTimeAsync(101);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
