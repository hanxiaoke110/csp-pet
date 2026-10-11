import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEquipmentModules } from './equipment-catalog-tools.mjs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { validateEquipmentCatalog } = await loadEquipmentModules();
const catalog = JSON.parse(await readFile(resolve(root, 'cloud-assets-source/equipment/catalog.json'), 'utf8'));
const items = validateEquipmentCatalog(catalog);
const bespokeHashes = new Set();
let artBytes = 0;
for (const item of items) {
  const path = new URL(item.icon, 'https://cards.cspstudy.top').pathname;
  const file = resolve(root, path.startsWith('/equipment/') ? 'cloud-assets-source' : 'public', path.slice(1));
  await access(file);
  // Existing assets stay untouched. All newly introduced bundled items need
  // small, transparent, distinct art rather than silently reusing legacy art.
  if (/^(earth|fire|wind|water|light)-(weapon|armor)-/.test(item.id)) {
    const expected = `/dungeon-exploration/${item.category === 'weapon' ? 'weapons' : 'armor'}/${item.id}.webp`;
    if (path !== expected) throw new Error(`专属图标路径不匹配: ${item.id}`);
    const buffer = await readFile(file);
    const meta = await sharp(buffer).metadata();
    if (meta.width !== 256 || meta.height !== 256 || !meta.hasAlpha || buffer.length > 100 * 1024) {
      throw new Error(`图标必须为256px透明WebP且不超过100KiB: ${item.id}`);
    }
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (bespokeHashes.has(hash)) throw new Error(`新装备重复使用同一图片: ${item.id}`);
    bespokeHashes.add(hash);
    artBytes += buffer.length;
  }
}
console.log(`装备静态目录校验通过：${items.length}件，价格/效果/图片路径均有效。`);
console.log(`新增专属图标 ${bespokeHashes.size} 张，合计 ${(artBytes / 1024).toFixed(1)} KiB。`);
