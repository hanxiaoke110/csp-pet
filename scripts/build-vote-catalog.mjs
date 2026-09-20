import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const API = process.env.VOTE_CATALOG_API || 'https://api.cspstudy.top';
const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'vote-app', 'assets', 'pets');
const cardSource = path.join(root, 'design', 'holo-card-demo-astra', 'astra-collector-card.webp');
const cardOutput = path.join(root, 'vote-app', 'assets', 'astra-collector-card.webp');

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`);
  return response.json();
}

async function loadAllPets() {
  const pets = [];
  let cursor = '';
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const page = await fetchJson(`${API}/api/workshop/pets?${query}`);
    pets.push(...(page.items || page));
    cursor = page.hasMore ? page.nextCursor || '' : '';
  } while (cursor);
  return pets.filter(pet => pet.status === 'active');
}

function imageUrl(pet) {
  const value = pet.thumbnail_url || pet.spritesheet_url || '';
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith('/api/')) return `${API}${value}`;
  return `${API}/api/workshop/image?key=${encodeURIComponent(value)}`;
}

async function buildThumbnail(pet) {
  const response = await fetch(imageUrl(pet));
  if (!response.ok) throw new Error(`${pet.name}: 图片请求失败 ${response.status}`);
  const input = Buffer.from(await response.arrayBuffer());
  await sharp(input)
    .resize(320, 320, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 78, alphaQuality: 85, effort: 5 })
    .toFile(path.join(outputDir, `${pet.id}.webp`));
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const pets = await loadAllPets();
const failures = [];

for (let index = 0; index < pets.length; index += 6) {
  const batch = pets.slice(index, index + 6);
  await Promise.all(batch.map(async pet => {
    try { await buildThumbnail(pet); }
    catch (error) { failures.push({ id: pet.id, name: pet.name, error: error.message }); }
  }));
}

const catalog = pets
  .filter(pet => !failures.some(failure => failure.id === pet.id))
  .map(pet => ({
    id: pet.id,
    name: pet.name,
    element: pet.element || 'unknown',
    tier: pet.tier || 'common',
    description: pet.description || '',
    image: `./assets/pets/${pet.id}.webp`,
  }));

await mkdir(path.join(root, 'vote-app', 'assets'), { recursive: true });
await writeFile(path.join(root, 'vote-app', 'catalog.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: catalog.length,
  pets: catalog,
}, null, 2) + '\n');
await writeFile(path.join(root, 'vote-app', 'catalog-report.json'), JSON.stringify({
  sourceCount: pets.length,
  outputCount: catalog.length,
  failures,
}, null, 2) + '\n');
await writeFile(cardOutput, await readFile(cardSource));

console.log(`投票候选目录已生成：${catalog.length}/${pets.length} 只智子`);
if (failures.length) {
  console.warn(`有 ${failures.length} 张缩略图失败，详见 vote-app/catalog-report.json`);
  process.exitCode = 1;
}
