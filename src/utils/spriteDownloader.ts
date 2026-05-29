import { appDataDir } from '@tauri-apps/api/path';
import { exists, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';

const GITEE_BASE = 'https://gitee.com/hanliuliu110/csp-pet/raw/main/pet-sprites-remote/2d';
const FALLBACK_BASE = ''; // Reserve for future CDN failover

// ─── Random delay to spread download load ───
function randomDelay(): Promise<void> {
  const ms = Math.floor(Math.random() * 240_000) + 30_000; // 30s ~ 270s
  return new Promise(r => setTimeout(r, ms));
}

// ─── Exponential backoff ───
function backoff(attempt: number): number {
  // 10s → 30s → 90s → 270s
  return Math.min(10_000 * Math.pow(3, attempt), 300_000);
}

export type DownloadResult =
  | { ok: true; localUrl: string }
  | { ok: false; error: string };

// ─── Ensure sprite cache dir exists ───
let cacheDir: string | null = null;
async function getCacheDir(): Promise<string> {
  if (cacheDir) return cacheDir;
  const base = await appDataDir();
  cacheDir = `${base}pet-sprites/2d`;
  if (!await exists(cacheDir)) {
    await mkdir(cacheDir, { recursive: true });
  }
  return cacheDir;
}

// ─── Fetch with timeout ───
async function fetchWithTimeout(url: string, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Download a single sprite file ───
export async function downloadSprite(
  petId: string,
  ext: 'png' | 'json',
  onProgress?: (phase: string, attempt: number) => void,
): Promise<DownloadResult> {
  const cache = await getCacheDir();
  const filename = `${petId}.${ext}`;
  const localPath = `${cache}/${filename}`;

  // Already cached?
  if (await exists(localPath)) {
    return { ok: true, localUrl: localPath };
  }

  // Build download URLs
  const primaryUrl = `${GITEE_BASE}/${filename}`;
  const urls = FALLBACK_BASE ? [primaryUrl, `${FALLBACK_BASE}/${filename}`] : [primaryUrl];

  // Random delay to spread load
  onProgress?.('delaying', 0);
  await randomDelay();

  // Try each URL with backoff
  for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
    const url = urls[urlIdx];
    for (let attempt = 0; attempt <= 4; attempt++) {
      onProgress?.('downloading', attempt);
      try {
        const res = await fetchWithTimeout(url);
        const buf = await res.arrayBuffer();
        await writeFile(localPath, new Uint8Array(buf));
        return { ok: true, localUrl: localPath };
      } catch (err) {
        const isLastAttempt = attempt === 4 && urlIdx === urls.length - 1;
        if (isLastAttempt) {
          // Clean up partial file
          try { if (await exists(localPath)) { /* keep for debugging */ } } catch {}
          return { ok: false, error: `Download failed after all retries: ${err}` };
        }
        // Wait with backoff before retry
        if (attempt < 4) {
          const wait = backoff(attempt);
          onProgress?.('retrying', attempt + 1);
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
  }

  return { ok: false, error: 'Unexpected download flow' };
}

// ─── Download both PNG + JSON for a pet ───
export async function downloadPetSprites(
  petId: string,
  onProgress?: (phase: string, file: string, attempt: number) => void,
): Promise<{ png: string | null; json: string | null; errors: string[] }> {
  const errors: string[] = [];
  let pngPath: string | null = null;
  let jsonPath: string | null = null;

  // Download in parallel with individual retries
  const [pngResult, jsonResult] = await Promise.all([
    downloadSprite(petId, 'png', (phase, attempt) => onProgress?.(phase, 'png', attempt)),
    downloadSprite(petId, 'json', (phase, attempt) => onProgress?.(phase, 'json', attempt)),
  ]);

  if (pngResult.ok) pngPath = pngResult.localUrl;
  else errors.push(`PNG: ${pngResult.error}`);

  if (jsonResult.ok) jsonPath = jsonResult.localUrl;
  else errors.push(`JSON: ${jsonResult.error}`);

  return { png: pngPath, json: jsonPath, errors };
}

// ─── Get local path for a cached sprite ───
export async function getCachedSpritePath(petId: string, ext: 'png' | 'json'): Promise<string | null> {
  const cache = await getCacheDir();
  const path = `${cache}/${petId}.${ext}`;
  return (await exists(path)) ? path : null;
}

// ─── Clear all cached sprites (for settings/troubleshooting) ───
export async function clearSpriteCache(): Promise<void> {
  const cache = await getCacheDir();
  // We don't have a recursive delete, so just clear known files
  // In practice, individual files can be managed
}
