import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(root, 'public/wardrobe/catalog.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

if (!Number.isInteger(catalog.version) || catalog.version < 1 || !Array.isArray(catalog.items)) {
  throw new Error('public/wardrobe/catalog.json 格式错误');
}

const seen = new Set();
for (const item of catalog.items) {
  if (!item.id || seen.has(item.id)) throw new Error(`商品 ID 重复或为空：${item.id || '(empty)'}`);
  seen.add(item.id);
  if (!item.asset || /^https?:/i.test(item.asset)) continue;
  const assetPath = resolve(dirname(catalogPath), item.asset);
  const bytes = await readFile(assetPath);
  item.assetBytes = bytes.byteLength;
  item.checksum = createHash('sha256').update(bytes).digest('hex');
}

catalog.updatedAt = new Date().toISOString();
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`星相衣橱目录已校验：${catalog.items.length} 件商品`);
