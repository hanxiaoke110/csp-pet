import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const API = 'https://api.cspstudy.top';
export const CATALOG = 'https://cards.cspstudy.top/workshop/catalog.json';
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 62_000_000;
const HEADERS = '/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n\n/workshop/catalog.json\n  Cache-Control: public, max-age=60, must-revalidate\n\n/workshop/pets/*\n  Cache-Control: public, max-age=31536000, immutable\n';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const stable = value => JSON.stringify(canonical(value));

export function imageKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) fail('Invalid image key');
  if (value.startsWith('/') || /^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    const url = new URL(value, API);
    if (url.origin !== API || url.username || url.password || url.hash || url.pathname !== '/api/workshop/image' || [...url.searchParams.keys()].length !== 1 || !url.searchParams.has('key')) fail('Untrusted image URL');
    value = url.searchParams.get('key');
    if (!value || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) fail('Invalid image key');
  } else if (/^(?:https?:|data:|file:|javascript:)/i.test(value)) fail('Untrusted image URL');
  return value;
}

export function normalizeSourceRecord(record) {
  if (!object(record) || !/^ws-[A-Z0-9]{6,20}$/.test(record.id || '')) fail('Invalid workshop ID');
  if (!['earth', 'fire', 'wind', 'water', 'light'].includes(record.element) || !['common', 'rare', 'legendary'].includes(record.tier || 'common')) fail('Invalid workshop element/tier');
  if (record.price != null && !['number', 'string'].includes(typeof record.price)) fail('Invalid workshop price');
  if (typeof record.price === 'string' && !/^\d+$/.test(record.price)) fail('Invalid workshop price');
  const price = Number(record.price ?? 200);
  if (!integer(price, 0, Number.MAX_SAFE_INTEGER)) fail('Invalid workshop price');
  let meta;
  try { meta = JSON.parse(record.pet_json); } catch { fail('Invalid pet_json'); }
  if (!object(meta) || !integer(meta.frameWidth, 1, 8192) || !integer(meta.frameHeight, 1, 8192) || (meta.maxFrames !== undefined && !integer(meta.maxFrames, 1, 8192)) || !object(meta.anims) || !Object.keys(meta.anims).length) fail('Invalid frame metadata');
  for (const count of Object.values(meta.anims)) {
    if (Array.isArray(count) ? count.length !== 2 || !integer(count[0], 0, 8191) || !integer(count[1], 1, meta.maxFrames ?? 8192) : !integer(count, 1, meta.maxFrames ?? 8192)) fail('Invalid animation frame count');
  }
  // Repository generators list every sheet row even when some frame counts
  // are omitted; the client safely supplies defaults for those sparse entries.
  for (const key of ['animOrder', 'animsOrder']) if (meta[key] !== undefined && (!Array.isArray(meta[key]) || !meta[key].length || meta[key].some(name => typeof name !== 'string' || !name.trim()))) fail('Invalid animation order');
  if (meta.durations !== undefined && (!object(meta.durations) || Object.values(meta.durations).some(n => !integer(n, 1, 3_600_000)))) fail('Invalid animation duration');
  const result = { id: record.id, element: record.element, tier: record.tier || 'common', price, pet_json: stable(meta), spritesheet_url: imageKey(record.spritesheet_url), thumbnail_url: imageKey(record.thumbnail_url || record.spritesheet_url) };
  for (const field of ['name', 'style', 'description', 'teacher_name']) {
    if (record[field] !== undefined && typeof record[field] !== 'string') fail(`Invalid ${field}`);
    result[field] = record[field] || '';
  }
  if (!result.name.trim()) fail('Missing workshop name');
  return result;
}
export const publicationFingerprint = record => hash(stable(normalizeSourceRecord(record)));
export const sourceFingerprint = records => hash(stable(records.map(normalizeSourceRecord).sort((a, b) => a.id.localeCompare(b.id))));

async function request(fetchFn, url) {
  const response = await fetchFn(url, { redirect: 'error', signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  if (!response.ok) fail(`Request failed (${response.status}): ${url}`);
  return response;
}
async function bytes(fetchFn, url, limit = MAX_BYTES) {
  const response = await request(fetchFn, url);
  if (Number(response.headers.get('content-length')) > limit) fail('Image size too large');
  const chunks = []; let length = 0;
  if (!response.body) fail('Empty response body');
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); fail('Image size too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!length) fail('Empty image');
  return Buffer.concat(chunks);
}
async function json(fetchFn, url) { return JSON.parse((await bytes(fetchFn, url, 32 * 1024 * 1024)).toString()); }

export async function fetchSource(fetchFn = fetch) {
  const records = [], ids = new Set(), cursors = new Set(); let cursor = '';
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const params = new URLSearchParams({ limit: '100', paginated: '1' });
    if (cursor) params.set('cursor', cursor);
    const page = await json(fetchFn, `${API}/api/workshop/pets?${params}`);
    if (!object(page) || !Array.isArray(page.items) || typeof page.hasMore !== 'boolean' || page.items.length > 100) fail('Invalid pagination page');
    for (const raw of page.items) {
      const record = normalizeSourceRecord(raw);
      if (ids.has(record.id)) fail('Duplicate workshop ID');
      ids.add(record.id); records.push(record);
    }
    if (!page.hasMore) return records.sort((a, b) => a.id.localeCompare(b.id));
    cursor = page.nextCursor;
    if (typeof cursor !== 'string' || !cursor || cursor.length > 2048 || cursors.has(cursor) || /[\x00-\x1f]/.test(cursor)) fail('Invalid/repeated pagination cursor');
    cursors.add(cursor);
  }
  fail('Pagination page limit exceeded');
}

export async function readPublished(fetchFn = fetch) {
  const response = await fetchFn(CATALOG, { redirect: 'error', signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) fail(`Published catalog unavailable (${response.status})`);
  const catalog = await response.json();
  if (!object(catalog) || !Array.isArray(catalog.items) || !integer(catalog.count, 0, 10000) || catalog.count !== catalog.items.length) fail('Invalid published catalog');
  return catalog;
}
function assetUrl(item, field) {
  const path = item[field];
  if (typeof path !== 'string' || !new RegExp(`^\\./pets/${item.id}/[a-f0-9]{64}\\.(png|webp)$`).test(path)) fail('Invalid published asset path');
  return new URL(path, CATALOG).href;
}
export function validateGeometry(meta, width, height) {
  const columns = Math.floor(width / meta.frameWidth), rows = Math.floor(height / meta.frameHeight);
  if (columns < 1 || rows < 1) fail('Frame exceeds actual image geometry');
  if (meta.maxFrames !== undefined && meta.maxFrames > columns) fail('maxFrames exceeds actual image columns');
  // Match the client conventions: explicit order, historic misspelling, then
  // standard seven/nine-row names. Legacy [row, count] carries its own row.
  const declared = meta.animOrder || meta.animsOrder || [];
  const defaults = rows === 9
    ? ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review']
    : ['idle', 'walk', 'sleep', 'celebrate', 'think', 'eat', 'unhappy'];
  for (const [name, value] of Object.entries(meta.anims)) {
    const count = Array.isArray(value) ? value[1] : value;
    let row = Array.isArray(value) ? value[0] : declared.indexOf(name);
    if (row < 0) row = defaults.indexOf(name);
    if (row < 0) row = Object.keys(meta.anims).indexOf(name);
    if (row >= rows) fail(`Animation ${name} exceeds actual image rows`);
    if (count > columns) fail(`Animation ${name} exceeds actual image columns`);
  }
}

export async function buildPublication({ fetchFn = fetch, outputRoot = '.workshop-static', allowLargeDelete = false, published } = {}) {
  const records = await fetchSource(fetchFn), fingerprint = sourceFingerprint(records);
  published ??= await readPublished(fetchFn);
  const previous = published?.count || 0;
  if (!allowLargeDelete && previous - records.length > Math.max(10, previous * 0.5)) fail('Unexpected large deletion; inspect source and use --allow-large-delete');
  const { default: sharp } = await import('sharp');
  const directory = resolve(outputRoot, 'workshop'), items = [];
  for (const record of records) {
    // KV keys from historical uploads may be mutable: metadata/cache hashes
    // cannot prove that source bytes still match, so every build reads source.
    const sprite = await bytes(fetchFn, `${API}/api/workshop/image?key=${encodeURIComponent(record.spritesheet_url)}`);
    const image = sharp(sprite, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
    const metadata = await image.metadata(), meta = JSON.parse(record.pet_json);
    if (!['png', 'webp'].includes(metadata.format) || !integer(metadata.width, 1, 8192) || !integer(metadata.height, 1, 8192) || metadata.width * metadata.height > MAX_PIXELS || (metadata.pages || 1) !== 1) fail('Invalid image format/dimensions');
    validateGeometry(meta, metadata.width, metadata.height);
    // Decode the complete sheet too: metadata alone does not detect truncated PNG data.
    await image.clone().raw().toBuffer();
    const thumbnail = await image.extract({ left: 0, top: 0, width: meta.frameWidth, height: meta.frameHeight }).resize(240, 260, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
    const spritesheet_sha256 = hash(sprite), thumbnail_sha256 = hash(thumbnail);
    const spritesheet_static_url = `./pets/${record.id}/${spritesheet_sha256}.${metadata.format === 'png' ? 'png' : 'webp'}`;
    const thumbnail_static_url = `./pets/${record.id}/${thumbnail_sha256}.webp`;
    for (const [path, data] of [[spritesheet_static_url, sprite], [thumbnail_static_url, thumbnail]]) {
      const target = resolve(directory, path); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, data);
    }
    items.push({ ...record, source_record: { ...record }, publicationFingerprint: publicationFingerprint(record), spritesheet_static_url, thumbnail_static_url, spritesheet_bytes: sprite.length, spritesheet_sha256, thumbnail_sha256 });
  }
  if (sourceFingerprint(await fetchSource(fetchFn)) !== fingerprint) fail('Workshop source changed during build; retry publication');
  const manifest = { version: 2, updatedAt: new Date().toISOString(), sourceFingerprint: fingerprint, count: items.length, items };
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(outputRoot, '_headers'), HEADERS);
  await writeFile(resolve(directory, 'catalog.json.tmp'), `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(resolve(directory, 'catalog.json.tmp'), resolve(directory, 'catalog.json'));
  return manifest;
}

export async function verifyPublication({ fetchFn = fetch, manifest } = {}) {
  const online = await readPublished(fetchFn);
  if (online?.version !== 2 || online.sourceFingerprint !== manifest.sourceFingerprint || stable(online.items) !== stable(manifest.items) || online.count !== manifest.count) fail('Published manifest does not match local source');
  for (const item of manifest.items) for (const [field, hashField] of [['spritesheet_static_url', 'spritesheet_sha256'], ['thumbnail_static_url', 'thumbnail_sha256']]) {
    if (hash(await bytes(fetchFn, assetUrl(item, field))) !== item[hashField]) fail(`Published asset hash mismatch: ${item.id}/${field}`);
  }
}
