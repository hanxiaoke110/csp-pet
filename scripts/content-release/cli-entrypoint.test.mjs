import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainModule } from './is-main.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'csp-cli-alias-')); temporary.push(directory);
  const alias = path.join(directory, 'aliased-project');
  await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  return { directory, alias };
}
const run = args => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });

it('runs the validation CLI through a symlink spelling and produces an actual report', async () => {
  const { alias } = await fixture();
  const result = run([path.join(alias, 'scripts/validate-public-content.mjs'), '--targets=accessories']);
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.ready).toBe(true);
  expect(report.catalogs).toHaveLength(1);
  expect(report.catalogs[0].target).toBe('accessories');
});
it('runs publication inventory and rejects invalid CLI arguments through the same alias', async () => {
  const { alias, directory } = await fixture();
  const baseline = path.join(directory, 'baseline'), output = path.join(directory, 'inventory.json');
  await mkdir(baseline); await writeFile(path.join(baseline, 'catalog.json'), '{}');
  const script = path.join(alias, 'scripts/content-release.mjs');
  const result = run([script, 'inventory', '--baseline', baseline, '--revision', 'test-r1', '--out', output]);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(output, 'utf8'))).toMatchObject({ revision: 'test-r1', files: { 'catalog.json': { bytes: 2 } } });
  const invalid = run([script, 'apply']);
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain('--baseline required');
});
it('importing either CLI does not accidentally execute main', async () => {
  const { alias } = await fixture();
  for (const name of ['validate-public-content.mjs', 'content-release.mjs']) {
    const url = pathToFileURL(path.join(alias, 'scripts', name)).href;
    const result = run(['--input-type=module', '--eval', `await import(${JSON.stringify(url)}); console.log('imported');`]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('imported');
  }
  expect(isMainModule(import.meta.url, undefined)).toBe(false);
  expect(isMainModule(import.meta.url, '/no/such/file.mjs')).toBe(false);
});
