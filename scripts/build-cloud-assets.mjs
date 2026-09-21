import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.cloudflare-static');
const sources = ['collector-cards', 'wardrobe', 'profile', 'course-data'];
const workshopApi = (process.env.WORKSHOP_STATIC_API || 'https://api.cspstudy.top').replace(/\/$/, '');
const maxStaticAssetBytes = 25 * 1024 * 1024;

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const name of sources) {
  await cp(resolve(root, 'public', name), resolve(output, name), { recursive: true });
  await rm(resolve(output, name, '.DS_Store'), { force: true });
}

// The v1.7.48 desktop bundle no longer ships the retired course catalog. Keep
// its cloud copy for one compatibility cycle so clients that have not upgraded
// continue to work. A later maintenance deploy can opt in to final retirement.
if (process.env.RETIRE_COURSE_ASSETS === '1') {
  for (const retiredPath of [
    'course-card-index.json', 'lessons.json', 'stages.json', 'quiz-bank.json',
    'unified-quiz-bank.json', 'unified-quiz-bank.backup-1783601740325.json', 'version.json',
  ]) {
    await rm(resolve(output, 'course-data', retiredPath), { force: true });
  }
}

const interactiveAvatarSource = resolve(root, 'cloud-assets-source', 'profile', 'avatars-interactive');
const interactiveAvatarOutput = resolve(output, 'profile', 'avatars-interactive');
const interactiveAvatarManifest = [];
for (const group of ['zodiac', 'constellation']) {
  const groupSource = resolve(interactiveAvatarSource, group);
  const groupOutput = resolve(interactiveAvatarOutput, group);
  await mkdir(groupOutput, { recursive: true });
  for (const filename of await readdir(groupSource)) {
    if (!filename.endsWith('-atlas.png')) continue;
    const slug = filename.replace(/-atlas\.png$/, '');
    const target = resolve(groupOutput, `${slug}-atlas.webp`);
    await sharp(resolve(groupSource, filename))
      .resize(900, 900, { fit: 'fill' })
      .webp({ quality: 74, alphaQuality: 92, effort: 6 })
      .toFile(target);
    const bytes = await readFile(target);
    interactiveAvatarManifest.push({
      id: `avatar-${group}-${slug}`,
      group,
      slug,
      version: 2,
      atlas: `./${group}/${slug}-atlas.webp`,
      columns: 5,
      rows: 5,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
}
await writeFile(resolve(interactiveAvatarOutput, 'catalog.json'), `${JSON.stringify({
  version: 2,
  updatedAt: new Date().toISOString(),
  count: interactiveAvatarManifest.length,
  items: interactiveAvatarManifest,
}, null, 2)}\n`);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`);
  return response.json();
}

async function fetchAllWorkshopPets() {
  const pets = [];
  let cursor = '';
  do {
    const params = new URLSearchParams({ limit: '100', paginated: '1' });
    if (cursor) params.set('cursor', cursor);
    const page = await fetchJson(`${workshopApi}/api/workshop/pets?${params}`);
    pets.push(...(Array.isArray(page) ? page : page.items || []));
    cursor = !Array.isArray(page) && page.hasMore ? page.nextCursor || '' : '';
  } while (cursor);
  return pets;
}

function workshopImageUrl(value) {
  if (/^https?:/i.test(value || '')) return value;
  if (String(value || '').startsWith('/api/')) return `${workshopApi}${value}`;
  return `${workshopApi}/api/workshop/image?key=${encodeURIComponent(value || '')}`;
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`素材请求失败 ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxStaticAssetBytes) throw new Error(`素材大小异常: ${url}`);
  return bytes;
}

const workshopPets = await fetchAllWorkshopPets();
const workshopOutput = resolve(output, 'workshop', 'pets');
await mkdir(workshopOutput, { recursive: true });

const publishedPets = [];
for (let start = 0; start < workshopPets.length; start += 6) {
  const batch = workshopPets.slice(start, start + 6);
  const results = await Promise.all(batch.map(async pet => {
    if (!/^ws-[A-Z0-9]{6,20}$/.test(pet.id || '') || !pet.spritesheet_url) return null;
    const directory = resolve(workshopOutput, pet.id);
    await mkdir(directory, { recursive: true });
    const spritesheet = await fetchBytes(workshopImageUrl(pet.spritesheet_url));
    await writeFile(resolve(directory, 'spritesheet.png'), spritesheet);

    let metadata = {};
    try { metadata = JSON.parse(pet.pet_json || '{}'); } catch {}
    const frameWidth = Math.max(1, Math.min(1024, Number(metadata.frameWidth) || 192));
    const frameHeight = Math.max(1, Math.min(1024, Number(metadata.frameHeight) || 208));
    try {
      await sharp(spritesheet)
        .extract({ left: 0, top: 0, width: frameWidth, height: frameHeight })
        .resize(240, 260, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 82, alphaQuality: 90, effort: 5 })
        .toFile(resolve(directory, 'thumbnail.webp'));
    } catch {
      const thumbnail = pet.thumbnail_url
        ? await fetchBytes(workshopImageUrl(pet.thumbnail_url))
        : spritesheet;
      await sharp(thumbnail).resize(240, 260, { fit: 'contain' }).webp({ quality: 82 }).toFile(resolve(directory, 'thumbnail.webp'));
    }

    return {
      id: pet.id,
      name: pet.name,
      element: pet.element,
      style: pet.style || '',
      description: pet.description || '',
      tier: pet.tier || 'common',
      price: Number(pet.price) || 200,
      teacher_name: pet.teacher_name || '',
      pet_json: pet.pet_json || '{}',
      spritesheet_url: pet.spritesheet_url,
      thumbnail_url: pet.thumbnail_url || pet.spritesheet_url,
      spritesheet_static_url: `./pets/${pet.id}/spritesheet.png`,
      thumbnail_static_url: `./pets/${pet.id}/thumbnail.webp`,
      spritesheet_bytes: spritesheet.byteLength,
      spritesheet_sha256: createHash('sha256').update(spritesheet).digest('hex'),
    };
  }));
  publishedPets.push(...results.filter(Boolean));
}

await mkdir(resolve(output, 'workshop'), { recursive: true });
await writeFile(resolve(output, 'workshop', 'catalog.json'), `${JSON.stringify({
  version: 1,
  updatedAt: new Date().toISOString(),
  count: publishedPets.length,
  items: publishedPets,
}, null, 2)}\n`);

for (const catalogPath of ['collector-cards/catalog.json', 'wardrobe/catalog.json']) {
  JSON.parse(await readFile(resolve(output, catalogPath), 'utf8'));
}
for (const coursePath of ['course-data/question-bank-v2/manifest.json', 'course-data/knowledge-points.json', 'course-data/knowledge-lectures.json']) {
  JSON.parse(await readFile(resolve(output, coursePath), 'utf8'));
}

await writeFile(resolve(output, '_headers'), `
/*
  Access-Control-Allow-Origin: *

/collector-cards/*
  Cache-Control: public, max-age=300, must-revalidate

/wardrobe/*
  Cache-Control: public, max-age=300, must-revalidate

/profile/*
  Cache-Control: public, max-age=300, must-revalidate

/workshop/*
  Cache-Control: public, max-age=300, must-revalidate

/course-data/*
  Cache-Control: public, max-age=300, must-revalidate
`.trimStart());

await writeFile(resolve(output, 'index.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>星辉典藏素材站</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06152c;color:#dff7ff;font:16px system-ui}.card{padding:32px;border:1px solid #45cbed55;border-radius:24px;background:#0c2344;box-shadow:0 24px 80px #0008;text-align:center}b{color:#76e8ff;font-size:24px}</style>
<div class="card"><b>星辉典藏素材站</b><p>典藏卡与星相衣橱的云端素材服务正常运行。</p></div></html>`);

let total = 0;
let files = 0;
async function measure(path) {
  const info = await stat(path);
  if (info.isFile()) {
    if (info.size > maxStaticAssetBytes) throw new Error(`单文件超过 Cloudflare 25 MiB 限制：${path}`);
    total += info.size;
    files++;
    return;
  }
  for (const entry of await readdir(path)) await measure(resolve(path, entry));
}
await measure(output);

console.log(`Cloudflare 静态素材目录已生成：${files} 个文件，${(total / 1024 / 1024).toFixed(1)} MiB，${publishedPets.length} 只工坊智子`);
