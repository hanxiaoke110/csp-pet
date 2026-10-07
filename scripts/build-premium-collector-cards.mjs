import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'design', 'collector-card-redesign');
const output = resolve(root, 'cloud-assets-source', 'collector-cards');
const bundledCatalog = JSON.parse(await readFile(resolve(root, 'public', 'collector-cards', 'catalog.json'), 'utf8'));

const cards = [
  {
    id: 'miaocuijiao-wind-003', file: 'miaocuijiao-base-v2.png', number: '003', name: '妙脆角猫猫', title: '风驰妙境',
    element: 'wind', price: 888, accent: '#8ff3e3',
    description: '月下风庭与金色星屑交织的人气冠军典藏。', quote: '圆滚滚的身影，也能乘风抵达星辰。',
  },
  {
    id: 'hina-violet-wing-004', file: 'hina-base-v2.png', number: '004', name: '空崎日奈', title: '紫翼静裁',
    element: 'wind', price: 888, accent: '#d6b2ff',
    description: '月夜学园与紫翼锋芒凝成的静默统御典藏。', quote: '真正的强大，不需要喧哗。',
  },
  {
    id: 'shiroko-moon-route-005', file: 'shiroko-base-v2.png', number: '005', name: '砂狼白子', title: '月下疾行',
    element: 'water', price: 788, accent: '#9be7ff',
    description: '蓝色轨迹穿越月下沙海的冷静疾行典藏。', quote: '越过风沙，答案就在下一段路。',
  },
  {
    id: 'wakamo-foxfire-006', file: 'wakamo-base-v2.png', number: '006', name: '若藻', title: '绯樱狐火',
    element: 'fire', price: 788, accent: '#ffb39e',
    description: '绯色鸟居、夜樱与狐火汇聚的炽心典藏。', quote: '炽热心愿，会照亮漫长夜色。',
  },
  {
    id: 'teacher-han-star-guide-007', file: 'teacher-han-base-v2.png', number: '007', name: '韩老师', title: '星引良师',
    element: 'earth', price: 788, accent: '#ffe09b',
    description: '星象仪与知识殿堂共同点亮的引路典藏。', quote: '把难题拆开，星光就有了方向。',
  },
  {
    id: 'snakeblade-obsidian-008', file: 'snakeblade-base-v2.png', number: '008', name: '蛇刃', title: '玄岩蛇刃',
    element: 'earth', price: 688, accent: '#a9f3be',
    description: '黑曜古殿与碧色锋芒交错的蓄势典藏。', quote: '沉默蓄势，只在关键一刻出鞘。',
  },
  {
    id: 'dream-cloud-maker-009', file: 'dream-base-v2.png', number: '009', name: 'Dream', title: '云端造梦',
    element: 'wind', price: 588, accent: '#c5efff',
    description: '浮空阶梯与彩云星屑构筑的想象典藏。', quote: '想象力起风时，世界没有边界。',
  },
  {
    id: 'pig-god-lucky-flame-010', file: 'pig-god-base-v2.png', number: '010', name: '猪神', title: '福焰天成',
    element: 'fire', price: 588, accent: '#ffd390',
    description: '天宫庆典与幸运福焰相拥的欢乐典藏。', quote: '带着好运和热情，把每场挑战点亮。',
  },
  {
    id: 'luoxiaohei-ink-wind-011', file: 'luoxiaohei-base-v2.png', number: '011', name: '罗小黑（兽形）', title: '墨影逐风',
    element: 'wind', price: 588, accent: '#8ff0d8',
    description: '竹海、月色与城市灵光相遇的自在典藏。', quote: '自由的心，能穿过城市与森林。',
  },
  {
    id: 'simo-silent-snow-012', file: 'simo-base-v2.png', number: '012', name: '西蒙海耶', title: '雪境无声',
    element: 'earth', price: 588, accent: '#d9f2ff',
    description: '北境雪林与静默守望凝结的坚毅典藏。', quote: '耐心守望，直到最准确的时刻。',
  },
];

const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
const escapeXml = value => String(value).replace(/[<>&'\"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]);

function textSvg(card) {
  const isLatin = /^[\x00-\x7F]+$/.test(card.name);
  const nameSize = isLatin ? 70 : card.name.length >= 7 ? 54 : card.name.length >= 6 ? 59 : 69;
  const nameSpacing = isLatin ? 7 : card.name.length >= 7 ? 2 : 6;
  return Buffer.from(`
    <svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gold" x1="0" x2="1">
          <stop stop-color="#fff7c7"/><stop offset=".46" stop-color="#e2b950"/><stop offset=".7" stop-color="#fff0a3"/><stop offset="1" stop-color="#c98e27"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="3"/>
          <feComponentTransfer><feFuncA type="linear" slope=".75"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <text x="512" y="1340" text-anchor="middle" fill="url(#gold)" stroke="#5b3614" stroke-width="1.2"
        font-size="${nameSize}" font-weight="700" letter-spacing="${nameSpacing}"
        font-family="STKaiti,KaiTi,Kaiti SC,Songti SC,serif" filter="url(#shadow)">${escapeXml(card.name)}</text>
      <text x="512" y="1416" text-anchor="middle" fill="${card.accent}" stroke="#18354a" stroke-width=".8"
        font-size="31" letter-spacing="9" font-family="STKaiti,KaiTi,Kaiti SC,Songti SC,serif" filter="url(#shadow)">${escapeXml(card.title)}</text>
    </svg>`);
}

async function buildCard(card) {
  const directory = resolve(output, card.id);
  await mkdir(directory, { recursive: true });

  // The approved artwork is already a complete coherent card face. Keep it
  // intact so the online viewer's tilt, glare and foil do not reveal a pasted
  // workshop sprite. Typography remains a separate transparent layer.
  const background = await sharp(resolve(source, card.file))
    .resize(1024, 1536, { fit: 'fill' })
    .webp({ quality: 90, effort: 6, smartSubsample: true })
    .toBuffer();
  const text = await sharp(textSvg(card))
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toBuffer();
  const completeFace = await sharp(background)
    .composite([{ input: text }])
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toBuffer();
  const thumbnail = await sharp(completeFace)
    .resize(320, 480, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .webp({ quality: 88, effort: 6, smartSubsample: true })
    .toBuffer();

  await writeFile(resolve(directory, 'background.webp'), background);
  await writeFile(resolve(directory, 'text.webp'), text);
  await writeFile(resolve(directory, 'thumbnail.webp'), thumbnail);
  // Remove the obsolete pasted-sprite layer from the rejected draft. The
  // finished card still has physical tilt, glare and foil in the app viewer.
  await rm(resolve(directory, 'subject.webp'), { force: true });

  const assets = { thumbnail, background, text };
  return {
    id: card.id,
    version: 2,
    number: card.number,
    name: card.name,
    title: card.title,
    element: card.element,
    rarity: 'legendary',
    price: card.price,
    description: card.description,
    quote: card.quote,
    featured: true,
    assetBytes: Object.values(assets).reduce((sum, bytes) => sum + bytes.byteLength, 0),
    assets: Object.fromEntries(Object.keys(assets).map(name => [name, `./${card.id}/${name}.webp`])),
    checksums: Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, checksum(bytes)])),
  };
}

await mkdir(output, { recursive: true });
const rendered = [];
for (const card of cards) rendered.push(await buildCard(card));

const astra = bundledCatalog.cards.find(card => card.id === 'astra-stargazer-001');
const furina = bundledCatalog.cards.find(card => card.id === 'furina-water-stage-002');
if (!astra || !furina) throw new Error('内置阿斯特拉或芙宁娜典藏卡缺失');

// The original Furina entry and files are deliberately kept byte-for-byte.
await rm(resolve(output, 'furina-water-stage-002'), { recursive: true, force: true });
const catalog = {
  version: 4,
  updatedAt: new Date().toISOString(),
  cards: [astra, rendered[0], rendered[1], furina, ...rendered.slice(2)],
};
await writeFile(resolve(output, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`已生成 ${rendered.length} 张精绘典藏卡，线上目录共 ${catalog.cards.length} 张（芙宁娜保持原版）。`);
for (const card of rendered) console.log(`${card.number} ${card.name}: ${(card.assetBytes / 1024 / 1024).toFixed(2)} MiB`);
