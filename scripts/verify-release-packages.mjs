import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw Error('Provide expected release version');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.tmp', `release-${version}`);
fs.mkdirSync(output, { recursive: true });
const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const publicKey = Buffer.from(config.plugins.updater.pubkey, 'base64').toString('utf8').trim().split('\n')[1];
const response = await fetch(`https://gitee.com/hanliuliu110/csp-pet/raw/master/update.json?t=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error(`Update endpoint HTTP ${response.status}`);
const update = await response.json();
if (update.version !== version) throw Error(`Update endpoint still serves ${update.version}`);
const checks = [];
for (const platform of ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64']) {
  const entry = update.platforms?.[platform];
  const prefix = `https://gitee.com/hanliuliu110/csp-pet/releases/download/v${version}/`;
  if (!entry?.url?.startsWith(prefix) || !entry.signature) throw Error(`Invalid package metadata: ${platform}`);
  const name = path.basename(new URL(entry.url).pathname);
  if (!/^CSP_[\d.]+_(x64-setup\.exe|aarch64\.dmg|x64\.dmg)$/.test(name)) throw Error(`Invalid filename: ${name}`);
  const packageResponse = await fetch(entry.url, { signal: AbortSignal.timeout(180000) });
  if (!packageResponse.ok) throw Error(`Download ${name} HTTP ${packageResponse.status}`);
  const bytes = Buffer.from(await packageResponse.arrayBuffer());
  if (!bytes.length || bytes.length >= 100000000) throw Error(`Invalid package size: ${name} ${bytes.length}`);
  const expectedMagic = platform === 'windows-x86_64'
    ? bytes.subarray(0, 2).toString() === 'MZ'
    : bytes.subarray(bytes.length - 512, bytes.length - 508).toString() === 'koly';
  if (!expectedMagic) throw Error(`Invalid installer format: ${name}`);
  const file = path.join(output, name);
  fs.writeFileSync(file, bytes);
  fs.writeFileSync(`${file}.minisig`, Buffer.from(entry.signature, 'base64'));
  execFileSync('minisign', ['-Vm', file, '-P', publicKey, '-x', `${file}.minisig`], { encoding: 'utf8', timeout: 30000 });
  const result = { platform, name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), signatureVerified: true };
  checks.push(result);
  console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ version, checkedAt: new Date().toISOString(), checks }, null, 2) + '\n');
console.log('All three installers downloaded; format, size and cryptographic signatures verified. This is not an installation smoke test.');
