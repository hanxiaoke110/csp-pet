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
  retain?: (key: string) => () => void;
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
          const releaseCache = io.retain?.(key);
          let released = false;
          return { url, style: entry.style, release: () => { if (!released) { released = true; io.revokeUrl(url); releaseCache?.(); } } };
        } catch { return null; }
      })();
      const timeout = new Promise<null>(resolve => { timer = setTimeout(() => { expired = true; controller.abort(); resolve(null); }, waitMs); });
      try { return await Promise.race([task, timeout]); }
      finally { clearTimeout(timer!); }
    },
  };
}

function isDesktop(): boolean { return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window; }
interface PortraitCacheFS {
  stat(key: string): Promise<{ size: number; modified?: number; isFile?: boolean }>;
  read(key: string): Promise<Uint8Array>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  list(): Promise<string[]>;
  remove(key: string): Promise<void>;
}

/** Only files owned by this cache are eligible for eviction. Active blob leases
 * pin their source until scene destruction; replaced hashes retire on release. */
export function createPortraitNativeCache(fs: PortraitCacheFS) {
  const active = new Map<string, number>();
  const latest = new Map<string, string>();
  const touched = new Map<string, number>();
  let sequence = 0;
  let queue = Promise.resolve();
  const species = (key: string) => key.match(/^([a-zA-Z0-9_-]{1,100})-[a-f0-9]{64}\.img$/)?.[1];
  const owned = (key: string) => key === 'catalog.json' || Boolean(species(key));
  const cap = (key: string) => key === 'catalog.json' ? 256 * 1024 : MAX_BYTES;
  const enqueue = (work: () => Promise<void>) => {
    const task = queue.then(work);
    queue = task.catch(() => {});
    return task;
  };
  async function prune(protect?: string) {
    const files: { key: string; size: number; modified: number }[] = [];
    for (const key of await fs.list()) {
      if (!owned(key)) continue;
      try {
        const info = await fs.stat(key);
        if (info.isFile === false) continue;
        if (!Number.isSafeInteger(info.size) || info.size <= 0 || info.size > cap(key)) { await fs.remove(key); continue; }
        files.push({ key, size: info.size, modified: info.modified || 0 });
      } catch { /* A concurrent missing file is already pruned. */ }
    }
    const protectedKey = (key: string) => key === protect || Boolean(active.get(key));
    // Older app sessions can leave several hashes of one species on disk.
    // Recover their newest version from filesystem timestamps before pruning.
    for (const file of files) {
      const id = species(file.key);
      if (!id) continue;
      const previous = files.find(item => item.key === latest.get(id));
      if (!previous || (!touched.has(previous.key) && file.modified > previous.modified)) latest.set(id, file.key);
    }
    const remove = async (file: typeof files[number]) => {
      await fs.remove(file.key);
      files.splice(files.indexOf(file), 1); touched.delete(file.key);
    };
    for (const file of [...files]) {
      const id = species(file.key);
      if (id && latest.has(id) && latest.get(id) !== file.key && !protectedKey(file.key)) await remove(file);
    }
    const candidates = files.filter(file => file.key !== 'catalog.json' && !protectedKey(file.key)).sort((a, b) =>
      (touched.get(a.key) || 0) - (touched.get(b.key) || 0) || a.modified - b.modified);
    while (files.filter(file => species(file.key)).length > 16 || files.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) {
      const oldest = candidates.shift();
      if (!oldest) throw new Error('Active portrait cache exceeds budget');
      await remove(oldest);
    }
  }
  return {
    async read(key: string): Promise<Uint8Array | null> {
      if (!owned(key)) return null;
      try {
        const info = await fs.stat(key);
        if (info.isFile === false || !Number.isSafeInteger(info.size) || info.size <= 0 || info.size > cap(key)) return null;
        const bytes = await fs.read(key);
        if (bytes.length !== info.size || bytes.length > cap(key)) return null;
        touched.set(key, ++sequence);
        return bytes;
      } catch { return null; }
    },
    write(key: string, bytes: Uint8Array): Promise<void> {
      if (!owned(key) || !bytes.length || bytes.length > cap(key)) return Promise.resolve();
      return enqueue(async () => {
        await fs.write(key, bytes); touched.set(key, ++sequence);
        const id = species(key); if (id) latest.set(id, key);
        try { await prune(key); }
        catch (error) {
          // If every older entry is pinned, leave the verified bytes in the
          // caller's memory and discard this new disk entry to preserve the cap.
          if (!active.get(key)) await fs.remove(key).catch(() => {});
          throw error;
        }
      });
    },
    retain(key: string): () => void {
      active.set(key, (active.get(key) || 0) + 1);
      let released = false;
      return () => {
        if (released) return; released = true;
        const remaining = (active.get(key) || 1) - 1;
        if (remaining) active.set(key, remaining); else active.delete(key);
        void enqueue(() => prune()).catch(() => {});
      };
    },
  };
}

const nativeCache = createPortraitNativeCache({
  stat: async key => {
    const fs = await import('@tauri-apps/plugin-fs');
    const info = await fs.stat(`battle-portraits/${key}`, { baseDir: fs.BaseDirectory.AppData });
    return { size: info.size, modified: info.mtime?.getTime(), isFile: info.isFile };
  },
  read: async key => {
    const fs = await import('@tauri-apps/plugin-fs');
    return fs.readFile(`battle-portraits/${key}`, { baseDir: fs.BaseDirectory.AppData });
  },
  write: async (key, bytes) => {
    const fs = await import('@tauri-apps/plugin-fs');
    await fs.mkdir('battle-portraits', { baseDir: fs.BaseDirectory.AppData, recursive: true });
    await fs.writeFile(`battle-portraits/${key}`, bytes, { baseDir: fs.BaseDirectory.AppData });
  },
  list: async () => {
    const fs = await import('@tauri-apps/plugin-fs');
    return (await fs.readDir('battle-portraits', { baseDir: fs.BaseDirectory.AppData })).filter(entry => entry.isFile).map(entry => entry.name);
  },
  remove: async key => {
    const fs = await import('@tauri-apps/plugin-fs');
    await fs.remove(`battle-portraits/${key}`, { baseDir: fs.BaseDirectory.AppData });
  },
});
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
    return nativeCache.read(key);
  },
  write: async (key, bytes) => {
    if (!isDesktop()) return webCache.write(key, bytes);
    return nativeCache.write(key, bytes);
  },
  retain: key => isDesktop() ? nativeCache.retain(key) : () => {},
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
