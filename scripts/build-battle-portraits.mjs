import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root,'design/battle-portraits');
const output = resolve(root,'cloud-assets-source/battle-portraits');
const original = JSON.parse(await readFile(resolve(source,'sources.json'),'utf8')).portraits;
const wave = JSON.parse(await readFile(resolve(root,'design/collector-cards-wave2/cards.json'),'utf8')).cards;
const sources = [
  ...original.map(item=>({speciesIds:[item.speciesId],source:resolve(source,'raw',`${item.speciesId}.png`)})),
  ...wave.map(item=>({speciesIds:[`workshop-${item.pet}`,item.pet],source:resolve(root,'design/collector-cards-wave2/assets',item.id,'subject.webp')})),
];
await mkdir(output,{recursive:true});
const portraits=[];
let totalBytes=0;
for(const item of sources) {
  const metadata = await sharp(item.source).metadata();
  const stats = await sharp(item.source).stats();
  assert(metadata.hasAlpha && stats.channels.at(-1).min===0,'Expected genuine transparent subject');
  const bytes = await sharp(item.source).trim({threshold:5}).resize(1024,1024,{fit:'contain',background:'#00000000'})
    .webp({quality:90,alphaQuality:100,effort:6}).toBuffer();
  assert(bytes.length>0 && bytes.length<=4*1024*1024);
  const filename=`${item.speciesIds[0]}.webp`;
  await writeFile(resolve(output,filename),bytes);
  totalBytes+=bytes.length;
  for(const speciesId of item.speciesIds) portraits.push({speciesId,url:`https://cards.cspstudy.top/battle-portraits/${filename}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),width:1024,height:1024,style:'painted'});
}
assert.equal(new Set(portraits.map(p=>p.speciesId)).size,portraits.length);
await writeFile(resolve(output,'catalog.json'),JSON.stringify({version:1,updatedAt:new Date().toISOString(),portraits},null,2)+'\n');
const thumbs=await Promise.all(sources.map(async item=>sharp(resolve(output,`${item.speciesIds[0]}.webp`)).resize(240,240).png().toBuffer()));
await sharp({create:{width:960,height:960,channels:3,background:'#0b1e32'}}).composite(thumbs.map((input,i)=>({input,left:(i%4)*240,top:Math.floor(i/4)*240}))).webp({quality:90}).toFile(resolve(source,'contact-sheet.webp'));
console.log(JSON.stringify({uniquePortraits:sources.length,aliases:portraits.length,totalBytes,onlineOnly:true,published:false},null,2));
