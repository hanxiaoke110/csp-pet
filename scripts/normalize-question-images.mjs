// 把题干里的 Markdown 图片 ![alt](url) 提取到 image 字段，并从 question 文本移除。
// - gitee raw 链接 .../public/course-data/X -> 本地 /course-data/X（本地文件存在时更稳定）
// - 仅处理源题库；dist/dist-dungeon 由构建再生成
// 幂等：无 markdown 图片则跳过
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const FILES = [
  'public/course-data/unified-quiz-bank.json',
  'public/course-data/csp-exam-bank.json',
  'src-dungeon/data/csp-exam-bank.json',
  'public/course-data/quiz-bank.json',
].filter(f => fs.existsSync(path.join(root, f)));

const MD_IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

function entriesFor(data) {
  if (Array.isArray(data)) return data.map((q, i) => [String(i), q]);
  if (Array.isArray(data.questions)) return data.questions.map((q, i) => [String(i), q]);
  if (Array.isArray(data.items)) return data.items.map((q, i) => [String(i), q]);
  if (data && typeof data === 'object') return Object.entries(data);
  return [];
}

// gitee raw .../public/course-data/X.svg -> /course-data/X.svg
function toLocalUrl(url) {
  const m = String(url).match(/\/public\/(course-data\/[^?#)]+)/);
  if (m) return '/' + m[1];
  return url;
}

function localExists(p) {
  if (/^https?:/.test(p)) return true; // 远程不校验
  const rel = p.replace(/^\/+/, '');
  return fs.existsSync(path.join(root, 'public', rel)) || fs.existsSync(path.join(root, rel));
}

function normalizeFile(file) {
  const abs = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const entries = entriesFor(data);
  let extracted = 0;
  const details = [];

  for (const [key, q] of entries) {
    if (!q || typeof q !== 'object') continue;
    const stem = String(q.question || '');
    if (!/!\[/.test(stem)) continue;

    MD_IMG_RE.lastIndex = 0;
    const imgs = [];
    let m;
    while ((m = MD_IMG_RE.exec(stem))) imgs.push({ alt: m[1], url: m[2], raw: m[0] });
    if (!imgs.length) continue;

    const first = imgs[0];
    const localUrl = toLocalUrl(first.url);
    const existed = localExists(localUrl);

    // 设置 image 字段（若已有非空 image 则保留原值，仅清理题干 markdown）
    if (!q.image) q.image = localUrl;
    if ('hasImage' in q) q.hasImage = true;

    // 从题干移除所有 markdown 图片，整理尾部空白
    let newStem = stem;
    for (const im of imgs) newStem = newStem.split(im.raw).join('');
    newStem = newStem.replace(/[ \t]*\n{2,}$/g, '').replace(/\n{3,}/g, '\n\n').trim();
    q.question = newStem;

    extracted += 1;
    details.push({ id: q.id || key, image: q.image, localExists: existed });
  }

  if (extracted) fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n');
  return { file, extracted, details };
}

let total = 0;
for (const f of FILES) {
  const r = normalizeFile(f);
  total += r.extracted;
  console.log(`${r.file}: extracted=${r.extracted}`);
  for (const d of r.details) console.log(`  - ${d.id} -> image=${d.image} (localExists=${d.localExists})`);
}
console.log(`total extracted: ${total}`);
