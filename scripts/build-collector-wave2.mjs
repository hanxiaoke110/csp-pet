import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(root, 'design/collector-cards-wave2');
const specs = JSON.parse(await readFile(resolve(design, 'cards.json'), 'utf8')).cards;
const authoringFile = resolve(root, 'cloud-assets-source/collector-cards/catalog.json');
const authoringHash = hashBytes(await readFile(authoringFile));
const snapshot = resolve(design,'baseline-catalog.json');
const baselineFile = existsSync(snapshot) ? snapshot : authoringFile;
const baselineBytes = await readFile(baselineFile);
const baseline = JSON.parse(baselineBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function hashBytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[c]);
const results = [];
const sheets = [];
for (const spec of specs) {
  const folder = resolve(design, 'assets', spec.id);
  await mkdir(folder, { recursive: true });
  const subjectFile = resolve(design, 'raw', `${spec.key}-subject.png`);
  const stats = await sharp(subjectFile).stats();
  const metadata = await sharp(subjectFile).metadata();
  assert(metadata.hasAlpha && stats.channels.at(-1).min === 0, `${spec.name}: subject must have real transparency`);
  assert(stats.channels.at(-1).mean > 12 && stats.channels.at(-1).mean < 230, `${spec.name}: empty/opaque subject`);
  const scaled = await sharp(subjectFile).resize(840,1260,{fit:'contain'}).png().toBuffer();
  const subject = await sharp({create:{width:1024,height:1536,channels:4,background:'#00000000'}})
    .composite([{input:scaled,left:92,top:20}]).webp({quality:92,alphaQuality:100,effort:6}).toBuffer();
  const background = await sharp(resolve(design,'raw',`${spec.key}-background.png`))
    .resize(1024,1536,{fit:'fill'}).removeAlpha().webp({quality:89,effort:6}).toBuffer();
  const size = spec.name.length >= 7 ? 54 : spec.name.length >= 6 ? 59 : 69;
  const text = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><defs><linearGradient id="gold"><stop stop-color="#fff7c7"/><stop offset=".5" stop-color="#e2b950"/><stop offset="1" stop-color="#fff0a3"/></linearGradient></defs><text x="512" y="1337" text-anchor="middle" fill="url(#gold)" stroke="#503416" stroke-width="1" font-size="${size}" font-weight="700" letter-spacing="4" font-family="STKaiti,KaiTi,Kaiti SC,Songti SC,serif">${xml(spec.name)}</text><text x="512" y="1404" text-anchor="middle" fill="${spec.accent}" font-size="31" letter-spacing="9" font-family="STKaiti,KaiTi,Kaiti SC,Songti SC,serif">${xml(spec.title)}</text></svg>`))
    .webp({quality:94,alphaQuality:100,effort:6}).toBuffer();
  const front = await sharp(background).composite([{input:subject},{input:text}]).png().toBuffer();
  const thumbnail = await sharp(front).resize(320,480).webp({quality:88,effort:6}).toBuffer();
  const layers = {background,subject,text,thumbnail};
  const assetBytes = Object.values(layers).reduce((sum,b)=>sum+b.length,0);
  assert(assetBytes < 2*1024*1024, `${spec.name}: asset budget exceeded`);
  for (const [layer,bytes] of Object.entries(layers)) await writeFile(resolve(folder,`${layer}.webp`),bytes);
  const { id, number, name, title, element, price, description, quote } = spec;
  results.push({id,version:1,number,name,title,element,price,description,quote,rarity:'legendary',assetBytes,
    assets:Object.fromEntries(Object.keys(layers).map(layer=>[layer,`./${id}/${layer}.webp`])),
    checksums:Object.fromEntries(Object.entries(layers).map(([layer,bytes])=>[layer,hash(bytes)]))});
  sheets.push(await sharp(front).resize(256,384).png().toBuffer());
}
assert.equal(new Set([...baseline.cards,...results].map(c=>c.id)).size, baseline.cards.length+9);
assert.equal(new Set([...baseline.cards,...results].map(c=>c.number)).size, baseline.cards.length+9);
const updatedAt = new Date().toISOString();
// Draft only: never write the deployed authoring catalog or its existing assets.
await writeFile(resolve(design,'preview-catalog.json'),JSON.stringify({version:baseline.version+1,updatedAt,cards:results.map(c=>({...c,assets:Object.fromEntries(Object.entries(c.assets).map(([key,url])=>[key,url.replace('./','./assets/')]))}))},null,2)+'\n');
await writeFile(resolve(design,'candidate-catalog.json'),JSON.stringify({...baseline,version:baseline.version+1,updatedAt,cards:[...baseline.cards,...results]},null,2)+'\n');
await sharp({create:{width:768,height:1152,channels:3,background:'#081526'}}).composite(sheets.map((input,i)=>({input,left:(i%3)*256,top:Math.floor(i/3)*384}))).webp({quality:90}).toFile(resolve(design,'contact-sheet.webp'));
assert.equal(hash(await readFile(baselineFile)),hash(baselineBytes),'Existing catalog changed');
assert.equal(hash(await readFile(authoringFile)),authoringHash,'Live authoring catalog changed');
const report = {status:'draft-ready-not-published',oldCardsPreserved:baseline.cards.length,newCards:results.length,baselineHash:hash(baselineBytes),totalNewBytes:results.reduce((s,c)=>s+c.assetBytes,0),cards:results.map(c=>({number:c.number,name:c.name,bytes:c.assetBytes,realSubjectLayer:true}))};
await writeFile(resolve(design,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
