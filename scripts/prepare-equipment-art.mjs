import sharp from 'sharp';
import { access, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit manifest avoids accidentally copying unrelated generated images.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node scripts/prepare-equipment-art.mjs <manifest.json>');
const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
const seen = new Set();
let total = 0;
for (const { id, source, category } of manifest) {
  const validWeapon = category === 'weapons' && /^(fire|water|light)-weapon-(common|rare|epic|legendary)$/.test(id);
  const validArmor = category === 'armor' && /^(earth|fire|wind|water|light)-armor-(rare|epic|legendary)$/.test(id);
  if ((!validWeapon && !validArmor) || seen.has(id)) {
    throw new Error(`Invalid or duplicate art ID: ${id}`);
  }
  seen.add(id);
  const output = resolve(root, 'public/dungeon-exploration', category, `${id}.webp`);
  try { await access(output); throw new Error(`Refusing to overwrite: ${output}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const meta = await sharp(source).metadata();
  if (!meta.hasAlpha) throw new Error(`Transparent source required: ${id}`);
  await mkdir(dirname(output), { recursive: true });
  await sharp(source).resize(256, 256, { fit: 'contain', background: '#00000000' }).webp({ quality: 88, alphaQuality: 100 }).toFile(output);
  const bytes = (await stat(output)).size;
  if (bytes > 100 * 1024) throw new Error(`Icon exceeds 100 KiB: ${id}`);
  total += bytes;
  console.log(`${id}: ${(bytes / 1024).toFixed(1)} KiB`);
}
console.log(`Total ${seen.size} icons: ${(total / 1024).toFixed(1)} KiB`);
