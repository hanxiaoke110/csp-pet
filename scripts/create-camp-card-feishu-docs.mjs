#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'reports/camp-cards-extracted/manifest.json');
const OUT_PATH = path.join(ROOT, 'reports/camp-cards-extracted/feishu-docs.json');
const PARENT_TOKEN = 'UIqef45D2lc458dpuOqcu8CCnHe';
const MAIN_NAV_URL = 'https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg';

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function rel(file) {
  return path.relative(ROOT, path.resolve(ROOT, file));
}

function run(args, opts = {}) {
  const res = spawnSync('lark-cli', args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
    },
    timeout: opts.timeout ?? 120000,
  });
  if (res.status !== 0) {
    throw new Error(`lark-cli ${args.join(' ')}\n${res.stderr || res.stdout}`);
  }
  const text = res.stdout.trim();
  return text ? JSON.parse(text) : {};
}

function createDoc(title, xml) {
  const out = run([
    'docs', '+create',
    '--as', 'user',
    '--parent-token', PARENT_TOKEN,
    '--title', title,
    '--content', xml,
    '--json',
  ]);
  const doc = out.data?.document;
  if (!doc?.document_id) throw new Error(`Create failed: ${title}`);
  return {
    title,
    documentId: doc.document_id,
    url: doc.url || `https://scncdgmg7m6w.feishu.cn/docx/${doc.document_id}`,
  };
}

function setPublic(docId) {
  return run([
    'drive', 'permission.public', 'patch',
    '--as', 'user',
    '--token', docId,
    '--type', 'docx',
    '--data', JSON.stringify({
      external_access: true,
      invite_external: false,
      link_share_entity: 'anyone_readable',
      security_entity: 'only_full_access',
      share_entity: 'only_full_access',
      comment_entity: 'anyone_can_view',
    }),
    '--yes',
    '--json',
  ]);
}

function insertImage(docId, item) {
  const selection = `${item.p} ${item.topic}｜${item.roleCn}`;
  return run([
    'docs', '+media-insert',
    '--as', 'user',
    '--doc', docId,
    '--file', rel(item.file),
    '--type', 'image',
    '--align', 'center',
    '--width', '720',
    '--caption', `${item.p} ${item.topic}｜${item.roleCn}`,
    '--selection-with-ellipsis', selection,
    '--json',
  ], { timeout: 180000 });
}

function rowsFor(sheet) {
  return manifest
    .filter(x => x.sheet === sheet)
    .sort((a, b) => Number(a.p.replace(/\D/g, '')) - Number(b.p.replace(/\D/g, '')) || a.col - b.col);
}

function buildChildXml(sheet) {
  const items = rowsFor(sheet);
  const courseMap = new Map();
  for (const item of items) {
    const key = `${item.p} ${item.topic}`;
    if (!courseMap.has(key)) courseMap.set(key, []);
    courseMap.get(key).push(item);
  }

  const intro = sheet === '复赛'
    ? '复赛卡片按课程排列；部分课程区分学优与学中/学弱锦囊。'
    : '初赛卡片按课程排列，每节优先看课前预习，课后用锦囊回顾。';

  const parts = [
    `<p>${esc(intro)}</p>`,
    `<p><a href="${MAIN_NAV_URL}">返回：智子学习资料库｜CSP 学习导航</a></p>`,
    '<hr/>',
  ];

  for (const [course, courseItems] of courseMap) {
    parts.push(`<h2>${esc(course)}</h2>`);
    for (const item of courseItems) {
      parts.push(`<p><b>${esc(item.p)} ${esc(item.topic)}｜${esc(item.roleCn)}</b></p>`);
    }
    parts.push('<hr/>');
  }

  return parts.join('\n');
}

function buildNavXml(childDocs) {
  const link = title => childDocs.find(x => x.sheet === title)?.url;
  return [
    '<p>这里整理集训营配套的课前预习卡和课后锦囊卡。孩子可以先按自己所在班型进入对应页面，再按 P 课号查看卡片。</p>',
    '<p>课前预习用于上课前快速建立概念；课后锦囊用于课后复盘、查漏补缺。复赛班的锦囊里，部分课程分为学优和学中/学弱两个版本。</p>',
    '<table>',
    '<thead><tr><th background-color="light-gray">模块</th><th background-color="light-gray">适合对象</th><th background-color="light-gray">打开</th></tr></thead>',
    '<tbody>',
    `<tr><td>初赛40</td><td>40 课时初赛集训</td><td><a href="${link('初赛40')}">打开初赛40卡片</a></td></tr>`,
    `<tr><td>初赛60</td><td>60 课时初赛集训</td><td><a href="${link('初赛60')}">打开初赛60卡片</a></td></tr>`,
    `<tr><td>复赛</td><td>CSP-J 复赛训练</td><td><a href="${link('复赛')}">打开复赛卡片</a></td></tr>`,
    '</tbody>',
    '</table>',
    `<p><a href="${MAIN_NAV_URL}">返回：智子学习资料库｜CSP 学习导航</a></p>`,
  ].join('\n');
}

const childDocs = [];
for (const sheet of ['初赛40', '初赛60', '复赛']) {
  console.log(`Creating child doc: ${sheet}`);
  const doc = createDoc(`集训营卡片｜${sheet}`, buildChildXml(sheet));
  setPublic(doc.documentId);
  childDocs.push({ sheet, ...doc });

  const items = rowsFor(sheet);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`  [${i + 1}/${items.length}] ${item.p} ${item.topic} ${item.roleCn}`);
    insertImage(doc.documentId, item);
  }
}

console.log('Creating nav doc');
const navDoc = createDoc('集训营课前预习卡与课后锦囊｜总导航', buildNavXml(childDocs));
setPublic(navDoc.documentId);

const result = {
  createdAt: new Date().toISOString(),
  parentToken: PARENT_TOKEN,
  nav: navDoc,
  children: childDocs,
  imagePlacements: manifest.length,
};
fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
