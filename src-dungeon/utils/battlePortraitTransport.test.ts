import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { fetchBattlePortraitResponse } from './battlePortraits';

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn(async () => new Response('native')) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('desktop portrait request cancellation', () => {
  it('uses the CORS static endpoint through WebView fetch, avoiding native resource handles', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: vi.fn() } });
    const browserFetch = vi.fn(async () => new Response('web'));
    vi.stubGlobal('fetch', browserFetch);
    const control = new AbortController();
    const response = await fetchBattlePortraitResponse('https://cards.cspstudy.top/battle-portraits/catalog.json', { signal: control.signal, redirect: 'error' });
    expect(await response.text()).toBe('web');
    control.abort(); // A later timeout cannot cancel an already consumed native RID.
    expect(nativeFetch).not.toHaveBeenCalled();
    expect(browserFetch).toHaveBeenCalledWith('https://cards.cspstudy.top/battle-portraits/catalog.json', { signal: control.signal, redirect: 'error' });
  });
  it('propagates normal request cancellation for the loader to handle as a local-art fallback', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: vi.fn() } });
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const control = new AbortController();
    const promise = fetchBattlePortraitResponse('https://cards.cspstudy.top/battle-portraits/capi.webp', { signal: control.signal });
    const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    control.abort();
    await rejected;
    expect(nativeFetch).not.toHaveBeenCalled();
  });
});
