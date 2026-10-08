import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'design/wardrobe-v2');
const output = resolve(root, 'cloud-assets-source/wardrobe/v2');

const imageItems = [
  ['frame-canglong-leihuan', 'frame', '苍龙雷环', 'legendary', 'coin', 880, 'frames/canglong-leihuan.png', 'frames/canglong-leihuan.webp'],
  ['frame-xingqiong-shengmian', 'frame', '星穹圣冕', 'mythic', 'condition', 300, 'frames/xingqiong-shengmian.png', 'frames/xingqiong-shengmian.webp'],
  ['frame-nihong-haike', 'frame', '霓虹骇客', 'epic', 'coin', 620, 'frames/nihong-haike.png', 'frames/nihong-haike.webp'],
  ['frame-yingtang-tuhuan', 'frame', '樱糖兔环', 'rare', 'coin', 420, 'frames/yingtang-tuhuan.png', 'frames/yingtang-tuhuan.webp'],
  ['frame-yunduo-maozhua', 'frame', '云朵猫爪', 'epic', 'condition', 100, 'frames/yunduo-maozhua.png', 'frames/yunduo-maozhua.webp'],
  ['background-yinhe-wangzuo', 'background', '银河王座', 'mythic', 'condition', 5, 'backgrounds/yinhe-wangzuo.png', 'backgrounds/yinhe-wangzuo.webp'],
  ['background-chiyan-shendian', 'background', '赤焰神殿', 'legendary', 'coin', 780, 'backgrounds/chiyan-shendian.png', 'backgrounds/chiyan-shendian.webp'],
  ['background-jiguang-bingjing', 'background', '极光冰境', 'legendary', 'coin', 780, 'backgrounds/jiguang-bingjing.png', 'backgrounds/jiguang-bingjing.webp'],
  ['background-tianmeng-youleyuan', 'background', '甜梦游乐园', 'rare', 'coin', 460, 'backgrounds/tianmeng-youleyuan.png', 'backgrounds/tianmeng-youleyuan.webp'],
  ['pendant-fuyou-xingren', 'pendant', '浮游星刃', 'epic', 'coin', 520, 'pendants/fuyou-xingren.png', 'pendants/fuyou-xingren.webp'],
  ['pendant-liangzi-mofang', 'pendant', '量子魔方', 'legendary', 'condition', 10, 'pendants/liangzi-mofang.png', 'pendants/liangzi-mofang.webp'],
  ['pendant-naicha-jingling', 'pendant', '奶茶精灵', 'rare', 'coin', 360, 'pendants/naicha-jingling.png', 'pendants/naicha-jingling.webp'],
];

const effectItems = [
  ['effect-leiting-jiamian', '雷霆加冕', 'mythic', 'condition', 8, '#65eaff', '#ffe782'],
  ['effect-xinghe-yueqian', '星河跃迁', 'legendary', 'coin', 980, '#8de9ff', '#c59aff'],
  ['effect-lieyan-canyi', '烈焰残翼', 'legendary', 'coin', 980, '#ff783f', '#ffd36f'],
  ['effect-bingjing-shiting', '冰晶时停', 'epic', 'coin', 720, '#8cecff', '#d7f8ff'],
  ['effect-caihong-paopao', '彩虹泡泡', 'rare', 'coin', 480, '#ff9bd8', '#8cecff'],
];

const titleItems = [
  ['title-xingqiong-zhuzai', '星穹主宰', 'mythic', 'condition', 10, 'gold-sweep', '#f8d66b', '#6deaff'],
  ['title-pojie-xianqu', '破界先驱', 'epic', 'coin', 680, 'rift-glitch', '#d98cff', '#5ce8ff'],
  ['title-xingyun-xiaofuxing', '幸运小福星', 'rare', 'coin', 380, 'lucky-stars', '#ffd86a', '#ff9ccf'],
];

function metricCondition(metric, value, description) {
  return { type: 'condition', description, condition: { type: 'metric', metric, operator: 'gte', value } };
}

function acquisition(kind, value, id) {
  if (kind === 'coin') return { type: 'coin', price: value };
  if (id === 'frame-xingqiong-shengmian') return metricCondition('quizCorrect', 300, '累计答对 300 道选择题');
  if (id === 'frame-yunduo-maozhua') return metricCondition('highestPetAffection', 100, '任意智子好感达到 100');
  if (id === 'background-yinhe-wangzuo') return metricCondition('collectorCardCount', 5, '永久收藏 5 张典藏卡');
  if (id === 'pendant-liangzi-mofang') return metricCondition('mazeClearCount', 10, '累计完成 10 张不同迷宫');
  if (id === 'effect-leiting-jiamian') return metricCondition('dungeonMazeCoverage', 8, '八个副本各完成至少 1 张迷宫');
  return metricCondition('achievementCount', value, '累计解锁 10 项成就');
}

function particles(id, color, secondaryColor, placement = 'front', count = 12, size = 5) {
  return { id, primitive: 'particle', placement, animation: 'pulse', color, secondaryColor, blendMode: 'screen', opacity: .7, durationMs: 3600, count, size, avoidSafeZone: true };
}

function ornamentVisual(id, category) {
  if (category === 'frame') return {
    rendererVersion: 2,
    safeZone: { x: 25, y: 20, width: 50, height: 50 },
    layers: [
      particles('edge-stars', id.includes('yingtang') ? '#ff9fc8' : id.includes('yunduo') ? '#ffe37c' : '#82eaff', '#fff1a6', 'front', 9, 4),
      { id: 'soft-sweep', primitive: 'light-sweep', placement: 'front', animation: 'sweep', color: '#ffffff', blendMode: 'screen', x: 50, y: 43, width: 78, height: 67, opacity: .2, durationMs: 5200, avoidSafeZone: true },
      { id: 'tap-flare', primitive: 'click-burst', placement: 'front', animation: 'burst', color: '#7eeaff', secondaryColor: '#ffe483', x: 50, y: 44, width: 62, height: 62, opacity: .58 },
    ],
  };
  if (category === 'background') return {
    rendererVersion: 2,
    safeZone: { x: 23, y: 18, width: 54, height: 56 },
    layers: [
      particles('ambient-dust', id.includes('chiyan') ? '#ff8b50' : id.includes('tianmeng') ? '#ffb6e2' : '#94eaff', '#ffe8a1', 'background', 11, 3),
      { id: 'depth-glow', primitive: 'glow', placement: 'behind-avatar', animation: 'pulse', color: id.includes('chiyan') ? '#ff592e' : '#72ddff', x: 50, y: 42, width: 70, height: 58, opacity: .38, durationMs: 4200 },
    ],
  };
  return {
    rendererVersion: 2,
    safeZone: { x: 25, y: 18, width: 50, height: 56 },
    layers: [
      { id: 'pendant-orbit', primitive: 'orbit', placement: 'front', animation: 'spin', color: id.includes('naicha') ? '#ffd785' : '#72e7ff', secondaryColor: id.includes('naicha') ? '#ff9fc8' : '#d9a1ff', x: 79, y: 32, width: 26, height: 26, opacity: .56, durationMs: 7200 },
      particles('pendant-sparks', id.includes('naicha') ? '#ffd87b' : '#7feaff', '#ffffff', 'front', 6, 4),
    ],
  };
}

function effectVisual(id, color, secondaryColor) {
  const isFlame = id.includes('lieyan');
  const isBubble = id.includes('paopao');
  return {
    rendererVersion: 2,
    safeZone: { x: 24, y: 18, width: 52, height: 56 },
    layers: [
      { id: 'aura', primitive: 'glow', placement: 'behind-avatar', animation: 'pulse', color, secondaryColor, x: 50, y: 43, width: 72, height: 64, opacity: isFlame ? .38 : .3, durationMs: 3200 },
      { id: 'energy-ring', primitive: 'orbit', placement: 'behind-avatar', animation: 'spin', color, secondaryColor, blendMode: 'screen', x: 50, y: 43, width: 66, height: 66, opacity: .62, durationMs: isBubble ? 11000 : 7600 },
      particles('energy-particles', color, secondaryColor, 'front', isBubble ? 18 : 14, isBubble ? 9 : 5),
      { id: 'edge-light', primitive: 'light-sweep', placement: 'front', animation: 'sweep', color: secondaryColor, blendMode: 'screen', x: 50, y: 43, width: 82, height: 70, opacity: .22, durationMs: 4700, avoidSafeZone: true },
      { id: 'tap-impact', primitive: 'click-burst', placement: 'front', animation: 'burst', color, secondaryColor, blendMode: 'screen', x: 50, y: 43, width: 72, height: 72, opacity: .72 },
    ],
  };
}

function previewSvg(name, rarity, color, secondaryColor, kind) {
  const icon = kind === 'effect' ? '✦' : '◆';
  return Buffer.from(`<svg width="720" height="560" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="b"><stop stop-color="${color}" stop-opacity=".42"/><stop offset="1" stop-color="#07162e"/></radialGradient><linearGradient id="g"><stop stop-color="${color}"/><stop offset=".52" stop-color="${secondaryColor}"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
    <rect width="720" height="560" rx="42" fill="#07162e"/><rect x="18" y="18" width="684" height="524" rx="34" fill="url(#b)" stroke="${color}" stroke-opacity=".6" stroke-width="3"/>
    <circle cx="360" cy="220" r="116" fill="none" stroke="${secondaryColor}" stroke-opacity=".55" stroke-width="3" stroke-dasharray="12 18"/><circle cx="360" cy="220" r="83" fill="none" stroke="${color}" stroke-opacity=".75" stroke-width="4"/>
    <text x="360" y="260" text-anchor="middle" font-size="116" fill="url(#g)" font-family="serif">${icon}</text><text x="360" y="412" text-anchor="middle" font-size="52" font-weight="700" fill="#fff4cf" font-family="PingFang SC, sans-serif">${name}</text><text x="360" y="462" text-anchor="middle" font-size="23" fill="${color}" letter-spacing="8" font-family="sans-serif">${rarity.toUpperCase()}</text>
  </svg>`);
}

async function writeWebp(input, target, category) {
  await mkdir(dirname(target), { recursive: true });
  const pipeline = category === 'pendant' ? sharp(await cleanDarkBackdrop(input)) : sharp(input);
  if (category === 'background') pipeline.resize(720, 1080, { fit: 'cover' });
  else pipeline.resize(720, 720, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  await pipeline.webp({ quality: category === 'background' ? 78 : 82, alphaQuality: 92, effort: 6 }).toFile(target);
}

async function cleanDarkBackdrop(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    const brightness = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    if (brightness <= 22) data[offset + 3] = 0;
    else if (brightness < 58) data[offset + 3] = Math.min(data[offset + 3], Math.round((brightness - 22) / 36 * 255));
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function createImageThumbnail(input, target, category) {
  await mkdir(dirname(target), { recursive: true });
  if (category === 'background') {
    await sharp(input).resize(480, 360, { fit: 'cover', position: 'centre' }).webp({ quality: 76, effort: 6 }).toFile(target);
    return;
  }
  const foregroundInput = category === 'pendant' ? await cleanDarkBackdrop(input) : input;
  const foreground = await sharp(foregroundInput).resize(category === 'frame' ? 318 : 260, category === 'frame' ? 318 : 260, {
    fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
  const backdrop = Buffer.from(`<svg width="480" height="360" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="r"><stop stop-color="#245a83"/><stop offset="1" stop-color="#06152c"/></radialGradient></defs><rect width="480" height="360" fill="url(#r)"/><circle cx="240" cy="175" r="106" fill="#0d2b4d" stroke="#65dff0" stroke-opacity=".35" stroke-width="2"/></svg>`);
  await sharp(backdrop).composite([{ input: foreground, gravity: 'center' }]).webp({ quality: 80, alphaQuality: 90, effort: 6 }).toFile(target);
}

const items = [];
for (const [id, category, name, rarity, kind, value, sourceRelative, outputRelative] of imageItems) {
  const input = resolve(source, sourceRelative);
  const assetTarget = resolve(output, outputRelative);
  const thumbnailRelative = `thumbnails/${id}.webp`;
  await writeWebp(input, assetTarget, category);
  await createImageThumbnail(input, resolve(output, thumbnailRelative), category);
  items.push({
    id, version: 1, category, name, rarity, acquisition: acquisition(kind, value, id),
    asset: `./${outputRelative}`, thumbnail: `./${thumbnailRelative}`, minRendererVersion: 2, available: true,
    visual: ornamentVisual(id, category),
  });
}

for (const [id, name, rarity, kind, value, color, secondaryColor] of effectItems) {
  const thumbnailRelative = `thumbnails/${id}.webp`;
  await sharp(previewSvg(name, rarity, color, secondaryColor, 'effect')).webp({ quality: 80, effort: 6 }).toFile(resolve(output, thumbnailRelative));
  items.push({ id, version: 1, category: 'effect', name, rarity, acquisition: acquisition(kind, value, id), thumbnail: `./${thumbnailRelative}`, minRendererVersion: 2, available: true, visual: effectVisual(id, color, secondaryColor) });
}

for (const [id, name, rarity, kind, value, titleEffect, color, secondaryColor] of titleItems) {
  const thumbnailRelative = `thumbnails/${id}.webp`;
  await sharp(previewSvg(name, rarity, color, secondaryColor, 'title')).webp({ quality: 80, effort: 6 }).toFile(resolve(output, thumbnailRelative));
  items.push({ id, version: 1, category: 'title', name, rarity, acquisition: acquisition(kind, value, id), thumbnail: `./${thumbnailRelative}`, minRendererVersion: 2, available: true, visual: { rendererVersion: 2, layers: [], titleEffect } });
}

async function assetMetadata(relative) {
  const bytes = await readFile(resolve(output, relative.replace(/^\.\//, '')));
  return { bytes: bytes.byteLength, checksum: createHash('sha256').update(bytes).digest('hex') };
}

for (const item of items) {
  if (item.asset) {
    const meta = await assetMetadata(item.asset);
    item.assetBytes = meta.bytes;
    item.checksum = meta.checksum;
  }
  if (item.thumbnail) {
    const meta = await assetMetadata(item.thumbnail);
    item.thumbnailBytes = meta.bytes;
    item.thumbnailChecksum = meta.checksum;
  }
}

const catalog = { schemaVersion: 2, rendererVersion: 2, version: 1, updatedAt: new Date().toISOString(), items };
await writeFile(resolve(output, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
const bytes = (await Promise.all(items.flatMap(item => [item.asset, item.thumbnail].filter(Boolean).map(path => readFile(resolve(output, path.replace(/^\.\//, ''))))))).reduce((sum, file) => sum + file.byteLength, 0);
console.log(`星相衣橱 v2 已生成：${items.length} 件，${(bytes / 1024 / 1024).toFixed(2)} MiB`);
