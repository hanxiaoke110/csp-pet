#!/usr/bin/env node
/**
 * 飞书文档排版优化脚本
 *
 * 为所有学习资料文档添加统一格式：面包屑导航、返回总导航链接、一致的标题格式。
 * 使文档既可用于桌宠项目集成，也可给孩子直接打开观看。
 *
 * 用法：
 *   # 先 dry-run（只预览变更不写）
 *   node scripts/feishu-format.mjs --dry-run
 *
 *   # 格式化所有文档
 *   node scripts/feishu-format.mjs --execute
 *
 *   # 只格式化单个文档
 *   node scripts/feishu-format.mjs --execute --doc-id PDtpdjcijoyjbDxPVDscY93onMh
 *
 *   # 格式化总导航文档
 *   node scripts/feishu-format.mjs --execute --nav-only --nav-doc-id YOUR_NAV_DOC_ID
 *
 * 凭证：从 .env.feishu 读取
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LINKS_PATH = path.join(ROOT, 'reports/lark-learning-resources/feishu-doc-links.json');
const LEARNING_RES_PATH = path.join(ROOT, 'public/course-data/learning-resources.json');

// Load env
function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv(path.join(ROOT, '.env.feishu'));
const APP_ID = env.FEISHU_APP_ID;
const APP_SECRET = env.FEISHU_APP_SECRET;
const BASE = 'https://open.feishu.cn/open-apis';

// ============================================================
// Auth
// ============================================================

let _tokenCache = null;
let _tokenExpires = 0;

async function getToken() {
  if (_tokenCache && Date.now() < _tokenExpires - 60000) return _tokenCache;
  const res = await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Auth error: ${data.msg}`);
  _tokenCache = data.tenant_access_token;
  _tokenExpires = Date.now() + (data.expire || 7200) * 1000;
  return _tokenCache;
}

async function api(method, endpoint, body) {
  const T = await getToken();
  const opts = { method, headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const url = endpoint.startsWith('http') ? endpoint : `${BASE}${endpoint}`;
  const res = await fetch(url, opts);
  return res.json();
}

function ok(data) { return data && data.code === 0; }

// ============================================================
// Document formatting
// ============================================================

// Get all blocks for a document
async function getBlocks(docId) {
  const res = await api('GET', `/docx/v1/documents/${docId}/blocks?page_size=500`);
  if (!ok(res)) return null;
  return res.data;
}

// Delete all children under a block
async function clearBlockChildren(docId, blockId, excludeStartAndEnd = true) {
  const childrenIds = [];
  try {
    const res = await api('GET', `/docx/v1/documents/${docId}/blocks/${blockId}/children?page_size=100`);
    if (ok(res) && res.data?.items) {
      childrenIds.push(...res.data.items.map(b => b.block_id));
    }
  } catch (e) { return; }

  if (childrenIds.length === 0) return;

  // Batch delete in groups of 50
  for (let i = 0; i < childrenIds.length; i += 50) {
    const batch = childrenIds.slice(i, i + 50);
    await api('DELETE', `/docx/v1/documents/${docId}/blocks/${blockId}/children/batch_delete`, {
      start_index: 0,
      end_index: batch.length,
    });
  }
}

// Add children blocks to a parent
async function addBlocks(docId, parentBlockId, blocks) {
  const res = await api('POST', `/docx/v1/documents/${docId}/blocks/${parentBlockId}/children`, {
    children: blocks,
    index: 0, // add to end
  });
  return res;
}

// Build a text element
function textRun(content, style = {}) {
  return {
    text_run: {
      content,
      text_element_style: style,
    },
  };
}

// Build a link text element
function linkRun(content, url) {
  return textRun(content, {
    link: { url },
    text_color: 2, // blue link
    underline: true,
  });
}

// Build a text block
function textBlock(elements, align = 1) {
  return {
    block_type: 2, // text
    text: {
      elements: Array.isArray(elements) ? elements : [elements],
      style: { align },
    },
  };
}

// Build a heading block
function headingBlock(level, content, align = 1) {
  return {
    block_type: 2 + level, // heading1=3, heading2=4, ..., heading9=11
    [`heading${level}`]: {
      elements: [textRun(content, { bold: true })],
      style: { align },
    },
  };
}

// Build a divider (text block with horizontal rule style, since divider block_type is not creatable via children API)
function dividerBlock() {
  return {
    block_type: 2, // text - use text block as separator since divider can't be added as child
    text: {
      elements: [{ text_run: { content: '', text_element_style: {} } }],
      style: {},
    },
  };
}

// Build a visual separator line
function separatorBlock() {
  return {
    block_type: 2,
    text: {
      elements: [{ text_run: { content: '━━━━━━━━━━━━━━━━━━━━━━', text_element_style: { text_color: 5 } } }],
      style: {},
    },
  };
}

// Build a bullet item
function bulletBlock(elements) {
  return {
    block_type: 12, // bullet
    bullet: {
      elements: Array.isArray(elements) ? elements : [elements],
      style: {},
    },
  };
}

// Build a callout (提示框)
function calloutBlock(content, color = 4) {
  return {
    block_type: 16, // callout
    callout: {
      elements: [textRun(content)],
      style: { color },
    },
  };
}

// ============================================================
// Document templates
// ============================================================

const MAIN_NAV_TITLE = '智子学习资料库｜CSP 学习导航';

function makeBreadcrumb(pathParts, navUrl) {
  // pathParts: array of { label, url? }
  const elements = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (i > 0) elements.push(textRun('  >  ', { text_color: 1 })); // gray separator
    const part = pathParts[i];
    if (part.url) {
      elements.push(linkRun(part.label, part.url));
    } else {
      elements.push(textRun(part.label, { bold: true }));
    }
  }
  return textBlock(elements);
}

// Template for a lecture card document (P01-P71 style)
function lectureCardTemplate(docTitle, lessonNo, stage, level, description, navUrl, tags) {
  const blocks = [];

  // Breadcrumb
  const bc = [
    { label: MAIN_NAV_TITLE, url: navUrl },
    { label: 'CSP-J 初赛', url: '' },
    { label: `课程线：${stage}`, url: '' },
    { label: docTitle, url: '' },
  ];
  blocks.push(makeBreadcrumb(bc, navUrl));
  blocks.push(dividerBlock());

  // Title
  blocks.push(headingBlock(1, docTitle, 2));

  // Meta info
  blocks.push(textBlock([
    textRun('📘 课程讲义  ', { bold: true, text_color: 3 }),
    textRun(`P${lessonNo}  `, { bold: true }),
    textRun(`|  ${stage}  `, { text_color: 1 }),
    textRun(`|  ${level}`, { text_color: 1 }),
  ]));

  if (tags && tags.length > 0) {
    blocks.push(textBlock([
      textRun('🏷️ ', { text_color: 1 }),
      textRun(tags.join('  ·  '), { text_color: 1 }),
    ]));
  }

  // Description
  if (description) {
    blocks.push(calloutBlock(`📖 ${description}`));
  }

  // Placeholder / 即将上线
  blocks.push(dividerBlock());
  blocks.push(headingBlock(2, '📋 内容即将上线'));
  blocks.push(textBlock([textRun('本讲义正在精心制作中。上线后你将看到：')]));
  blocks.push(bulletBlock([textRun('知识点的详细讲解与图示', { bold: true })])
  );
  blocks.push(bulletBlock([textRun('交互式例题与代码演示')]));
  blocks.push(bulletBlock([textRun('常见陷阱与解题技巧')]));
  blocks.push(bulletBlock([textRun('配套练习题')]));

  blocks.push(dividerBlock());
  blocks.push(textBlock([
    textRun('内容更新后无需重新安装或更新桌宠，刷新即可查看最新版本。', { text_color: 1 }),
  ]));

  // Footer navigation
  blocks.push(dividerBlock());
  blocks.push(textBlock([
    linkRun(`← 返回总导航：${MAIN_NAV_TITLE}`, navUrl),
  ]));
  blocks.push(textBlock([
    textRun('💡 提示：', { text_color: 1 }),
    textRun('收藏总导航链接，即使不打开桌宠也能随时学习。', { text_color: 1 }),
  ]));

  return blocks;
}

// Template for fable card document
function fableCardTemplate(docTitle, stage, description, navUrl, tags) {
  const blocks = [];

  const bc = [
    { label: MAIN_NAV_TITLE, url: navUrl },
    { label: 'CSP-J 初赛', url: '' },
    { label: '寓言与记忆卡', url: '' },
    { label: docTitle, url: '' },
  ];
  blocks.push(makeBreadcrumb(bc, navUrl));
  blocks.push(dividerBlock());
  blocks.push(headingBlock(1, docTitle, 2));
  blocks.push(textBlock([
    textRun('🐉 寓言记忆卡  ', { bold: true, text_color: 6 }),
    textRun(`|  ${stage}`, { text_color: 1 }),
  ]));

  if (description) blocks.push(calloutBlock(`📖 ${description}`));

  blocks.push(dividerBlock());
  blocks.push(headingBlock(2, '📋 内容即将上线'));
  blocks.push(textBlock([textRun('通过生动有趣的寓言故事，帮你建立编程概念的直觉。')]));

  if (tags && tags.length > 0) {
    blocks.push(textBlock([textRun('🏷️ ' + tags.join('  ·  '), { text_color: 1 })]));
  }

  blocks.push(dividerBlock());
  blocks.push(textBlock([linkRun(`← 返回总导航：${MAIN_NAV_TITLE}`, navUrl)]));

  return blocks;
}

// Template for practice document
function practiceCardTemplate(docTitle, stage, description, navUrl) {
  const blocks = [];

  const bc = [
    { label: MAIN_NAV_TITLE, url: navUrl },
    { label: 'CSP-J 初赛', url: '' },
    { label: '配套练习', url: '' },
    { label: docTitle, url: '' },
  ];
  blocks.push(makeBreadcrumb(bc, navUrl));
  blocks.push(dividerBlock());
  blocks.push(headingBlock(1, docTitle, 2));
  blocks.push(textBlock([textRun('✏️ 配套练习  ', { bold: true, text_color: 4 }), textRun(`|  ${stage}`, { text_color: 1 })]));
  if (description) blocks.push(calloutBlock(`📖 ${description}`));
  blocks.push(dividerBlock());
  blocks.push(headingBlock(2, '📋 内容即将上线'));
  blocks.push(textBlock([textRun('练习题正在准备中，完成后包含例题精讲和配套练习。')]));
  blocks.push(dividerBlock());
  blocks.push(textBlock([linkRun(`← 返回总导航：${MAIN_NAV_TITLE}`, navUrl)]));

  return blocks;
}

// Template for review document
function reviewCardTemplate(docTitle, stage, description, navUrl, requiresClassCode) {
  const blocks = [];

  const bc = [
    { label: MAIN_NAV_TITLE, url: navUrl },
    { label: '班级专属资料', url: '' },
    { label: '复盘材料', url: '' },
    { label: docTitle, url: '' },
  ];
  blocks.push(makeBreadcrumb(bc, navUrl));
  blocks.push(dividerBlock());
  blocks.push(headingBlock(1, docTitle, 2));
  blocks.push(textBlock([textRun('🔎 复盘材料  ', { bold: true, text_color: 5 }), textRun(`|  ${stage}`, { text_color: 1 })]));

  if (requiresClassCode) {
    blocks.push(calloutBlock('🔒 本资料需要绑定班级码后才可查看完整内容。请在桌宠中完成班级码验证。', 3));
  }

  if (description) blocks.push(calloutBlock(`📖 ${description}`));

  blocks.push(dividerBlock());
  if (requiresClassCode) {
    blocks.push(headingBlock(2, '📋 教师开启后可见'));
    blocks.push(textBlock([textRun('本复盘材料由教师在班级内开启。完成后可查看模考成绩分析、逐题讲评和薄弱点诊断。')]));
  } else {
    blocks.push(headingBlock(2, '📋 内容即将上线'));
    blocks.push(textBlock([textRun('复盘材料正在整理中。')]));
  }

  blocks.push(dividerBlock());
  blocks.push(textBlock([linkRun(`← 返回总导航：${MAIN_NAV_TITLE}`, navUrl)]));

  return blocks;
}

// ============================================================
// Main navigation document template
// ============================================================

function mainNavTemplate(navDocUrl) {
  // This generates the content for the main navigation doc
  const blocks = [];

  blocks.push(headingBlock(1, MAIN_NAV_TITLE, 2));
  blocks.push(dividerBlock());

  blocks.push(calloutBlock('💡 收藏本页面即可随时学习。所有基础资料均为公开只读，无需登录飞书或安装桌宠。'));
  blocks.push(dividerBlock());

  // Section: Getting Started
  blocks.push(headingBlock(2, '00  从这里开始'));
  blocks.push(bulletBlock([textRun('学习路线：零基础入门')]));
  blocks.push(bulletBlock([textRun('学习路线：一轮复习')]));
  blocks.push(bulletBlock([textRun('学习路线：考前冲刺')]));
  blocks.push(bulletBlock([textRun('如何使用本资料库')]));

  // Section: CSP-J Preliminary
  blocks.push(headingBlock(2, '01  CSP-J 初赛'));

  blocks.push(headingBlock(3, '课程线：C1 入门阶段（P1-P25）'));
  blocks.push(textBlock([textRun('从零开始学习 C++ 基础语法、输入输出、数据类型和基本控制结构。')]));

  blocks.push(headingBlock(3, '课程线：C2 基础阶段（P26-P50）'));
  blocks.push(textBlock([textRun('数组、字符串、函数、递归，以及初等数论和基础算法。')]));

  blocks.push(headingBlock(3, '课程线：C3 进阶阶段（P51-P71）'));
  blocks.push(textBlock([textRun('二分查找、贪心、动态规划，以及图论和高级数据结构。')]));

  blocks.push(headingBlock(3, '真题知识点救援'));
  blocks.push(textBlock([textRun('做错题时快速查对应知识点。每个知识点都有一张 1 分钟速懂知识卡和一份深入学习讲义。')]));

  const rescueTopics = [
    '二进制与位运算', '数据类型与存储单位', '栈与队列', '表达式求值',
    '树', '图', '时间复杂度与算法复杂度', '数组与字符串',
    '控制结构', '递归与递推', '初等数论', '二分查找与二分答案',
    '贪心算法', '洪水填充与搜索', '组合数学与概率', '动态规划',
    '程序阅读与分析', '编程语言与编译原理', '编码与解码', '计算机网络基础',
    '计算机发展史',
  ];
  for (const topic of rescueTopics) {
    blocks.push(bulletBlock([textRun(topic)]));
  }

  blocks.push(headingBlock(3, '寓言与记忆卡'));
  blocks.push(textBlock([textRun('用故事和类比建立编程直觉，适合初学者和需要形象化理解的孩子。')]));

  // Section: CSP-J Second Round
  blocks.push(headingBlock(2, '02  CSP-J 复赛（筹备中）'));
  blocks.push(bulletBlock([textRun('算法基础与代码实现')]));
  blocks.push(bulletBlock([textRun('数据结构与搜索')]));
  blocks.push(bulletBlock([textRun('动态规划与图论')]));
  blocks.push(bulletBlock([textRun('专题训练与复盘')]));
  blocks.push(bulletBlock([textRun('讲题与拓展资料')]));

  // Section: Class-exclusive
  blocks.push(headingBlock(2, '03  班级专属资料（需班级码）'));
  blocks.push(calloutBlock('🔒 以下资料需要绑定班级码后才可在桌宠中打开。请向老师获取班级码。', 3));

  blocks.push(bulletBlock([textRun('周练与模考')]));
  blocks.push(bulletBlock([textRun('班级挑战')]));
  blocks.push(bulletBlock([textRun('活动 Boss 与限定奖励')]));

  // Footer
  blocks.push(dividerBlock());
  blocks.push(textBlock([
    textRun('智子学习资料库  ·  ', { text_color: 1 }),
    textRun('通过桌宠（CSP 学习助手）打开可自动跳转到相关知识点。', { text_color: 1 }),
  ]));
  blocks.push(textBlock([
    textRun('最后更新：2026-07-10', { text_color: 1 }),
  ]));

  return blocks;
}

// ============================================================
// Format a single document
// ============================================================

async function formatDocument(docUrl, docData, navUrl) {
  const docId = docData.documentId || docUrl.split('/docx/')[1];
  if (!docId) { console.error(`  ❌ Cannot extract docId from ${docUrl}`); return false; }

  try {
    // Get current blocks
    const currentBlocks = await getBlocks(docId);
    if (!currentBlocks) { console.error(`  ❌ Cannot read document ${docId}`); return false; }

    const pageBlock = currentBlocks.items?.find(b => b.block_type === 1); // page type
    if (!pageBlock) { console.error(`  ❌ No page block found in ${docId}`); return false; }

    // Determine template based on type
    let blocks;
    const type = docData.type;
    const title = docData.docTitle || docData.title || 'Untitled';
    const stage = docData.stage || '综合';
    const level = docData.level || 'CSP-J';
    const description = docData.description || '';
    const tags = docData.tags || [];
    const requiresClassCode = docData.requiresClassCode || false;
    const lessonNo = docData.lessonNo;

    if (type === 'lecture') {
      blocks = lectureCardTemplate(title, lessonNo, stage, level, description, navUrl, tags);
    } else if (type === 'fable') {
      blocks = fableCardTemplate(title, stage, description, navUrl, tags);
    } else if (type === 'practice') {
      blocks = practiceCardTemplate(title, stage, description, navUrl);
    } else if (type === 'review') {
      blocks = reviewCardTemplate(title, stage, description, navUrl, requiresClassCode);
    } else {
      console.error(`  ⚠️  Unknown type: ${type}, skipping`);
      return false;
    }

    // First, check if there are already children - if so, clear them
    const childrenRes = await api('GET', `/docx/v1/documents/${docId}/blocks/${pageBlock.block_id}/children?page_size=50`);
    if (ok(childrenRes) && childrenRes.data?.items?.length > 0) {
      const existingTitles = childrenRes.data.items
        .filter(b => b.block_type >= 4 && b.block_type <= 12)
        .map(b => b.heading1?.elements?.[0]?.text_run?.content || b.heading2?.elements?.[0]?.text_run?.content || '')
        .filter(Boolean);

      // If document already has a heading that matches, skip (don't overwrite user content)
      if (existingTitles.some(t => t.includes(title.split('｜').pop() || ''))) {
        console.log(`  ⏭️  ${title} - already has content, skipping`);
        return 'skipped';
      }
    }

    // Clear existing children
    await clearBlockChildren(docId, pageBlock.block_id);

    // Add new blocks
    const addRes = await addBlocks(docId, pageBlock.block_id, blocks);
    if (!ok(addRes)) {
      console.error(`  ❌ Failed to add blocks to ${title}: ${addRes.msg}`);
      return false;
    }

    return true;
  } catch (e) {
    console.error(`  ❌ Error formatting ${docId}: ${e.message}`);
    return false;
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || !args.includes('--execute');
  const isExecute = args.includes('--execute');
  const navOnly = args.includes('--nav-only');
  const singleDocIdIdx = args.indexOf('--doc-id');
  const navDocIdIdx = args.indexOf('--nav-doc-id');
  const singleDocId = singleDocIdIdx >= 0 ? args[singleDocIdIdx + 1] : null;
  const navDocId = navDocIdIdx >= 0 ? args[navDocIdIdx + 1] : null;

  // Load data
  const links = JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8'));
  const lrData = JSON.parse(fs.readFileSync(LEARNING_RES_PATH, 'utf8'));
  const navUrl = (lrData.resources || []).find(r => r.id === 'p01-lecture')?.url?.replace(/\/docx\/.*/, '') || '';

  const navDocUrl = navDocId
    ? `https://scncdgmg7m6w.feishu.cn/docx/${navDocId}`
    : 'https://scncdgmg7m6w.feishu.cn/drive/folder/UIqef45D2lc458dpuOqcu8CCnHe';

  // Build resource map: resourceId → { type, title, stage, lessonNo, etc. }
  const resourceMap = {};
  for (const r of links.resources) {
    resourceMap[r.resourceId] = r;
  }

  // Build learning resources metadata map
  const lrMap = {};
  for (const r of lrData.resources) {
    lrMap[r.id] = r;
  }

  // Merge metadata from learning-resources.json into resource entries
  const docsToFormat = [];
  for (const [rid, r] of Object.entries(resourceMap)) {
    const lr = lrMap[rid] || {};
    docsToFormat.push({
      ...r,
      description: lr.description || '',
      tags: lr.tags || [],
      stage: lr.stage || r.stage || '',
      level: lr.level || 'CSP-J',
    });
  }

  if (singleDocId) {
    const doc = docsToFormat.find(d => d.documentId === singleDocId);
    if (!doc) { console.error(`Document ${singleDocId} not found in links`); process.exit(1); }
    docsToFormat.length = 0;
    docsToFormat.push(doc);
  }

  console.log('=== 飞书文档排版优化 ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`Target: ${navOnly ? 'Navigation doc only' : `${docsToFormat.length} documents`}`);

  if (isDryRun) {
    console.log('\n📋 Would format the following:');
    if (!navOnly) {
      for (const d of docsToFormat) {
        console.log(`  📄 ${d.docTitle || d.title} (${d.type})`);
      }
    }
    if (navDocId) {
      console.log(`  📋 Main Nav: ${navDocId}`);
    }
    console.log('\n每个文档将添加：');
    console.log('  • 顶部面包屑导航（智子学习资料库 > ... > 当前文档）');
    console.log('  • ← 返回总导航 链接');
    console.log('  • 统一标题格式与元信息');
    console.log('  • "内容即将上线" 占位区块');
    console.log('\nRun with --execute to apply formatting.');
    console.log('If main navigation doc ID is needed, use --nav-doc-id <id>.');
    return;
  }

  // EXECUTE
  console.log('\n🚀 Formatting documents...\n');

  // Format main navigation doc (if nav ID provided)
  if (navDocId) {
    console.log('--- Formatting Main Navigation ---');
    try {
      const currentBlocks = await getBlocks(navDocId);
      if (!currentBlocks) {
        console.error(`  ❌ Cannot read navigation doc ${navDocId}`);
      } else {
        const pageBlock = currentBlocks.items?.find(b => b.block_type === 1);
        if (pageBlock) {
          await clearBlockChildren(navDocId, pageBlock.block_id);
          const navBlocks = mainNavTemplate(navDocUrl);
          const addRes = await addBlocks(navDocId, pageBlock.block_id, navBlocks);
          if (ok(addRes)) {
            console.log(`  ✅ Main navigation formatted → ${navDocUrl}`);
          } else {
            console.error(`  ❌ Failed: ${addRes.msg}`);
          }
        }
      }
    } catch (e) {
      console.error(`  ❌ Error: ${e.message}`);
    }
  }

  // Format resource documents
  if (!navOnly) {
    console.log('--- Formatting Resource Documents ---');
    let success = 0, skipped = 0, failed = 0;

    for (const doc of docsToFormat) {
      if (!doc.url || !doc.documentId) {
        console.log(`  ⚠️  ${doc.docTitle || doc.title}: no URL/documentId`);
        failed++;
        continue;
      }

      // Use the folder URL as nav URL (or main navigation doc URL if available)
      const rootNavUrl = navDocId ? navDocUrl : links.folder?.url || navUrl;

      const result = await formatDocument(doc.url, doc, rootNavUrl);
      if (result === true) {
        console.log(`  ✅ ${doc.docTitle || doc.title}`);
        success++;
      } else if (result === 'skipped') {
        skipped++;
      } else {
        failed++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n--- Results ---`);
    console.log(`✅ Formatted: ${success}`);
    console.log(`⏭️  Skipped (has content): ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
