#!/usr/bin/env node
// 自动更新飞书「智子客户端更新」文档：只更新版本号/日期/更新说明/三个下载链接，
// 保留文档里已有的视频、图片、提醒、系统要求等手工内容。
//
// 用法：
//   node scripts/update-feishu-release-doc.mjs            # 自动抓最新版本并更新文档
//   node scripts/update-feishu-release-doc.mjs --dry-run  # 只打印将要执行的替换，不改文档
//
// 环境变量：
//   LARK_DOC_TOKEN  飞书文档 token（默认 VJmgd3RB0oOzPfxV9MxcKzzyn1b）
//   LARK_CLI_AS     身份：bot（默认）/ user
//   GITEE_REPO      Gitee 仓库（默认 hanliuliu110/csp-pet）

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';

const GITEE_REPO = process.env.GITEE_REPO || 'hanliuliu110/csp-pet';
const DOC_TOKEN = process.env.LARK_DOC_TOKEN || 'VJmgd3RB0oOzPfxV9MxcKzzyn1b';
const CLI_AS = process.env.LARK_CLI_AS || 'bot';
const DRY_RUN = process.argv.includes('--dry-run');
const SYNC_ATTACHMENTS = process.argv.includes('--sync-attachments');

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function runCli(args) {
  return execFileSync(
    'lark-cli',
    args,
    { encoding: 'utf8', env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' } },
  );
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'csp-update-doc' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// 1. 从 Gitee 找“带安装包资产”的最新 release（v1.7.31 只有源码包，要跳过）
async function getLatestRelease() {
  const releases = await fetchJson(
    `https://gitee.com/api/v5/repos/${GITEE_REPO}/releases?per_page=10`,
  );
  let latest = null;
  for (const r of releases) {
    const assets = (r.assets || []).map(a => a.name);
    const find = name => assets.find(n => n === name);
    const win = find(`CSP_${r.tag_name.replace('v', '')}_x64-setup.exe`);
    const macArm = find(`CSP_${r.tag_name.replace('v', '')}_aarch64.dmg`);
    const macIntel = find(`CSP_${r.tag_name.replace('v', '')}_x64.dmg`);
    if (win && macArm && macIntel) {
      // Gitee 列表按创建时间旧→新排列，取所有带安装包的 release 里最新的那个
      if (!latest || (r.created_at || '') > latest.date) {
        const url = name => `https://gitee.com/${GITEE_REPO}/releases/download/${r.tag_name}/${name}`;
        latest = {
          version: r.tag_name.replace(/^v/, ''),
          tag: r.tag_name,
          date: (r.created_at || '').slice(0, 10),
          win: { name: win, url: url(win) },
          macArm: { name: macArm, url: url(macArm) },
          macIntel: { name: macIntel, url: url(macIntel) },
        };
      }
    }
  }
  if (!latest) throw new Error('未找到带安装包资产的 release');
  return latest;
}

// 2. 从公告接口取该版本的更新说明（标题以 vX.Y.Z 开头的那条）
async function getChangelog(version) {
  try {
    const data = await fetchJson('https://api.cspstudy.top/api/announcements');
    const items = Array.isArray(data) ? data : (data.items || data.announcements || []);
    const match = items.find(a => (a.title || '').startsWith(`v${version}`));
    if (match?.content) return String(match.content).replace(/\n+/g, ' ').trim();
  } catch { /* 公告拉不到就用默认文案 */ }
  return `v${version} 版本更新，请查看客户端内公告了解详情。`;
}

// 3. 拉当前文档（with-ids），按文本特征找要替换的 block id
function findBlockId(xml, marker) {
  // 匹配 <tag id="..."> 且内容以 marker 开头的块
  const re = new RegExp(`<(h1|p|li)[^>]*id="([^"]+)"[^>]*>[^<]*${marker}`, 'i');
  const m = xml.match(re);
  if (!m) throw new Error(`未找到可更新的块：${marker}`);
  return m[2];
}

function buildReplacements(release, changelog) {
  return [
    { marker: '📦 最新版本：', content: `<h1>📦 最新版本：v${release.version}</h1>` },
    { marker: '更新日期：', content: `<p>更新日期：${release.date}</p>` },
    { marker: '本次更新：', content: `<p>本次更新：${esc(changelog)}</p>` },
    // 稳定直链走自有域名（api.cspstudy.top 代理最新安装包），避免 Gitee 附件域名
    // 被 Chrome 安全浏览标记为“危险网站”；URL 固定，发版后无需再改。
    { marker: '下载链接（Windows 10 版本）：', content: '<li>下载链接（Windows 10 版本）：<a href="https://api.cspstudy.top/dl/win">点此直接下载</a>（自动最新版）</li>' },
    { marker: '苹果电脑 M 芯片下载链接：', content: '<li>苹果电脑 M 芯片下载链接：<a href="https://api.cspstudy.top/dl/mac-arm">点此直接下载</a>（自动最新版）</li>' },
    { marker: '苹果电脑 Intel 芯片下载链接：', content: '<li>苹果电脑 Intel 芯片下载链接：<a href="https://api.cspstudy.top/dl/mac-intel">点此直接下载</a>（自动最新版）</li>' },
  ];
}

// 同步安装包附件：删除文档里旧版本的 CSP_*.exe/dmg 附件块，再上传最新版。
// 仅在 --sync-attachments 时执行（默认不动附件，保持轻量更新）。
async function syncAttachments(docXml, release) {
  const targets = [
    { marker: '下载链接（Windows 10 版本）：', file: release.win.name, url: release.win.url },
    { marker: '苹果电脑 M 芯片下载链接：', file: release.macArm.name, url: release.macArm.url },
    { marker: '苹果电脑 Intel 芯片下载链接：', file: release.macIntel.name, url: release.macIntel.url },
  ];

  // 1. 删除旧附件块（只匹配安装包，不动视频/图片）
  const oldIds = [];
  const re = /<source[^>]*id="([^"]+)"[^>]*name="(CSP_[^"]+\.(?:exe|dmg))"/g;
  let m;
  while ((m = re.exec(docXml))) oldIds.push(m[1]);
  if (oldIds.length > 0) {
    runCli([
      'docs', '+update', '--doc', DOC_TOKEN, '--command', 'block_delete',
      '--block-id', oldIds.join(','), '--as', CLI_AS,
    ]);
    console.log(`已删除旧安装包附件块：${oldIds.length} 个`);
  }

  // 2. 确保最新安装包已在本地（缺才下载，Gitee 源）
  mkdirSync('.tmp/doc-assets', { recursive: true });
  for (const t of targets) {
    const path = `.tmp/doc-assets/${t.file}`;
    if (!existsSync(path) || statSync(path).size === 0) {
      console.log(`下载 ${t.file} ...`);
      const res = await fetch(t.url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`下载 ${t.file} 失败 HTTP ${res.status}`);
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
  }

  // 3. 在对应下载链接后重新插入新附件卡片
  for (const t of targets) {
    runCli([
      'docs', '+media-insert', '--doc', DOC_TOKEN,
      '--file', `.tmp/doc-assets/${t.file}`,
      '--type', 'file', '--file-view', 'card',
      '--selection-with-ellipsis', t.marker,
      '--as', CLI_AS,
    ]);
    console.log(`已上传新附件：${t.file}`);
  }
}

async function main() {
  const release = await getLatestRelease();
  const changelog = await getChangelog(release.version);
  const replacements = buildReplacements(release, changelog);

  console.log(`最新版本：v${release.version}（${release.date}）`);
  console.log(`Windows：${release.win.url}`);
  console.log(`Mac ARM：${release.macArm.url}`);
  console.log(`Mac Intel：${release.macIntel.url}`);

  const fetchOut = JSON.parse(runCli([
    'docs', '+fetch', '--doc', DOC_TOKEN, '--detail', 'with-ids', '--as', CLI_AS,
  ]));
  const xml = fetchOut.data.document.content;

  if (DRY_RUN) {
    console.log('\n===== 将执行的 block_replace =====');
    for (const r of replacements) {
      console.log(`- ${r.marker} -> ${r.content.slice(0, 100)}...`);
    }
    return;
  }

  for (const r of replacements) {
    const blockId = findBlockId(xml, r.marker);
    const out = runCli([
      'docs', '+update', '--doc', DOC_TOKEN, '--command', 'block_replace',
      '--block-id', blockId, '--content', r.content, '--as', CLI_AS,
    ]);
    const parsed = JSON.parse(out);
    if (!parsed.ok) throw new Error(`更新 ${r.marker} 失败：${JSON.stringify(parsed.error || parsed)}`);
    console.log(`已更新：${r.marker}`);
  }

  if (SYNC_ATTACHMENTS) {
    await syncAttachments(xml, release);
  }

  console.log(`\n文档地址：https://scncdgmg7m6w.feishu.cn/docx/${DOC_TOKEN}`);
}

main().catch(err => {
  console.error('更新失败：', err.message);
  process.exit(1);
});
