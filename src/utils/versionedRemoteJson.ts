const DEFAULT_REMOTE_BASE = 'https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data';

interface VersionInfo {
  version: number;
}

interface LoadVersionedJsonOptions<T> {
  cacheKey: string;
  versionKey: string;
  versionFile: string;
  dataFile: string;
  bundledUrl: string;
  validate: (data: unknown) => data is T;
  remoteBase?: string;
  versionTimeoutMs?: number;
  dataTimeoutMs?: number;
  updateJitterMs?: number;
}

function parseVersion(value: string | null): number {
  const parsed = Number.parseInt(value || '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json() as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function readCached<T>(key: string, validate: (data: unknown) => data is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return validate(data) ? data : null;
  } catch {
    return null;
  }
}

function writeCached<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* ignore quota errors; bundled fallback still works */
  }
}

function refreshCachedInBackground<T>(
  options: {
    url: string;
    timeoutMs: number;
    jitterMs: number;
    cacheKey: string;
    versionKey: string;
    version: number;
    validate: (data: unknown) => data is T;
  }
): void {
  void (async () => {
    try {
      if (options.jitterMs > 0) await delay(Math.floor(Math.random() * options.jitterMs));
      const remoteData = await fetchJson<unknown>(options.url, options.timeoutMs);
      if (options.validate(remoteData)) {
        writeCached(options.cacheKey, remoteData);
        localStorage.setItem(options.versionKey, String(options.version));
      }
    } catch {
      /* keep the existing cached/bundled data */
    }
  })();
}

async function loadBundledVersion(versionFile: string): Promise<number> {
  try {
    const data = await fetchJson<VersionInfo>(`/course-data/${versionFile}`, 5000);
    return Number.isFinite(data.version) ? data.version : 0;
  } catch {
    return 0;
  }
}

export async function loadVersionedRemoteJson<T>(options: LoadVersionedJsonOptions<T>): Promise<T> {
  const {
    cacheKey,
    versionKey,
    versionFile,
    dataFile,
    bundledUrl,
    validate,
    remoteBase = DEFAULT_REMOTE_BASE,
    versionTimeoutMs = 8000,
    dataTimeoutMs = 15000,
    updateJitterMs = 120000,
  } = options;

  let data = readCached(cacheKey, validate);
  let localVersion = parseVersion(localStorage.getItem(versionKey));

  if (!data) {
    const bundled = await fetchJson<unknown>(bundledUrl, 8000);
    if (!validate(bundled)) throw new Error(`内置数据格式异常：${dataFile}`);
    data = bundled;
    writeCached(cacheKey, data);
    localVersion = await loadBundledVersion(versionFile);
    if (localVersion > 0) localStorage.setItem(versionKey, String(localVersion));
  }

  try {
    const remoteVersion = await fetchJson<VersionInfo>(`${remoteBase}/${versionFile}`, versionTimeoutMs);
    if (Number.isFinite(remoteVersion.version) && remoteVersion.version > localVersion) {
      refreshCachedInBackground({
        url: `${remoteBase}/${dataFile}`,
        timeoutMs: dataTimeoutMs,
        jitterMs: updateJitterMs,
        cacheKey,
        versionKey,
        version: remoteVersion.version,
        validate,
      });
    }
  } catch {
    /* network errors fall back to cached/bundled data */
  }

  return data;
}
