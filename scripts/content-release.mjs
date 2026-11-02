import { readFile, writeFile, readdir, mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { prepareRelease, executeRelease, inventory, safePath, assertCatalogVersions } from './content-release/core.mjs';
import { validatePublicContent } from './validate-public-content.mjs';
import { isMainModule } from './content-release/is-main.mjs';

export async function readTree(directory, prefix = '') {
  const files = {};
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = safePath(prefix + entry.name);
    if (entry.isSymbolicLink()) throw Error(`Symlink refused: ${name}`);
    if (entry.isDirectory()) Object.assign(files, await readTree(directory, name + '/'));
    else if (entry.isFile()) files[name] = await readFile(path.join(directory, name));
  }
  return files;
}
async function main() {
  const args = process.argv.slice(2), command = args.shift();
  const flag = name => args.includes(`--${name}`);
  const value = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1]; };
  const required = name => { const v = value(name); if (!v || v.startsWith('--')) throw Error(`--${name} required`); return v; };
  const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
  let adapter;
  if (value('adapter')) adapter = (await import(pathToFileURL(path.resolve(value('adapter'))))).default;
  else {
    const baseline = required('baseline'), revision = required('revision');
    adapter = { snapshot: async () => ({ revision, files: await readTree(baseline) }) };
  }
  if (flag('deploy') && !value('adapter')) throw Error('--deploy requires an explicit atomic deployment adapter');
  if (command === 'inventory') {
    const snapshot = await adapter.snapshot('csp-card-assets');
    await writeFile(required('out'), JSON.stringify({ revision: snapshot.revision, files: inventory(snapshot.files) }, null, 2) + '\n', { flag: 'wx' });
    return;
  }
  if (command === 'prepare') {
    if (flag('deploy')) throw Error('Prepare is local only; review bundle before apply --deploy');
    const baseline = await adapter.snapshot('csp-card-assets');
    const expected = await json(required('expected'));
    if (baseline.revision !== expected.revision) throw Error('Expected revision is stale');
    const changes = await readTree(required('changes'));
    assertCatalogVersions(baseline.files, changes);
    const targets = required('targets').split(',');
    // Validate the effective live snapshot, never rebuild from repository defaults.
    const stage = await mkdtemp(path.join(os.tmpdir(), 'csp-content-review-'));
    try {
      for (const [name, bytes] of Object.entries({ ...baseline.files, ...changes })) {
        safePath(name);
        await mkdir(path.dirname(path.join(stage, name)), { recursive: true });
        await writeFile(path.join(stage, name), bytes);
      }
      const validation = await validatePublicContent({ assetRoot: stage, targets });
      if (!validation.ready) throw Error(validation.errors.join('\n'));
      const bundle = prepareRelease({ targets, baseline, changes, expected: expected.files, validation });
      await writeFile(required('out'), JSON.stringify(bundle, null, 2) + '\n', { flag: 'wx' });
      console.log(JSON.stringify({ prepared: true, targets, changes: Object.keys(changes), validation: validation.catalogs }));
    } finally { await rm(stage, { recursive: true, force: true }); }
    return;
  }
  if (!['apply', 'rollback'].includes(command)) throw Error('Commands: inventory, prepare, apply, rollback');
  const bundle = await json(required('bundle'));
  const receipt = command === 'rollback' ? await json(required('receipt')) : null;
  const output = flag('deploy') ? required('out') : null;
  if (output) await writeFile(output, JSON.stringify({ pending: true, command }) + '\n', { flag: 'wx' });
  const result = await executeRelease(bundle, { adapter, deploy: flag('deploy'), rollback: command === 'rollback', receipt,
    onPublished: publication => writeFile(output, JSON.stringify(publication, null, 2) + '\n') });
  if (output) await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
if (isMainModule(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
