#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPublication, checkPublication, fetchSource, sourceFingerprint, verifyPublication } from './workshop-publication.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--check', '--build', '--verify', '--allow-large-delete', '--refresh-images', '--revision-only'].includes(arg)) || args.filter(arg => ['--check', '--build', '--verify'].includes(arg)).length > 1 || (args.includes('--revision-only') && (args.includes('--build') || args.includes('--verify')))) throw new Error('Usage: node scripts/build-workshop-static.mjs [--check [--revision-only]|--build|--verify] [--allow-large-delete] [--refresh-images]');
const outputRoot = resolve('.workshop-static');
if (args.includes('--verify')) {
  const manifest = JSON.parse(await readFile(resolve(outputRoot, 'workshop/catalog.json'), 'utf8'));
  if (sourceFingerprint(await fetchSource()) !== manifest.sourceFingerprint) throw new Error('Authoritative source changed since build');
  await verifyPublication({ manifest });
  console.log(`Verified ${manifest.count} published workshop pets and all image hashes.`);
} else {
  let result;
  if (args.includes('--build')) {
    const manifest = await buildPublication({ outputRoot, allowLargeDelete: args.includes('--allow-large-delete') });
    result = { changed: true, revision: manifest.publicationRevision, sourceFingerprint: manifest.sourceFingerprint };
    console.log(`Built ${manifest.count} workshop pets at ${outputRoot}/workshop/catalog.json`);
  } else result = await checkPublication({ revisionOnly: args.includes('--revision-only'), refreshImages: args.includes('--refresh-images') });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\nrevision=${result.revision}\nsourceFingerprint=${result.sourceFingerprint || ''}\n`);
  console.log(`changed=${result.changed} revision=${result.revision} sourceFingerprint=${result.sourceFingerprint || ''} skippedSourceCheck=${Boolean(result.skippedSourceCheck)}`);
}
