import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bundle the actual client validator, avoiding a second drift-prone copy of the rules.
export async function loadEquipmentModules() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const bundle = await build({ configFile: false, root, publicDir: false, logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry: resolve(root, 'src-dungeon/services/equipmentCatalogService.ts'), formats: ['es'] } } });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  const chunk = result.output.find(entry => entry.type === 'chunk' && entry.isEntry);
  return import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
}
