// Additive publication only: never rebuild or roll back other live catalogs.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const hash = b => createHash('sha256').update(b).digest('hex');
const base = 'https://cards.cspstudy.top/';
const remote = async name => {
  const r = await fetch(`${base}${name}?releaseCheck=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
  assert(r.ok, `${name}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer());
};
const protectedPaths = ['collector-cards/catalog.json', 'wardrobe/catalog.json', 'course-data/learning-catalog.json', 'equipment/catalog.json'];
const verify = process.argv.includes('--verify-online');
await mkdir('.tmp/v1752', { recursive: true });
const baseline = verify ? JSON.parse(await readFile('.tmp/v1752/assets-baseline.json', 'utf8')) : {};
for (const name of protectedPaths) {
  const online = await remote(name);
  if (verify) assert.equal(hash(online), baseline[name], `${name}: protected catalog changed`);
  else {
    const local = await readFile(`.cloudflare-static/${name}`);
    assert.equal(hash(online), hash(local), `${name}: staging differs from live; do not overwrite`);
    baseline[name] = hash(online);
  }
}
const portraits = JSON.parse(await readFile('cloud-assets-source/battle-portraits/catalog.json', 'utf8'));
const files = new Map();
for (const portrait of portraits.portraits) files.set(new URL(portrait.url).pathname.slice(1), portrait);
for (const [name, p] of files) {
  const bytes = verify ? await remote(name) : await readFile(`cloud-assets-source/${name}`);
  assert.equal(bytes.length, p.bytes); assert.equal(hash(bytes), p.sha256);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, p.width); assert.equal(metadata.height, p.height);
}
for (const name of ['battle-portraits/catalog.json', 'partner-accessories/catalog.json']) {
  const source = await readFile(`cloud-assets-source/${name}`);
  if (verify) assert.equal(hash(await remote(name)), hash(source), `${name}: catalog mismatch`);
}
if (!verify) {
  await writeFile('.tmp/v1752/assets-baseline.json', JSON.stringify(baseline, null, 2));
  for (const folder of ['battle-portraits', 'partner-accessories']) await cp(`cloud-assets-source/${folder}`, `.cloudflare-static/${folder}`, { recursive: true });
}
console.log(JSON.stringify({ mode: verify ? 'online-verified' : 'additive-staging-ready', protectedCatalogs: protectedPaths.length, portraitFiles: files.size, portraitAliases: portraits.portraits.length, cosmetics: 6 }));
