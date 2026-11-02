import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, readdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { safePath, sha256 } from './core.mjs';

const exec = promisify(execFile);
const WORKER = 'csp-card-assets';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UUID = /^[a-f0-9-]{36}$/i;
async function tree(directory, prefix = '') {
  const files = {};
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = safePath(prefix + entry.name);
    if (entry.isSymbolicLink()) throw Error(`Symlink refused: ${name}`);
    if (entry.isDirectory()) Object.assign(files, await tree(directory, name + '/'));
    else if (entry.isFile()) files[name] = await readFile(path.join(directory, name));
  }
  return files;
}
async function saveTree(directory, files) {
  for (const [name, bytes] of Object.entries(files)) {
    safePath(name); await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), bytes);
  }
}
export function activeDeployment(raw) {
  const all = JSON.parse(raw);
  const latest = [...(Array.isArray(all) ? all : all.deployments || [])].sort((a, b) => b.created_on.localeCompare(a.created_on))[0];
  if (!latest?.id || latest.versions?.length !== 1 || latest.versions[0].percentage !== 100 || !UUID.test(latest.versions[0].version_id)) throw Error('Expected one active Worker version at 100%; gradual deployment refused');
  return { revision: `${latest.id}:${latest.versions[0].version_id}`, version: latest.versions[0].version_id };
}
export function createCloudflareAdapter({
  stage = process.env.CSP_CONTENT_BASELINE_STAGE,
  baselineRevision = process.env.CSP_CONTENT_BASELINE_REVISION,
  stateDirectory = process.env.CSP_CONTENT_STATE_DIR || path.join(os.homedir(), '.codex/csp-card-publication'),
  lockDirectory = process.env.CSP_CONTENT_LOCK_DIR || path.join(os.homedir(), '.codex/csp-card-publication.lock'),
  runner = async (args, options = {}) => (await exec('npx', ['--yes', 'wrangler@4.151.0', ...args], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024, timeout: 15 * 60 * 1000, ...options })).stdout,
  fetcher = fetch,
} = {}) {
  const config = path.join(ROOT, 'deploy/wrangler.cards.toml');
  const common = ['--config', config, '--name', WORKER];
  let held = false;
  const current = async () => activeDeployment(await runner(['deployments', 'list', ...common, '--json']));
  async function readStage() {
    try {
      const pointer = JSON.parse(await readFile(path.join(stateDirectory, 'current.json'), 'utf8'));
      safePath(pointer.directory);
      return { files: await tree(path.join(stateDirectory, pointer.directory)), revision: pointer.revision };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!stage || !baselineRevision) throw Error('Set CSP_CONTENT_BASELINE_STAGE and CSP_CONTENT_BASELINE_REVISION from the complete verified live snapshot');
    return { files: await tree(path.resolve(stage)), revision: baselineRevision };
  }
  async function verify(files, deployment) {
    let version;
    if (files._headers || files._redirects) version = JSON.parse(await runner(['versions', 'view', deployment.version, ...common, '--json']));
    for (const special of ['_headers', '_redirects']) {
      if (!files[special]) continue;
      const remote = version.resources?.script_runtime?.assets?.[`raw${special}`];
      if (typeof remote !== 'string' || sha256(Buffer.from(remote)) !== sha256(files[special])) throw Error(`Live configuration changed: ${special}`);
    }
    const names = Object.keys(files).filter(name => name !== '_headers' && name !== '_redirects');
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(8, names.length) }, async () => {
      while (cursor < names.length) {
        const name = names[cursor++]; safePath(name);
        const response = await fetcher(`https://cards.cspstudy.top/${name}`, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
        if (!response.ok || sha256(Buffer.from(await response.arrayBuffer())) !== sha256(files[name])) throw Error(`Live stage is stale or asset unavailable: ${name}`);
      }
    }));
    if ((await current()).revision !== deployment.revision) throw Error('Live revision changed during snapshot verification');
  }
  return {
    async withLock(callback) {
      await mkdir(path.dirname(lockDirectory), { recursive: true });
      try { await mkdir(lockDirectory); } catch (error) { if (error.code === 'EEXIST') throw Error(`Publication lock already held: ${lockDirectory}; inspect owner.json, never auto-steal`); throw error; }
      held = true;
      try {
        await writeFile(path.join(lockDirectory, 'owner.json'), JSON.stringify({ pid: process.pid, host: os.hostname(), createdAt: new Date().toISOString(), worker: WORKER }));
        return await callback();
      } finally { held = false; await rm(lockDirectory, { recursive: true, force: true }); }
    },
    async snapshot(worker) {
      if (worker !== WORKER) throw Error('Adapter only supports csp-card-assets');
      const deployment = await current(), baseline = await readStage(), files = baseline.files;
      if (baseline.revision !== deployment.revision) throw Error('Saved full stage revision is stale; re-preserve the complete live snapshot, do not just relabel its revision');
      await verify(files, deployment);
      return { revision: deployment.revision, files };
    },
    async guardedPublish({ worker, expectedRevision, files }) {
      if (!held || worker !== WORKER) throw Error('Guarded publication requires the shared csp-card-assets lock');
      if ((await current()).revision !== expectedRevision) throw Error('Stale release before upload');
      const temporary = await mkdtemp(path.join(os.tmpdir(), 'csp-card-upload-'));
      try {
        const assets = path.join(temporary, 'assets'); await saveTree(assets, files);
        const outputFile = path.join(temporary, 'wrangler-output.jsonl');
        await runner(['versions', 'upload', ...common, '--assets', assets, '--message', 'Reviewed scoped content release'], { env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputFile } });
        const events = (await readFile(outputFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
        const uploaded = events.findLast(e => e.type === 'version-upload' && e.worker_name === WORKER)?.version_id;
        if (!UUID.test(uploaded || '')) throw Error('Wrangler did not return an unambiguous uploaded version');
        if ((await current()).revision !== expectedRevision) throw Error('Stale release after upload; candidate was not activated');
        // Preserve the candidate bytes before activation for verification and future target rollback.
        await mkdir(stateDirectory, { recursive: true });
        const directory = `snapshot-${uploaded}`; await mkdir(path.join(stateDirectory, directory));
        await saveTree(path.join(stateDirectory, directory), files);
        try {
          await runner(['versions', 'deploy', `${uploaded}@100%`, ...common, '--yes', '--message', 'Reviewed scoped content release']);
        } catch (error) {
          // A response may be lost after a successful activation. Reconcile once, never blindly retry.
          if ((await current()).version !== uploaded) throw error;
        }
        const deployed = await current();
        if (deployed.version !== uploaded) throw Error('Unexpected active version after publication; inspect concurrent/manual deploy');
        const pointer = path.join(stateDirectory, 'current.json');
        await writeFile(pointer + '.tmp', JSON.stringify({ directory, revision: deployed.revision }));
        await rename(pointer + '.tmp', pointer);
        return { revision: deployed.revision };
      } finally { await rm(temporary, { recursive: true, force: true }); }
    },
  };
}
export default createCloudflareAdapter();
