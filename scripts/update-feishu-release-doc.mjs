#!/usr/bin/env node
// 自动更新飞书「智子客户端更新」文档（最新版本 + 安装包 + 使用视频）。
//
// 用法：
//   node scripts/update-feishu-release-doc.mjs            # 自动抓最新版本并更新文档
//   node scripts/update-feishu-release-doc.mjs --dry-run  # 只打印将写入的内容，不改文档
//
// 环境变量：
//   LARK_DOC_TOKEN  飞书文档 token（默认 VJmgd3RB0oOzPfxV9MxcKzzyn1b）
//   LARK_CLI_AS     身份：bot（默认）/ user
//   GITEE_REPO      Gitee 仓库（默认 hanliuliu110/csp-pet）
//
// 说明：使用 overwrite 整篇重建，文档结构完全由本脚本生成（无图片/评论，重建无副作用）。

import { execFileSync } from 'node:child_process';

const GITEE_REPO = process.env.GITEE_REPO || 'hanliuliu110/csp-pet';
const DOC_TOKEN = process.env.LARK_DOC_TOKEN || 'VJmgd3RB0oOzPfxV9MxcKzzyn1b';
const CLI_AS = process.env.LARK_CLI_AS || 'bot';
const VIDEO_URL = 'https://t.eeo.cn/3adWa=.1';
const DRY_RUN = process.argv.includes('--dry-run');

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function buildXml(release, changelog) {
  return [
    '<title>智子客户端更新</title>',
    `<h1>📦 最新版本：v${release.version}</h1>`,
    `<p>更新日期：${release.date}</p>`,
    `<p>本次更新：${esc(changelog)}</p>`,
    '<h1>⬇️ 最新安装包下载</h1>',
    `<p>Windows 电脑：<a href="${release.win.url}">${release.win.name}（Windows 安装包）</a></p>`,
    `<p>Mac（Apple 芯片 M 系列）：<a href="${release.macArm.url}">${release.macArm.name}</a></p>`,
    `<p>Mac（Intel 芯片）：<a href="${release.macIntel.url}">${release.macIntel.name}</a></p>`,
    '<h1>🎬 使用视频</h1>',
    `<p><a href="${VIDEO_URL}">点击观看使用视频</a></p>`,
  ].join('\n');
}

async function main() {
  const release = await getLatestRelease();
  const changelog = await getChangelog(release.version);
  const xml = buildXml(release, changelog);

  console.log(`最新版本：v${release.version}（${release.date}）`);
  console.log(`Windows：${release.win.url}`);
  console.log(`Mac ARM：${release.macArm.url}`);
  console.log(`Mac Intel：${release.macIntel.url}`);

  if (DRY_RUN) {
    console.log('\n===== 将写入的 XML =====\n' + xml);
    return;
  }

  const out = execFileSync(
    'lark-cli',
    [
      'docs', '+update',
      '--doc', DOC_TOKEN,
      '--command', 'overwrite',
      '--content', xml,
      '--as', CLI_AS,
    ],
    { encoding: 'utf8', env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' } },
  );
  console.log('\n飞书文档更新结果：');
  console.log(out.trim());
  console.log(`\n文档地址：https://scncdgmg7m6w.feishu.cn/docx/${DOC_TOKEN}`);
}

main().catch(err => {
  console.error('更新失败：', err.message);
  process.exit(1);
});
