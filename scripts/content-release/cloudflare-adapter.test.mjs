import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCloudflareAdapter, activeDeployment } from './cloudflare-adapter.mjs';
import { inventory, prepareRelease, executeRelease } from './core.mjs';

const oldVersion = '11111111-1111-1111-1111-111111111111';
const newVersion = '22222222-2222-2222-2222-222222222222';
async function fixture(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'csp-adapter-test-'));
  const stage = path.join(directory, 'stage'), lockDirectory = path.join(directory, 'lock'), stateDirectory = path.join(directory, 'state');
  await mkdir(path.join(stage, 'collector-cards'), { recursive: true });
  await writeFile(path.join(stage, 'collector-cards/catalog.json'), 'old');
  await writeFile(path.join(stage, '_headers'), '/*\n  Cache-Control: no-cache\n');
  let version = oldVersion, deploymentId = 'deployment-old', live = Buffer.from('old');
  let drift = false, writes = 0;
  const runner = async (args, options) => {
    if (args[0] === 'deployments') return JSON.stringify([{ id: deploymentId, created_on: '2026-11-02T00:00:00Z', versions: [{ version_id: version, percentage: 100 }] }]);
    if (args[1] === 'view') return JSON.stringify({ resources: { script_runtime: { assets: { raw_headers: '/*\n  Cache-Control: no-cache\n' } } } });
    if (args[1] === 'upload') {
      writes++; if (drift) deploymentId = 'manual-deployment';
      await writeFile(options.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: 'version-upload', worker_name: 'csp-card-assets', version_id: newVersion }));
      const assets = args[args.indexOf('--assets') + 1]; live = await readFile(path.join(assets, 'collector-cards/catalog.json')); return '';
    }
    if (args[1] === 'deploy') { writes++; version = newVersion; deploymentId = 'deployment-new'; return ''; }
    throw Error('Unexpected runner command');
  };
  const adapter = createCloudflareAdapter({ stage, baselineRevision: `deployment-old:${oldVersion}`, stateDirectory, lockDirectory, runner,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => live }) });
  try { await callback({ adapter, stage, lockDirectory, stateDirectory, runner, drift: () => { drift = true; }, writes: () => writes }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
describe('production Cloudflare cooperative adapter (no real network or deploy)', () => {
  it('uploads candidate then activates under lock, persists stage and verifies receipt', async () => fixture(async f => {
    const baseline = await f.adapter.snapshot('csp-card-assets');
    const bundle = prepareRelease({ targets: ['collector'], baseline, changes: { 'collector-cards/catalog.json': Buffer.from('new') }, expected: inventory(baseline.files), validation: { ready: true } });
    const receipt = await executeRelease(bundle, { adapter: f.adapter, deploy: true });
    expect(receipt.verified).toBe(true); expect(f.writes()).toBe(2);
    expect(JSON.parse(await readFile(path.join(f.stateDirectory, 'current.json'), 'utf8')).revision).toContain('deployment-new');
    await expect(readFile(path.join(f.lockDirectory, 'owner.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  }));
  it('rejects active-version drift after upload without activation', async () => fixture(async f => {
    const baseline = await f.adapter.snapshot('csp-card-assets');
    const bundle = prepareRelease({ targets: ['collector'], baseline, changes: { 'collector-cards/catalog.json': Buffer.from('new') }, expected: inventory(baseline.files), validation: { ready: true } });
    f.drift();
    await expect(executeRelease(bundle, { adapter: f.adapter, deploy: true })).rejects.toThrow('after upload');
    expect(f.writes()).toBe(1);
  }));
  it('rejects a held lock and does not steal it', async () => fixture(async f => {
    await mkdir(f.lockDirectory); await writeFile(path.join(f.lockDirectory, 'owner.json'), 'other-owner');
    await expect(f.adapter.withLock(async () => {})).rejects.toThrow('already held');
    expect(await readFile(path.join(f.lockDirectory, 'owner.json'), 'utf8')).toBe('other-owner');
  }));
  it('rejects workshop and refuses unlocked activation', async () => fixture(async f => {
    await expect(f.adapter.snapshot('csp-workshop-assets')).rejects.toThrow('only supports');
    await expect(f.adapter.guardedPublish({ worker: 'csp-card-assets' })).rejects.toThrow('requires');
    expect(f.writes()).toBe(0);
  }));
  it('refuses relabeling an incomplete or stale baseline snapshot', async () => fixture(async f => {
    const other = createCloudflareAdapter({ stage: f.stage, baselineRevision: 'old-revision',
      stateDirectory: f.stateDirectory, lockDirectory: f.lockDirectory, runner: f.runner,
      fetcher: async () => { throw Error('must not reach asset fetch'); } });
    await expect(other.snapshot('csp-card-assets')).rejects.toThrow('Saved full stage revision is stale');
    expect(f.writes()).toBe(0);
  }));
  it('rejects stale online bytes without uploading', async () => fixture(async f => {
    const other = createCloudflareAdapter({ stage: f.stage, baselineRevision: `deployment-old:${oldVersion}`,
      stateDirectory: f.stateDirectory, lockDirectory: f.lockDirectory, runner: f.runner,
      fetcher: async () => ({ ok: true, arrayBuffer: async () => Buffer.from('different') }) });
    await expect(other.snapshot('csp-card-assets')).rejects.toThrow('Live stage is stale');
    expect(f.writes()).toBe(0);
  }));
  it('refuses gradual deployments', () => {
    expect(() => activeDeployment(JSON.stringify([{ id: 'x', created_on: '2026', versions: [{ version_id: oldVersion, percentage: 50 }, { version_id: newVersion, percentage: 50 }] }]))).toThrow('gradual');
  });
});
