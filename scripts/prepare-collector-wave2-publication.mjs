import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(root, 'design/collector-cards-wave2');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const live = JSON.parse(await readFile(process.argv[2], 'utf8'));
const authoring = resolve(root, 'cloud-assets-source/collector-cards');
const stage = resolve(root, '.cloudflare-static/collector-cards');
const candidate = JSON.parse(await readFile(resolve(design,'candidate-catalog.json'),'utf8'));
const preview = JSON.parse(await readFile(resolve(design,'preview-catalog.json'),'utf8'));
const existing = JSON.parse(await readFile(resolve(authoring,'catalog.json'),'utf8'));
assert.deepEqual(existing,live,'Authoring catalog differs from live: resolve before publication');
assert.deepEqual(JSON.parse(await readFile(resolve(stage,'catalog.json'),'utf8')),live,'Staging catalog differs from live');
assert.equal(preview.cards.length,9);
const newIds = new Set(preview.cards.map(c=>c.id));
const newCards = candidate.cards.filter(c=>newIds.has(c.id));
assert.equal(newCards.length,9);
assert(newCards.every(c=>!live.cards.some(old=>old.id===c.id)),'Wave already published or IDs collide');
const published = {...live,version:Math.max(live.version,candidate.version)+1,updatedAt:new Date().toISOString(),cards:[...live.cards,...newCards]};
assert.equal(new Set(published.cards.map(c=>c.number)).size,published.cards.length);
for(const card of newCards) {
  let bytes=0;
  for(const [layer,path] of Object.entries(card.assets)) {
    assert.equal(path,`./${card.id}/${layer}.webp`);
    const image=await readFile(resolve(design,'assets',card.id,`${layer}.webp`));
    assert.equal(hash(image),card.checksums[layer],`${card.name} ${layer}: hash mismatch`);
    bytes+=image.length;
  }
  assert.equal(bytes,card.assetBytes);
}
await writeFile(resolve(design,'baseline-catalog.json'),JSON.stringify(live,null,2)+'\n',{flag:'wx'});
for(const card of newCards) {
  await cp(resolve(design,'assets',card.id),resolve(authoring,card.id),{recursive:true,errorOnExist:true,force:false});
  await cp(resolve(design,'assets',card.id),resolve(stage,card.id),{recursive:true,errorOnExist:true,force:false});
}
const payload=JSON.stringify(published,null,2)+'\n';
await writeFile(resolve(authoring,'catalog.json'),payload);
await writeFile(resolve(stage,'catalog.json'),payload);
console.log(JSON.stringify({version:published.version,oldCards:live.cards.length,newCards:newCards.length,totalCards:published.cards.length,catalogSha256:hash(Buffer.from(payload))},null,2));
