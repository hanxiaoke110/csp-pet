import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import sharp from 'sharp';
import { sha256, safePath } from './content-release/core.mjs';
import { validateLearningCatalogFiles } from './validate-learning-catalog.mjs';
import { evaluateReleaseGate } from './question-bank/release-gate.mjs';
import { validateQuestion } from './question-bank/lib/validate.mjs';
import { isMainModule } from './content-release/is-main.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOGS = [
  ['collector', 'collector-cards/catalog.json', 'src/data/collectorCards.ts', 'isCollectorCardCatalog'],
  ['wardrobe', 'wardrobe/catalog.json', 'src/data/wardrobeCatalog.ts', 'isWardrobeCatalog'],
  ['wardrobe', 'wardrobe/v2/catalog.json', 'src/data/wardrobeCatalog.ts', 'isWardrobeCatalog'],
  ['accessories', 'partner-accessories/catalog.json', 'src/data/partnerAccessories.ts', 'validateAccessoryCatalog'],
  ['learning', 'course-data/learning-catalog.json'],
];
async function clientValidator(entry, name) {
  const bundle = await build({ configFile: false, root: ROOT, publicDir: false, logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry: path.join(ROOT, entry), formats: ['es'] } } });
  const output = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(c => c.type === 'chunk' && c.isEntry);
  return (await import(`data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`))[name];
}
export function assetPath(reference, catalogPath) {
  // Reject encoded segments before URL normalization can hide traversal.
  if (typeof reference !== 'string' || /[\\%?#\x00-\x1f]/.test(reference)
      || reference.split('/').includes('..')) throw Error(`Unsafe asset reference: ${reference}`);
  const url = new URL(reference, `https://cards.cspstudy.top/${catalogPath}`);
  if (url.origin !== 'https://cards.cspstudy.top') throw Error(`Asset must be locally published: ${reference}`);
  return safePath(url.pathname.slice(1));
}
export async function validatePublicContent({ root = ROOT, assetRoot = null, targets = ['collector', 'wardrobe', 'accessories', 'learning', 'questions'] } = {}) {
  const errors = [], files = {}, catalogs = [], externalReferences = [];
  async function local(name) {
    safePath(name);
    const roots = assetRoot ? [assetRoot] : [path.join(root, 'cloud-assets-source'), path.join(root, 'public')];
    for (const base of roots) {
      const candidate = path.resolve(base, name);
      try {
        const [actual, baseActual] = await Promise.all([realpath(candidate), realpath(base)]);
        if (!actual.startsWith(baseActual + path.sep)) throw Error(`Asset symlink escapes root: ${name}`);
        if (!(await stat(actual)).isFile()) throw Error(`Not a file: ${name}`);
        const bytes = await readFile(actual);
        if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw Error(`Invalid asset size: ${name}`);
        files[name] = { bytes: bytes.length, sha256: sha256(bytes) };
        return bytes;
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    throw Error(`Missing asset: ${name}`);
  }
  async function image(reference, catalogPath, expectedHash) {
    const name = assetPath(reference, catalogPath), bytes = await local(name);
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) throw Error(`Unsupported image type: ${name}`);
    if (ext === 'svg' && /<script\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|data:|javascript:)/i.test(bytes.toString('utf8'))) throw Error(`Active SVG content: ${name}`);
    const meta = await sharp(bytes).metadata();
    if (meta.format !== (ext === 'jpg' ? 'jpeg' : ext) || !meta.width || !meta.height) throw Error(`Image bytes/type mismatch: ${name}`);
    if (expectedHash != null && (!/^[a-f0-9]{64}$/i.test(expectedHash) || sha256(bytes) !== expectedHash)) throw Error(`Asset hash mismatch: ${name}`);
    return bytes.length;
  }
  for (const [target, name, entry, functionName] of CATALOGS.filter(([t]) => targets.includes(t))) {
    try {
      const catalog = JSON.parse(await local(name));
      if (entry && !(await clientValidator(entry, functionName))(catalog)) throw Error('Client schema validator rejected catalog');
      if (target === 'learning') {
        const version = JSON.parse(await local('course-data/learning-catalog.version.json'));
        const failures = validateLearningCatalogFiles(catalog, version);
        for (const lesson of catalog.lessons || []) {
          if (lesson.id !== `lesson-material-p${String(lesson.lessonNo).padStart(3, '0')}`) failures.push(`Course number/id mismatch: ${lesson.id}`);
        }
        if (failures.length) throw Error(failures.join('; '));
      }
      if (name.includes('/v2/') && (catalog.schemaVersion !== 2 || catalog.rendererVersion !== 2)) throw Error('Wardrobe v2 schema/renderer must be 2');
      if (catalog.minRendererVersion != null && (!Number.isInteger(catalog.minRendererVersion) || catalog.minRendererVersion < 1 || catalog.minRendererVersion > 2)) throw Error('Unsupported catalog minimum renderer');
      if (target === 'accessories' && catalog.items.some(i => i.minRendererVersion > catalog.minRendererVersion)) throw Error('Catalog minimum renderer understates item requirement');
      for (const item of catalog.cards || catalog.items || []) {
        const maximum = target === 'accessories' || name.includes('/v2/') ? 2 : 1;
        if (item.minRendererVersion != null && (!Number.isInteger(item.minRendererVersion) || item.minRendererVersion < 1 || item.minRendererVersion > maximum)) throw Error(`Unsupported renderer: ${item.id}`);
        let bytes = 0;
        for (const [layer, reference] of Object.entries(item.assets || {})) {
          if (!item.checksums?.[layer]) throw Error(`Missing asset checksum: ${item.id}/${layer}`);
          bytes += await image(reference, name, item.checksums[layer]);
        }
        if (item.assets && item.assetBytes != null && item.assetBytes !== bytes) throw Error(`Asset byte total mismatch: ${item.id}`);
        if (item.asset) {
          const size = await image(item.asset, name, item.checksum);
          if (item.assetBytes != null && size !== item.assetBytes) throw Error(`Asset byte size mismatch: ${item.id}`);
        }
        if (item.thumbnail) await image(item.thumbnail, name);
      }
      catalogs.push({ target, path: name, version: catalog.version ?? catalog.catalogVersion, count: (catalog.cards || catalog.items || catalog.lessons).length });
    } catch (error) { errors.push(`${name}: ${error.message}`); }
  }
  if (targets.includes('questions')) {
    try {
      const prefix = 'course-data/question-bank-v2/';
      const manifest = JSON.parse(await local(prefix + 'manifest.json')), bankFiles = {};
      for (const [logicalName, entry] of Object.entries(manifest.files)) {
        safePath(entry.path);
        bankFiles[logicalName] = (await local(prefix + entry.path)).toString('utf8');
        if (entry.bytes != null && Buffer.byteLength(bankFiles[logicalName]) !== entry.bytes) throw Error(`Question snapshot byte count mismatch: ${logicalName}`);
        for (const q of JSON.parse(bankFiles[logicalName]).questions || []) {
          const result = validateQuestion(q);
          if (result.blockers.length) errors.push(`questions: ${q.id}: ${result.blockers.join(',')}`);
          for (const asset of q.assets || []) {
            const reference = typeof asset === 'string' ? asset : asset.src;
            if (/^https:\/\//.test(reference) && new URL(reference).origin !== 'https://cards.cspstudy.top') {
              externalReferences.push({ questionId: q.id, url: reference });
            } else await image(reference, prefix + 'manifest.json');
          }
        }
      }
      const result = evaluateReleaseGate({ manifest, files: bankFiles, assetRoot: assetRoot || path.join(root, 'public') });
      if (!result.ready) errors.push(...result.failures.map(f => `questions: ${f}`));
    } catch (error) { errors.push(`questions: ${error.message}`); }
  }
  return { schemaVersion: 1, ready: errors.length === 0, targets, catalogs, files, externalReferences, errors };
}
if (isMainModule(import.meta.url)) {
  const selected = process.argv.find(a => a.startsWith('--targets='))?.slice(10).split(',');
  if (selected?.some(t => !['collector', 'wardrobe', 'accessories', 'learning', 'questions'].includes(t))) throw Error('Unknown validation target');
  const report = await validatePublicContent({ targets: selected });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}
