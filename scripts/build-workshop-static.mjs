#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPublication, fetchSource, readPublished, sourceFingerprint, verifyPublication } from './workshop-publication.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--check', '--build', '--verify', '--allow-large-delete', '--refresh-images'].includes(arg)) || args.filter(arg => ['--check', '--build', '--verify'].includes(arg)).length > 1) throw new Error('Usage: node scripts/build-workshop-static.mjs [--check|--build|--verify] [--allow-large-delete] [--refresh-images]');
const outputRoot = resolve('.workshop-static');
if (args.includes('--verify')) {
  const manifest = JSON.parse(await readFile(resolve(outputRoot, 'workshop/catalog.json'), 'utf8'));
  if (sourceFingerprint(await fetchSource()) !== manifest.sourceFingerprint) throw new Error('Authoritative source changed since build');
  await verifyPublication({ manifest });
  console.log(`Verified ${manifest.count} published workshop pets and all image hashes.`);
} else {
  let fingerprint = sourceFingerprint(await fetchSource());
  const published = await readPublished();
  let changed = args.includes('--refresh-images') || published?.sourceFingerprint !== fingerprint;
  if (args.includes('--build')) {
    const manifest = await buildPublication({ outputRoot, published, allowLargeDelete: args.includes('--allow-large-delete') });
    fingerprint = manifest.sourceFingerprint;
    changed = args.includes('--refresh-images') || published?.sourceFingerprint !== fingerprint;
    console.log(`Built ${manifest.count} workshop pets at ${outputRoot}/workshop/catalog.json`);
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\nsourceFingerprint=${fingerprint}\n`);
  console.log(`changed=${changed} sourceFingerprint=${fingerprint}`);
}
