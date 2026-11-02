import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const TARGETS = Object.freeze({
  collector: ['collector-cards/'], wardrobe: ['wardrobe/'],
  accessories: ['partner-accessories/'], learning: ['course-data/learning-catalog.json', 'course-data/learning-catalog.version.json'],
  questions: ['course-data/question-bank-v2/', 'question-images/'],
});
export function safePath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[\\?#%\x00-\x1f]/.test(value)
      || value.split('/').some(part => !part || part === '.' || part === '..')) throw Error(`Unsafe asset path: ${value}`);
  return value;
}
function assertScope(targets, name) {
  safePath(name);
  if (!targets.length || targets.some(t => !TARGETS[t])) throw Error('Explicit known targets required');
  const questionImage = targets.includes('questions') && /^course-data\/.+\.(?:svg|webp|png|jpe?g|gif)$/i.test(name);
  if (!questionImage && !targets.some(t => TARGETS[t].some(prefix => prefix.endsWith('/') ? name.startsWith(prefix) : name === prefix))) {
    throw Error(`Outside selected targets: ${name}`);
  }
}
export function inventory(files) {
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => {
    safePath(name); return [name, { bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) }];
  }));
}
export function assertCatalogVersions(baseline, changes) {
  for (const [name, bytes] of Object.entries(changes)) {
    if (!/(?:^|\/)(?:catalog|learning-catalog)\.json$/.test(name) || baseline[name] == null || sha256(bytes) === sha256(baseline[name])) continue;
    const oldCatalog = JSON.parse(Buffer.from(baseline[name]).toString('utf8'));
    const newCatalog = JSON.parse(Buffer.from(bytes).toString('utf8'));
    const previous = oldCatalog.catalogVersion ?? oldCatalog.version, next = newCatalog.catalogVersion ?? newCatalog.version;
    if (!Number.isInteger(previous) || !Number.isInteger(next) || next <= previous) throw Error(`Changed catalog requires a newer version: ${name}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function prepareRelease({ targets, baseline, changes, expected, validation }) {
  if (!baseline.revision || !validation?.ready) throw Error('Complete revision and successful content validation required');
  const before = inventory(baseline.files);
  if (!same(before, expected)) throw Error('Expected online inventory differs; reconcile before preparing');
  if (!Object.keys(changes).length) throw Error('Empty release');
  for (const name of Object.keys(changes)) assertScope(targets, name);
  const after = inventory(changes);
  const snapshot = Object.fromEntries(Object.keys(changes).map(name => [name, baseline.files[name] == null ? null : Buffer.from(baseline.files[name]).toString('base64')]));
  const payload = Object.fromEntries(Object.entries(changes).map(([name, bytes]) => [name, Buffer.from(bytes).toString('base64')]));
  const manifest = { schemaVersion: 1, worker: 'csp-card-assets', targets, baselineRevision: baseline.revision,
    before, after, validation, createdAt: new Date().toISOString() };
  return { manifest, payload, snapshot };
}
function decode(values) { return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value === null ? null : Buffer.from(value, 'base64')])); }
function checkBundle(bundle) {
  const { manifest, payload, snapshot } = bundle;
  if (manifest.schemaVersion !== 1 || manifest.worker !== 'csp-card-assets' || !manifest.validation?.ready) throw Error('Invalid release manifest');
  for (const name of Object.keys(payload)) assertScope(manifest.targets, name);
  if (!same(inventory(decode(payload)), manifest.after) || !same(Object.keys(snapshot).sort(), Object.keys(payload).sort())) throw Error('Release payload corrupted');
  for (const [name, bytes] of Object.entries(decode(snapshot))) {
    if (bytes === null ? manifest.before[name] != null : sha256(bytes) !== manifest.before[name]?.sha256) throw Error('Rollback snapshot corrupted');
  }
}
/** CAS adapters may be atomic; guardedPublish adapters instead require a cooperative lock.
 * Neither claims that Cloudflare offers a server-side conditional activation API. */
export async function executeRelease(bundle, options) {
  const { adapter, deploy = false, rollback = false, receipt = null, onPublished = async () => {}, locked = false } = options;
  if (adapter.withLock && !locked) return adapter.withLock(() => executeRelease(bundle, { ...options, locked: true }));
  checkBundle(bundle);
  const current = await adapter.snapshot('csp-card-assets');
  const live = inventory(current.files);
  if (rollback) {
    if (!receipt?.revision || receipt.releaseHash !== sha256(JSON.stringify(bundle))) throw Error('Matching publication receipt required');
    // Refuse any concurrent release, even if it only changed another catalog.
    if (current.revision !== receipt.revision) throw Error('Stale rollback: worker revision changed');
    for (const [name, entry] of Object.entries(bundle.manifest.after)) if (live[name]?.sha256 !== entry.sha256) throw Error(`Stale rollback: ${name}`);
  } else if (current.revision !== bundle.manifest.baselineRevision || !same(live, bundle.manifest.before)) {
    throw Error('Stale release: current online snapshot changed');
  }
  const files = { ...current.files };
  const patch = decode(rollback ? bundle.snapshot : bundle.payload);
  for (const [name, bytes] of Object.entries(patch)) { if (bytes === null) delete files[name]; else files[name] = bytes; }
  const plan = { worker: 'csp-card-assets', expectedRevision: current.revision, files, changedPaths: Object.keys(patch), rollback };
  if (!deploy) return { dryRun: true, changedPaths: plan.changedPaths, inventory: inventory(files) };
  const publish = adapter.compareAndSwap || (locked && adapter.guardedPublish);
  if (typeof publish !== 'function') throw Error('Adapter lacks atomic compareAndSwap or locked guardedPublish; deployment refused');
  const result = await publish.call(adapter, plan);
  if (!result?.revision || result.revision === current.revision) throw Error('Adapter did not return a new revision; inspect deployment before retrying');
  const publication = { revision: result.revision, releaseHash: sha256(JSON.stringify(bundle)), rollback, verified: false };
  await onPublished(publication);
  const verified = await adapter.snapshot('csp-card-assets');
  if (verified.revision !== result.revision || !same(inventory(verified.files), inventory(files))) throw Error('Publication verification failed; inspect live state');
  return { ...publication, verified: true };
}
