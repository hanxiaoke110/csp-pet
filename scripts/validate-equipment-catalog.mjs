import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEquipmentModules } from './equipment-catalog-tools.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { validateEquipmentCatalog } = await loadEquipmentModules();
const catalog = JSON.parse(await readFile(resolve(root, 'cloud-assets-source/equipment/catalog.json'), 'utf8'));
const items = validateEquipmentCatalog(catalog);
for (const item of items) {
  const path = new URL(item.icon, 'https://cards.cspstudy.top').pathname;
  await access(resolve(root, path.startsWith('/equipment/') ? 'cloud-assets-source' : 'public', path.slice(1)));
}
console.log(`装备静态目录校验通过：${items.length}件，价格/效果/图片路径均有效。`);
