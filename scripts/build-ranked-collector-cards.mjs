import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = '/Users/hanliuliu/.codex/generated_images/01a08691-8f5e-79b3-b8ea-b3336bc146d2';
const output = resolve(root, 'cloud-assets-source', 'collector-cards');
const draftOutput = resolve(root, 'cloud-assets-source', 'collector-card-drafts');
const bundledCatalog = JSON.parse(await readFile(resolve(root, 'public', 'collector-cards', 'catalog.json'), 'utf8'));

const cards = [
  {
    id: 'miaocuijiao-wind-003', number: '003', name: '妙脆角猫猫', title: '风驰妙境', element: 'wind', price: 888,
    description: '月下风庭与金色星屑交织的人气冠军典藏。', quote: '圆滚滚的身影，也能乘风抵达星辰。',
    pet: 'ws-YWS6Q4VHVP', background: 'exec-594c92f9-3400-4012-b434-c98de960d102.png', accent: '#8ff3d4',
  },
  {
    id: 'hina-violet-wing-004', number: '004', name: '空崎日奈', title: '紫翼静裁', element: 'wind', price: 888,
    description: '月夜学园与紫翼锋芒凝成的静默统御典藏。', quote: '真正的强大，不需要喧哗。',
    pet: 'ws-XSG0GG56C1', background: 'exec-8ce7bb69-ecb8-43cf-80c5-665839c2c0ad.png', accent: '#c9a7ff',
  },
  {
    id: 'furina-water-stage-002', number: '002', name: '芙宁娜', title: '万众瞩目的谢幕', element: 'water', price: 888,
    description: '珍珠水幕与鎏金舞台交织的人气冠军全息典藏。', quote: '让每一滴水，都为勇气鼓掌。',
    pet: 'ws-VPHQ08AF50', background: 'exec-d27ee331-bf73-445c-98f6-67fa7094b85e.png', accent: '#84e8ff', version: 2,
  },
  {
    id: 'shiroko-moon-route-005', number: '005', name: '砂狼白子', title: '月下疾行', element: 'water', price: 788,
    description: '蓝色轨迹穿越月下沙海的冷静疾行典藏。', quote: '越过风沙，答案就在下一段路。',
    pet: 'ws-8UGTMBGSKU', background: 'exec-699f0d0d-6f44-4b1f-b85e-089e71c1f6cb.png', accent: '#86d8ff',
  },
  {
    id: 'wakamo-foxfire-006', number: '006', name: '若藻', title: '绯樱狐火', element: 'fire', price: 788,
    description: '绯色鸟居、夜樱与狐火汇聚的炽心典藏。', quote: '炽热心愿，会照亮漫长夜色。',
    pet: 'ws-CG4LCDE99Y', background: 'exec-98e28314-071d-4c5e-8dd5-049ad8e9571d.png', accent: '#ff9a83',
  },
  {
    id: 'teacher-han-star-guide-007', number: '007', name: '韩老师', title: '星引良师', element: 'earth', price: 788,
    description: '星象仪与知识殿堂共同点亮的引路典藏。', quote: '把难题拆开，星光就有了方向。',
    pet: 'ws-36JQT1N16D', background: 'exec-cf773d90-445b-4b60-bfbf-c7e8d4c48894.png', accent: '#ffd083',
  },
  {
    id: 'snakeblade-obsidian-008', number: '008', name: '蛇刃', title: '玄岩蛇刃', element: 'earth', price: 688,
    description: '黑曜古殿与碧色锋芒交错的蓄势典藏。', quote: '沉默蓄势，只在关键一刻出鞘。',
    pet: 'ws-6CSEZV32KH', background: 'exec-b5600834-de8f-4265-9e05-9fa4227248b3.png', accent: '#9beaaf',
  },
  {
    id: 'dream-cloud-maker-009', number: '009', name: 'Dream', title: '云端造梦', element: 'wind', price: 588,
    description: '浮空阶梯与彩云星屑构筑的想象典藏。', quote: '想象力起风时，世界没有边界。',
    pet: 'ws-NK728B1914', background: 'exec-e5633c00-c7fa-4a8b-af53-fc752a3cdee9.png', accent: '#b9e9ff',
  },
  {
    id: 'pig-god-lucky-flame-010', number: '010', name: '猪神', title: '福焰天成', element: 'fire', price: 588,
    description: '天宫庆典与幸运福焰相拥的欢乐典藏。', quote: '带着好运和热情，把每场挑战点亮。',
    pet: 'ws-N3RBJ4ABFR', background: 'exec-fd8ef1b2-b052-4b54-831f-1cd7ca070187.png', accent: '#ffc56f',
  },
  {
    id: 'luoxiaohei-ink-wind-011', number: '011', name: '罗小黑(兽形)', title: '墨影逐风', element: 'wind', price: 588,
    description: '竹海、月色与城市灵光相遇的自在典藏。', quote: '自由的心，能穿过城市与森林。',
    pet: 'ws-WZC0ZL6ALP', background: 'exec-5d0c2d61-9e25-4e66-9785-a3e245358122.png', accent: '#79e7ca',
  },
  {
    id: 'simo-silent-snow-012', number: '012', name: '西蒙海耶', title: '雪境无声', element: 'earth', price: 588,
    description: '北境雪林与静默守望凝结的坚毅典藏。', quote: '耐心守望，直到最准确的时刻。',
    pet: 'ws-BKK9XJUL6M', background: 'exec-4ac54088-0dd3-4664-bc5d-61fff4bb26b3.png', accent: '#ccecff',
  },
];

const escapeXml = value => String(value).replace(/[<>&'\"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]);
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');

async function renderTextLayer(card) {
  const titleSize = card.name.length > 6 ? 56 : 68;
  const svg = `
    <svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="gold" x1="0" x2="1"><stop stop-color="#fff0ae"/><stop offset=".5" stop-color="#dba83f"/><stop offset="1" stop-color="#fff4bf"/></linearGradient>
      </defs>
      <g fill="none" stroke="url(#gold)" opacity=".9">
        <path d="M92 118 H350 M674 118 H932" stroke-width="3"/>
        <circle cx="512" cy="118" r="18" stroke-width="3"/><path d="M512 92 L538 118 512 144 486 118Z" stroke-width="2"/>
        <path d="M92 1400 H330 M694 1400 H932" stroke-width="3"/>
      </g>
      <text x="82" y="94" fill="${card.accent}" font-size="27" letter-spacing="8" font-family="Georgia,serif">NO. ${card.number}</text>
      <text x="512" y="1305" text-anchor="middle" fill="url(#gold)" font-size="${titleSize}" font-weight="700" font-family="STKaiti,KaiTi,PingFang SC,serif" filter="url(#glow)">${escapeXml(card.name)}</text>
      <text x="512" y="1360" text-anchor="middle" fill="${card.accent}" font-size="30" letter-spacing="8" font-family="STKaiti,KaiTi,PingFang SC,serif">${escapeXml(card.title)}</text>
      <text x="512" y="1438" text-anchor="middle" fill="#f9e6a5" font-size="22" letter-spacing="10" font-family="Georgia,serif">ASTRAL COLLECTION</text>
    </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 92, alphaQuality: 96, effort: 6 }).toBuffer();
}

async function buildCard(card) {
  const directory = resolve(output, card.id);
  await mkdir(directory, { recursive: true });
  let backgroundSource;
  try {
    backgroundSource = await readFile(resolve(generated, card.background));
  } catch {
    // The generated PNGs are local production inputs. The checked-in online
    // WebP remains a reproducible fallback on another computer.
    backgroundSource = await readFile(resolve(directory, 'background.webp'));
  }
  const background = await sharp(backgroundSource)
    .resize(1024, 1536, { fit: 'cover' })
    .webp({ quality: 83, effort: 6 })
    .toBuffer();
  const petSource = resolve(root, 'vote-app', 'assets', 'pets', `${card.pet}.webp`);
  const sprite = await sharp(petSource)
    .resize(760, 760, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const subject = await sharp({ create: { width: 1024, height: 1536, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left: 132, top: 410 }])
    .webp({ quality: 92, alphaQuality: 96, effort: 6 })
    .toBuffer();
  const text = await renderTextLayer(card);
  const composed = await sharp(background)
    .composite([{ input: subject }, { input: text }])
    .png()
    .toBuffer();
  const thumbnail = await sharp(composed)
    .resize(320, 480, { fit: 'fill' })
    .webp({ quality: 84, effort: 6 })
    .toBuffer();

  const assets = { thumbnail, background, subject, text };
  for (const [name, bytes] of Object.entries(assets)) await writeFile(resolve(directory, `${name}.webp`), bytes);
  return {
    id: card.id,
    version: card.version || 1,
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
await mkdir(draftOutput, { recursive: true });
const rendered = [];
for (const card of cards) rendered.push(await buildCard(card));
const founderCard = bundledCatalog.cards.find(card => card.id === 'astra-stargazer-001');
const remoteCards = [founderCard, ...rendered].filter(Boolean);
const catalog = {
  version: 3,
  updatedAt: new Date().toISOString(),
  cards: remoteCards,
};
await writeFile(resolve(draftOutput, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`已生成 ${rendered.length} 张人气典藏卡草稿，草稿目录共 ${remoteCards.length} 张。`);
for (const card of rendered) console.log(`${card.number} ${card.name}: ${(card.assetBytes / 1024 / 1024).toFixed(2)} MiB`);
