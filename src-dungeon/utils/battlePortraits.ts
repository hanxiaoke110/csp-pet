const ROOT = 'https://cards.cspstudy.top/battle-portraits/';
export const BATTLE_PORTRAIT_CATALOG_URL = `${ROOT}catalog.json`;
const MAX_BYTES = 4 * 1024 * 1024;
const TTL = 6 * 60 * 60 * 1000;
export interface BattlePortraitEntry {
  speciesId: string; url: string; bytes: number; sha256: string;
  width: number; height: number; style: 'painted' | 'pixel';
}
export interface BattlePortraitCatalog { version: 1; portraits: BattlePortraitEntry[] }
export interface BattlePortrait { url: string; style: 'painted' | 'pixel'; release: () => void }

export function isTrustedPortraitUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://cards.cspstudy.top' && !url.username && !url.password &&
      /^\/battle-portraits\/[a-zA-Z0-9_-]+\.(webp|png)$/.test(url.pathname) && !url.search && !url.hash;
  } catch { return false; }
}

export function parsePortraitCatalog(value: unknown): BattlePortraitCatalog {
  const catalog = value as BattlePortraitCatalog;
  if (catalog?.version !== 1 || !Array.isArray(catalog.portraits) || catalog.portraits.length > 500) throw new Error('Invalid portrait catalog');
  const ids = new Set<string>();
  for (const entry of catalog.portraits) {
    if (!entry || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.speciesId) || ids.has(entry.speciesId) ||
      !isTrustedPortraitUrl(entry.url) || !Number.isInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > MAX_BYTES ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isInteger(entry.width) || entry.width < 1 || entry.width > 2048 ||
      entry.height !== entry.width || !['painted', 'pixel'].includes(entry.style)) throw new Error('Invalid portrait entry');
    ids.add(entry.speciesId);
  }
  return catalog;
}

export interface PortraitIO {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  read: (key: string) => Promise<Uint8Array | null>;
  write: (key: string, bytes: Uint8Array) => Promise<void>;
  dimensions: (bytes: Uint8Array) => Promise<{ width: number; height: number }>;
  digest: (bytes: Uint8Array) => Promise<string>;
  createUrl: (bytes: Uint8Array) => string;
  revokeUrl: (url: string) => void;
  now: () => number;
}

async function readBounded(response: Response, cap: number): Promise<Uint8Array> {
  if (!response.ok || Number(response.headers.get('content-length')) > cap) throw new Error('Portrait response too large');
  if (!response.body) throw new Error('Missing response stream');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > cap) throw new Error('Portrait response too large');
      chunks.push(value);
    }
  } finally { void reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Reject decompression bombs before asking the image decoder to allocate pixels. */
export function portraitHeaderDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (start: number, count: number) => String.fromCharCode(...bytes.slice(start, start + count));
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) && tag(12, 4) === 'IHDR') return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 30 && tag(0, 4) === 'RIFF' && tag(8, 4) === 'WEBP') {
    if (tag(12, 4) === 'VP8X') {
      if (bytes[20] & 2) throw new Error('Animated portraits are unsupported');
      return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    }
    if (tag(12, 4) === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (tag(12, 4) === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  throw new Error('Unsupported portrait image');
}

export function createBattlePortraitLoader(io: PortraitIO) {
  let catalog: BattlePortraitCatalog | undefined;
  let expires = 0;
  let refreshing: Promise<BattlePortraitCatalog> | undefined;
  async function request(url: string, cap: number, signal: AbortSignal) {
    const response = await io.fetch(url, { signal, redirect: 'error' });
    if (response.url && response.url !== url) throw new Error('Unexpected portrait redirect');
    return readBounded(response, cap);
  }
  async function getCatalog(signal: AbortSignal) {
    if (catalog && io.now() < expires) return catalog;
    if (!refreshing) refreshing = (async () => {
      try {
        const bytes = await request(BATTLE_PORTRAIT_CATALOG_URL, 256 * 1024, signal);
        const next = parsePortraitCatalog(JSON.parse(new TextDecoder().decode(bytes)));
        catalog = next; expires = io.now() + TTL;
        await io.write('catalog.json', bytes).catch(() => {});
        return next;
      } catch {
        const cached = await io.read('catalog.json');
        if (!cached) throw new Error('Portrait catalog unavailable');
        catalog = parsePortraitCatalog(JSON.parse(new TextDecoder().decode(cached)));
        expires = io.now() + 60_000;
        return catalog;
      } finally { refreshing = undefined; }
    })();
    return refreshing;
  }
  async function verify(bytes: Uint8Array, entry: BattlePortraitEntry) {
    if (bytes.length !== entry.bytes || bytes.length > MAX_BYTES || await io.digest(bytes) !== entry.sha256) throw new Error('Portrait checksum mismatch');
    const header = portraitHeaderDimensions(bytes);
    if (header.width !== entry.width || header.height !== entry.height || header.width * header.height > 2048 * 2048) throw new Error('Portrait dimensions mismatch');
    const decoded = await io.dimensions(bytes);
    if (decoded.width !== entry.width || decoded.height !== entry.height) throw new Error('Decoded portrait mismatch');
  }
  return {
    async load(speciesId: string, waitMs = 1200): Promise<BattlePortrait | null> {
      const controller = new AbortController();
      let expired = false;
      let timer: ReturnType<typeof setTimeout>;
      const task = (async () => {
        try {
          const entry = (await getCatalog(controller.signal)).portraits.find(item => item.speciesId === speciesId);
          if (!entry || expired) return null;
          const key = `${entry.speciesId}-${entry.sha256}.img`;
          let bytes = await io.read(key);
          if (bytes) {
            try { await verify(bytes, entry); } catch { bytes = null; }
          }
          if (!bytes) {
            bytes = await request(entry.url, entry.bytes, controller.signal);
            await verify(bytes, entry);
            await io.write(key, bytes).catch(() => {});
          }
          if (expired) return null;
          const url = io.createUrl(bytes);
          let released = false;
          return { url, style: entry.style, release: () => { if (!released) { released = true; io.revokeUrl(url); } } };
        } catch { return null; }
      })();
      const timeout = new Promise<null>(resolve => { timer = setTimeout(() => { expired = true; controller.abort(); resolve(null); }, waitMs); });
      try { return await Promise.race([task, timeout]); }
      finally { clearTimeout(timer!); }
    },
  };
}

function isDesktop(): boolean { return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window; }
/** Binary CacheStorage survives browser reloads. It contains at most 16 portraits
 * plus one catalog (~64 MiB), and every cache hit is verified again by the loader. */
export function createPortraitWebCache(storage?: Pick<CacheStorage, 'open'>) {
  const memory = new Map<string, Uint8Array>();
  const cacheUrl = (key: string) => `https://cards.cspstudy.top/battle-portrait-cache-v1/${key}`;
  const limit = (key: string) => key === 'catalog.json' ? 256 * 1024 : MAX_BYTES;
  async function open() {
    try { return storage ? await storage.open('csp-battle-portraits-v1') : null; }
    catch { return null; }
  }
  return {
    async read(key: string): Promise<Uint8Array | null> {
      const cache = await open();
      if (!cache) return memory.get(key) || null;
      try {
        const response = await cache.match(cacheUrl(key));
        return response ? await readBounded(response, limit(key)) : null;
      } catch { await cache.delete(cacheUrl(key)).catch(() => {}); return null; }
    },
    async write(key: string, bytes: Uint8Array): Promise<void> {
      if (!bytes.length || bytes.length > limit(key)) return;
      const cache = await open();
      if (!cache) {
        memory.delete(key); memory.set(key, bytes);
        const portraits = [...memory.keys()].filter(item => item !== 'catalog.json');
        for (const item of portraits.slice(0, Math.max(0, portraits.length - 16))) memory.delete(item);
        return;
      }
      await cache.delete(cacheUrl(key));
      await cache.put(cacheUrl(key), new Response(new Uint8Array(bytes)));
      const portraits = (await cache.keys()).filter(request => !request.url.endsWith('/catalog.json'));
      for (const request of portraits.slice(0, Math.max(0, portraits.length - 16))) await cache.delete(request);
    },
  };
}
const webCache = createPortraitWebCache(typeof caches !== 'undefined' ? caches : undefined);
const defaultLoader = createBattlePortraitLoader({
  fetch: async (url, init) => {
    if (import.meta.env.DEV && !isDesktop()) {
      // Local cloud-source previews are development only and never bundled.
      const local = await fetch(`/cloud-assets-source/battle-portraits/${url.slice(ROOT.length)}`, init);
      if (local.ok && !local.headers.get('content-type')?.includes('text/html')) {
        return new Response(local.body, { status: local.status, headers: local.headers });
      }
    }
    return isDesktop() ? (await import('@tauri-apps/plugin-http')).fetch(url, { ...init, connectTimeout: 1200 }) : fetch(url, init);
  },
  read: async key => {
    if (!isDesktop()) return webCache.read(key);
    try { const fs = await import('@tauri-apps/plugin-fs'); return await fs.readFile(`battle-portraits/${key}`, { baseDir: fs.BaseDirectory.AppData }); } catch { return null; }
  },
  write: async (key, bytes) => {
    if (!isDesktop()) return webCache.write(key, bytes);
    const fs = await import('@tauri-apps/plugin-fs');
    await fs.mkdir('battle-portraits', { baseDir: fs.BaseDirectory.AppData, recursive: true });
    await fs.writeFile(`battle-portraits/${key}`, bytes, { baseDir: fs.BaseDirectory.AppData });
  },
  dimensions: async bytes => {
    const blob = new Blob([new Uint8Array(bytes)]);
    if (typeof createImageBitmap === 'function') {
      const image = await createImageBitmap(blob);
      const size = { width: image.width, height: image.height }; image.close(); return size;
    }
    const url = URL.createObjectURL(blob);
    try { const image = new Image(); image.src = url; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; }
    finally { URL.revokeObjectURL(url); }
  },
  digest: async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(byte => byte.toString(16).padStart(2, '0')).join(''),
  createUrl: bytes => URL.createObjectURL(new Blob([new Uint8Array(bytes)])),
  revokeUrl: url => URL.revokeObjectURL(url),
  now: Date.now,
});
export const loadBattlePortrait = defaultLoader.load;
