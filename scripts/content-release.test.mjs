import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { prepareRelease, executeRelease, inventory, safePath, sha256, assertCatalogVersions } from './content-release/core.mjs';
import { assetPath, validatePublicContent } from './validate-public-content.mjs';

const validation = { ready: true };
function fixture() {
  let state = { revision: 'r1', files: { 'collector-cards/catalog.json': Buffer.from('old'), 'partner-accessories/catalog.json': Buffer.from('live18'), 'course-data/learning-catalog.json': Buffer.from('live100') } };
  let calls = 0;
  const adapter = {
    snapshot: async () => structuredClone(state),
    compareAndSwap: async plan => {
      calls++;
      if (plan.expectedRevision !== state.revision) throw Error('CAS conflict');
      state = { revision: `r${calls + 1}`, files: plan.files }; return { revision: state.revision };
    },
  };
  const bundle = prepareRelease({ targets: ['collector'], baseline: state, changes: { 'collector-cards/catalog.json': Buffer.from('new'), 'collector-cards/new.webp': Buffer.from('art') }, expected: inventory(state.files), validation });
  return { adapter, bundle, state: () => state, mutate: patch => Object.assign(state, patch), calls: () => calls };
}
describe('scoped content release', () => {
  it('rejects changed catalogs with equal or older versions', () => {
    const name = 'collector-cards/catalog.json', baseline = { [name]: Buffer.from('{"version":9}') };
    for (const version of [8, 9]) expect(() => assertCatalogVersions(baseline, { [name]: Buffer.from(JSON.stringify({ version, cards: [] })) })).toThrow('newer version');
    expect(() => assertCatalogVersions(baseline, { [name]: Buffer.from('{"version":10}') })).not.toThrow();
  });
  it('dry runs without mutation and protects other live catalogs', async () => {
    const f = fixture(), plan = await executeRelease(f.bundle, { adapter: f.adapter });
    expect(plan.dryRun).toBe(true); expect(f.calls()).toBe(0);
    expect(plan.inventory['course-data/learning-catalog.json']).toEqual(inventory(f.state().files)['course-data/learning-catalog.json']);
  });
  it('publishes then restores only target files including removing introduced assets', async () => {
    const f = fixture();
    const receipt = await executeRelease(f.bundle, { adapter: f.adapter, deploy: true });
    expect(receipt.verified).toBe(true);
    await executeRelease(f.bundle, { adapter: f.adapter, deploy: true, rollback: true, receipt });
    expect(f.state().files['collector-cards/catalog.json'].toString()).toBe('old');
    expect(f.state().files['collector-cards/new.webp']).toBeUndefined();
    expect(Buffer.from(f.state().files['partner-accessories/catalog.json']).toString()).toBe('live18');
  });
  it('rejects stale releases when unrelated catalog or revision changes', async () => {
    const f = fixture(); f.state().files['course-data/learning-catalog.json'] = Buffer.from('new101');
    await expect(executeRelease(f.bundle, { adapter: f.adapter, deploy: true })).rejects.toThrow('Stale release');
    expect(f.calls()).toBe(0);
  });
  it('refuses stale rollback after any concurrent release', async () => {
    const f = fixture(), receipt = await executeRelease(f.bundle, { adapter: f.adapter, deploy: true });
    f.mutate({ revision: 'other-release' });
    await expect(executeRelease(f.bundle, { adapter: f.adapter, deploy: true, rollback: true, receipt })).rejects.toThrow('Stale rollback');
  });
  it('refuses old rollback receipts and altered payload/snapshot', async () => {
    const f = fixture();
    await expect(executeRelease(f.bundle, { adapter: f.adapter, rollback: true, receipt: { revision: 'r1', releaseHash: 'wrong' } })).rejects.toThrow('Matching publication receipt');
    f.bundle.payload['collector-cards/catalog.json'] = Buffer.from('corrupt').toString('base64');
    await expect(executeRelease(f.bundle, { adapter: f.adapter })).rejects.toThrow('corrupted');
  });
  it('propagates an atomic runner conflict without retrying an overwrite', async () => {
    const f = fixture(); f.adapter.compareAndSwap = async () => { throw Error('CAS conflict'); };
    await expect(executeRelease(f.bundle, { adapter: f.adapter, deploy: true })).rejects.toThrow('CAS conflict');
    expect(f.state().revision).toBe('r1');
  });
  it('requires atomic adapter for actual deployment', async () => {
    const f = fixture(); delete f.adapter.compareAndSwap;
    await expect(executeRelease(f.bundle, { adapter: f.adapter, deploy: true })).rejects.toThrow('lacks atomic');
  });
  it('rejects non-target and workshop changes and unknown targets', () => {
    const f = fixture();
    for (const name of ['partner-accessories/catalog.json', 'workshop/catalog.json']) {
      expect(() => prepareRelease({ targets: ['collector'], baseline: f.state(), changes: { [name]: Buffer.from('x') }, expected: inventory(f.state().files), validation })).toThrow('Outside selected');
    }
  });
  it('requires explicit matching expected online inventory', () => {
    const f = fixture(); expect(() => prepareRelease({ targets: ['collector'], baseline: f.state(), changes: { 'collector-cards/catalog.json': Buffer.from('x') }, expected: {}, validation })).toThrow('Expected online');
  });
  it.each(['../secret', '/abs', 'a\\b', 'a/%2e%2e/b', 'a//b', 'a?query', 'a/./b'])('rejects unsafe path %s', name => expect(() => safePath(name)).toThrow());
  it('rejects traversal before URL normalization', () => {
    expect(() => assetPath('./../hidden.webp', 'collector-cards/catalog.json')).toThrow('Unsafe');
    expect(() => assetPath('https://evil.test/a.webp', 'collector-cards/catalog.json')).toThrow('locally');
  });
});
describe('unified content gate', () => {
  it('uses client schema and validates asset bytes/hash/type and missing files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'csp-content-test-'));
    try {
      await mkdir(path.join(root, 'collector-cards'));
      const image = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#fff' } }).webp().toBuffer();
      const item = { id: 'test', version: 1, price: 1, name: 'test', number: '001', assets: { thumbnail: './a.webp', background: './a.webp' }, checksums: { thumbnail: sha256(image), background: sha256(image) }, assetBytes: image.length * 2 };
      const catalog = { version: 1, cards: [item] };
      const save = () => writeFile(path.join(root, 'collector-cards/catalog.json'), JSON.stringify(catalog));
      await save(); await writeFile(path.join(root, 'collector-cards/a.webp'), image);
      expect((await validatePublicContent({ assetRoot: root, targets: ['collector'] })).ready).toBe(true);
      item.checksums.thumbnail = '0'.repeat(64); await save();
      expect((await validatePublicContent({ assetRoot: root, targets: ['collector'] })).errors.join()).toContain('hash mismatch');
      item.checksums.thumbnail = sha256(image); await save();
      await rm(path.join(root, 'collector-cards/a.webp'));
      expect((await validatePublicContent({ assetRoot: root, targets: ['collector'] })).errors.join()).toContain('Missing asset');
      const outside = path.join(os.tmpdir(), `csp-outside-${process.pid}.webp`);
      await writeFile(outside, image);
      try {
        await symlink(outside, path.join(root, 'collector-cards/a.webp'));
        expect((await validatePublicContent({ assetRoot: root, targets: ['collector'] })).errors.join()).toContain('symlink escapes');
      } finally { await rm(outside); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
