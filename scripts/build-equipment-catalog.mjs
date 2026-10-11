import { writeFile } from 'node:fs/promises';
import { loadEquipmentModules } from './equipment-catalog-tools.mjs';
const { BUNDLED_EQUIPMENT, validateEquipmentCatalog } = await loadEquipmentModules();
const catalog = { version: 1, items: Object.values(BUNDLED_EQUIPMENT).filter(item => item.shopAvailable) };
validateEquipmentCatalog(catalog);
await writeFile(new URL('../cloud-assets-source/equipment/catalog.json', import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`生成 ${catalog.items.length} 件固定装备；后续发布请编辑在线目录，不要重新运行本生成器覆盖已调整的价格。`);
