import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'reports/learning-materials/course-cards-p70-p77');
const publishedPath = path.join(dir, 'published.json');
const published = fs.existsSync(publishedPath) ? JSON.parse(fs.readFileSync(publishedPath, 'utf8')) : null;
const files = fs.readdirSync(dir).filter(x => /^P7[0-7]-.*\.md$/.test(x)).sort();
if (files.length !== 8) throw new Error('必须有 P70–P77 八张草稿');
const cases = {
  70: [
    [['5', '15'], ['1', '1'], ['100', '5050'], ['0', '0']],
    [['8 12', '4'], ['12 8', '4'], ['7 13', '1'], ['6 0', '6']],
  ],
  71: [
    [['3', '3'], ['1', '1'], ['2', '2'], ['50', '20365011074']],
    [['12', '4'], ['8', '3'], ['2', '1'], ['13', '1']],
  ],
  72: [
    [['6 5\n3 1 1 1 2 1', '4'], ['3 5\n6 6 6', '0'], ['1 5\n5', '1'], ['4 4\n1 1 1 1', '4']],
    [['4 3 6 13\n5 3 12 6\n9 2 3', '6'], ['1 3 3 3\n1\n2 2 3', '2'], ['1 1 10 20\n1\n2', '0'], ['2 2 2000000000000000 2000000000000000\n1000000000000000 1000000000000000\n1000000000000000 1000000000000000', '4']],
  ],
  73: [
    [['2 9', '512'], ['12 5', '8832'], ['100000 1000000000', '0'], ['17 0', '1']],
    [['1', '1 从 A 到 C'], ['2', '1 从 A 到 B\n2 从 A 到 C\n1 从 B 到 C'], ['3', '1 从 A 到 C\n2 从 A 到 B\n1 从 C 到 B\n3 从 A 到 C\n1 从 B 到 A\n2 从 B 到 C\n1 从 A 到 C']],
  ],
  74: [
    [['290es1q0', '92100'], ['a100b9', '9100'], ['9', '9'], ['aaa1100', '1100']],
    [['6\n389 207 158 300 155 159', '2'], ['3\n5 5 5', '1'], ['3\n1 2 3', '3'], ['3\n3 2 1', '1']],
  ],
  75: [
    [['6\n0 5 1\n0 20 16\n0 7 23\n1 18 31\n1 4 38\n1 7 68', '32'], ['2\n0 5 1\n1 5 46', '5'], ['2\n0 5 1\n1 5 47', '10'], ['3\n0 5 1\n1 5 2\n1 5 3', '10'], ['3\n0 2 1\n0 5 2\n1 4 3', '7']],
    [['137', '2(2(2)+2+2(0))+2(2+2(0))+2(0)'], ['1', '2(0)'], ['2', '2'], ['10', '2(2+2(0))+2']],
  ],
  76: [
    [['8\n2 4\n1 2\n3 5\n1 3\n3 6\n4 7\n4 8', '1 4'], ['1', '1 1'], ['3\n3 2\n2 1', '3 3'], ['5\n1 2\n1 3\n2 4\n2 5', '1 3']],
    [['7\n4 0 0\n1 2 3\n6 0 7\n2 4 5\n5 0 0\n3 6 0\n7 0 0', '4 2 5 1 6 7 3'], ['1\n1 0 0', '1'], ['3\n1 0 0\n3 2 0\n2 1 0', '1 2 3'], ['5\n1 2 3\n2 4 5\n3 0 0\n4 0 0\n5 0 0', '4 2 5 1 3']],
  ],
  77: [
    [['6\n1 3\n1 8\n2\n1 5\n2\n2', '8 5 3'], ['4\n1 5\n1 5\n2\n2', '5 5'], ['2\n1 1000000000\n2', '1000000000']],
    [['3\n1 2 9', '15'], ['1\n7', '0'], ['4\n1 1 1 1', '8'], ['5\n5 8 12 15 20', '133']],
  ],
};
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-course-card-check-'));
const results = [];
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const normalize = s => s.trim().replace(/\s+/g, ' ');
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}
// Only the subset used in these authored cards; no raw HTML is accepted.
function render(md) {
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('```')) {
      const lang = line.slice(3);
      const block = [];
      while (++i < lines.length && !lines[i].startsWith('```')) block.push(lines[i]);
      out.push(`<pre aria-label="${esc(lang || '示意')}代码或示意"><code>${esc(block.join('\n'))}</code></pre>`);
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(' ');
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
    } else if (line.startsWith('|')) {
      const rows = [];
      do { rows.push(lines[i]); i++; } while (i < lines.length && lines[i].startsWith('|'));
      i--;
      out.push('<div class="table-scroll"><table>');
      rows.forEach((row, index) => {
        if (/^\|[ :|\-]+\|$/.test(row)) return;
        const tag = index === 0 ? 'th' : 'td';
        const cells = row.split('|').slice(1, -1).map(x => x.trim());
        out.push(`<tr>${cells.map(x => `<${tag}>${inline(x)}</${tag}>`).join('')}</tr>`);
      });
      out.push('</table></div>');
    } else if (line.startsWith('- ')) {
      const items = [];
      do { items.push(lines[i].slice(2)); i++; } while (i < lines.length && lines[i].startsWith('- '));
      i--;
      out.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`);
    } else out.push(`<p>${inline(line)}</p>`);
  }
  return out.join('\n');
}
try {
  const cards = [];
  for (const file of files) {
    const no = Number(file.match(/^P(\d+)/)[1]);
    const md = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const heading of ['一、本课要掌握什么', '二、核心知识卡', '三、完整例题与代码', '四、易错点', '五、先做再看', '六、配套练习']) {
      if (!md.includes(heading)) throw new Error(`${file} 缺少 ${heading}`);
    }
    const programs = [...md.matchAll(/```cpp\n([\s\S]*?)\n```/g)].map(x => x[1]);
    if (programs.length !== 2) throw new Error(`${file} 应有两个完整 C++ 程序`);
    for (let p = 0; p < programs.length; p++) {
      const source = path.join(temp, `p${no}-${p}.cpp`);
      const binary = path.join(temp, `p${no}-${p}`);
      fs.writeFileSync(source, programs[p]);
      const built = spawnSync(process.env.CXX || 'clang++', ['-std=c++17', '-Wall', '-Wextra', '-pedantic', source, '-o', binary], { encoding: 'utf8', timeout: 30000 });
      if (built.status !== 0 || built.error) throw new Error(`P${no} 程序 ${p + 1} 编译失败：${built.stderr || built.error}`);
      for (const [input, expected] of cases[no][p]) {
        const actual = spawnSync(binary, [], { input: input + '\n', encoding: 'utf8', timeout: 3000, maxBuffer: 1024 * 1024 });
        const passed = actual.status === 0 && !actual.error && normalize(actual.stdout) === normalize(expected);
        results.push({ lessonNo: no, program: p + 1, input, expected, actual: actual.stdout, passed });
        if (!passed) throw new Error(`P${no} 程序 ${p + 1} 样例失败：${JSON.stringify(results.at(-1))}`);
      }
    }
    const sha256 = createHash('sha256').update(md).digest('hex');
    const online = published?.state === 'published' && published.lessons.some(c => c.lessonNo === no && c.verified && c.sha256 === sha256);
    cards.push({ lessonNo: no, file, title: md.split('\n')[0].slice(2), status: online ? 'published' : 'local_draft', sha256, html: render(md) });
  }
  const allPublished = cards.every(c => c.status === 'published');
  const statusText = allPublished ? '已上线飞书及在线目录（依据发布回读记录）' : '本地草稿，尚未全部发布';
  const index = { schemaVersion: 1, state: allPublished ? 'published_verified' : 'local_drafts_not_published', cards: cards.map(({ html, ...card }) => card), programs: 16, cases: results.length, results };
  fs.writeFileSync(path.join(dir, 'validation.json'), JSON.stringify(index, null, 2) + '\n');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P70–P77 课堂资料草稿</title><style>
  :root{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;color:#233347;background:#f2f5f9}*{box-sizing:border-box}body{margin:0}header{padding:32px 24px;background:#143044;color:#fff}header div{max-width:900px;margin:auto}header p{color:#c6dce8}nav{max-width:948px;margin:24px auto;padding:0 24px;display:flex;gap:10px;flex-wrap:wrap}nav a{background:#fff;border:1px solid #cbd8e4;padding:8px 14px;border-radius:10px;text-decoration:none;color:#175777}main{max-width:948px;margin:auto;padding:0 24px 48px}article{padding:32px;margin:0 0 24px;background:#fff;border:1px solid #dce4ec;border-radius:16px;scroll-margin-top:16px}h1{font-size:28px}h2{font-size:20px;margin-top:32px;border-top:1px solid #e5ebf0;padding-top:20px}h3{font-size:17px;color:#175777}p,li{line-height:1.85}li{margin:6px 0}pre{background:#142b3b;color:#e5f3f8;border-radius:12px;padding:20px;overflow:auto;font-size:14px;line-height:1.65}code{font-family:ui-monospace,monospace}p code,li code{background:#edf4f8;padding:2px 5px;border-radius:4px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;border:1px solid #dce4ec;text-align:left;line-height:1.65}th{background:#eaf3f7}.table-scroll{overflow:auto}a{color:#126488}@media(max-width:600px){main{padding:0 12px 24px}article{padding:18px}h1{font-size:24px}}@media print{header,nav{display:none}body{background:white}article{break-before:page;border:0}pre{white-space:pre-wrap;color:black;background:#eee}h2,h3{break-after:avoid}}
  </style><header><div><h1>课堂资料 · P70–P77</h1><p>${statusText} · 8 课 · 16 段完整代码 · ${results.length} 项运行检查通过</p></div></header><nav aria-label="课次导航">${cards.map(c => `<a href="#p${c.lessonNo}">P${c.lessonNo}</a>`).join('')}</nav><main>${cards.map(c => `<article id="p${c.lessonNo}">${c.html}</article>`).join('')}</main></html>`;
  fs.writeFileSync(path.join(dir, 'preview.html'), html);
  console.log(`8 课结构检查通过，16 段 C++ 编译成功，${results.length} 项样例与边界用例全部通过。${statusText}。本次验证未调用在线 API。`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
