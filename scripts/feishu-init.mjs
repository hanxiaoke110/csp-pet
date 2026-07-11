#!/usr/bin/env node
/**
 * 飞书资料库初始化脚本 — Phase 0
 *
 * 读取 .env.feishu 凭证，在飞书创建：
 *   1. 主资料库文件夹 "智子学习资料库｜CSP 学习导航"
 *   2. 子文件夹结构（初赛 / 复赛 / 班级专属）
 *   3. 首批 8 个知识卡文档（占位，后续替换内容）
 *   4. 8 个专题讲义文档（占位）
 *   5. 总导航文档
 *   6. 所有文档设置为"互联网获得链接的人可阅读"
 *
 * 用法：
 *   node scripts/feishu-init.mjs                # dry-run（只列计划不执行）
 *   node scripts/feishu-init.mjs --execute       # 执行创建
 *   node scripts/feishu-init.mjs --list-docs     # 列出已创建的文档和链接
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================
// Load credentials
// ============================================================

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

const env = loadEnv(path.join(ROOT, '.env.feishu'));
const APP_ID = env.FEISHU_APP_ID;
const APP_SECRET = env.FEISHU_APP_SECRET;
const BASE = 'https://open.feishu.cn/open-apis';

if (!APP_ID || !APP_SECRET) {
  console.error('❌ Missing FEISHU_APP_ID or FEISHU_APP_SECRET in .env.feishu');
  process.exit(1);
}

// ============================================================
// API helpers
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
  if (data.code !== 0) throw new Error(`Token error: ${data.msg} (${data.code})`);
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
  const data = await res.json();
  return data;
}

function ok(data) { return data && data.code === 0; }

// ============================================================
// Folder & Document operations
// ============================================================

// Create a folder in drive
async function createFolder(name, parentToken = '') {
  const body = { name, type: 'folder' };
  if (parentToken) body.parent_token = parentToken;
  const res = await api('POST', '/drive/v1/files', body);
  if (ok(res)) {
    console.log(`  📁 ${name} → ${res.data.file.token}`);
    return res.data.file.token;
  }
  console.error(`  ❌ Folder "${name}" failed: ${res.msg}`);
  return null;
}

// Create a Docx document in a folder
async function createDocx(title, parentToken = '') {
  const body = { title };
  if (parentToken) body.folder_token = parentToken;
  const res = await api('POST', '/docx/v1/documents', body);
  if (ok(res)) {
    const docId = res.data.document.document_id;
    const url = res.data.document.url || `https://larksuite.feishu.cn/docx/${docId}`;
    console.log(`  📄 ${title} → ${docId}`);
    return { document_id: docId, url };
  }
  console.error(`  ❌ Docx "${title}" failed: ${res.msg}`);
  return null;
}

// Set document permission to public-readable
async function setPublicPermission(fileToken, fileType = 'docx') {
  // Feishu: set public link with "anyone_can_view"
  const res = await api('PATCH', `/drive/v1/permissions/${fileToken}/public?type=${fileType}`, {
    external_access: true,
    security_entity: 'anyone_can_view',
    comment_entity: 'anyone_can_view',
    share_entity: 'anyone',
    link_share_entity: 'anyone',
  });
  // 如果上面不work，用v2 API
  if (!ok(res)) {
    // Try alternative: create public link
    const alt = await api('POST', `/drive/v1/permissions/${fileToken}/public_link?type=${fileType}`, {
      external_access: true,
      entity_type: 'anyone',
      entity_id: 'anyone',
      entity_perm: 'view',
    });
    console.log(`    🔓 public: ${alt.code === 0 ? 'OK' : alt.msg}`);
    return alt.code === 0;
  }
  console.log(`    🔓 public: OK`);
  return true;
}

// Get document info including URL
async function getDocInfo(docId) {
  const res = await api('GET', `/docx/v1/documents/${docId}`);
  if (ok(res)) {
    return res.data.document;
  }
  return null;
}

// ============================================================
// Document structure definition
// ============================================================

// 首批 8 个知识卡 + 讲义的主题
const FIRST_BATCH = [
  { id: 'binary-and-bitwise', name: '二进制与位运算', summary: '用二进制表示信息，掌握与或非异或和移位运算。' },
  { id: 'number-theory', name: '初等数论', summary: '素数、约数、最大公约数、同余和模运算。' },
  { id: 'data-types-and-units', name: '数据类型与存储单位', summary: '整型、浮点、字符的存储方式，位、字节与内存。' },
  { id: 'stack-and-queue', name: '栈与队列', summary: '后进先出与先进先出，以及表达式求值中的应用。' },
  { id: 'expression-evaluation', name: '表达式求值', summary: '前缀、中缀、后缀表达式转换与计算规则。' },
  { id: 'tree', name: '树', summary: '二叉树遍历、二叉搜索树、堆和哈夫曼编码。' },
  { id: 'graph', name: '图', summary: '图的基本概念、邻接矩阵与邻接表、DFS/BFS。' },
  { id: 'complexity', name: '时间复杂度与算法复杂度', summary: '大O表示法、最好/最坏/平均复杂度、空间复杂度。' },
];

// 完整目录结构
const STRUCTURE = {
  name: '智子学习资料库｜CSP 学习导航',
  children: [
    {
      name: '00 从这里开始',
      children: [
        { name: '学习路线：零基础入门', type: 'docx' },
        { name: '学习路线：一轮复习', type: 'docx' },
        { name: '学习路线：考前冲刺', type: 'docx' },
        { name: '如何使用本资料库', type: 'docx' },
      ],
    },
    {
      name: '01 CSP-J 初赛',
      children: [
        {
          name: '课程线：C1 入门（P1-P25）',
          children: Array.from({ length: 25 }, (_, i) => ({ name: `P${i + 1} 课程讲义`, type: 'docx' })),
        },
        {
          name: '课程线：C2 基础（P26-P50）',
          children: Array.from({ length: 25 }, (_, i) => ({ name: `P${i + 26} 课程讲义`, type: 'docx' })),
        },
        {
          name: '课程线：C3 进阶（P51-P71）',
          children: Array.from({ length: 21 }, (_, i) => ({ name: `P${i + 51} 课程讲义`, type: 'docx' })),
        },
        {
          name: '真题知识点救援',
          children: FIRST_BATCH.map(kp => ({
            name: `知识卡｜${kp.name}`,
            type: 'docx',
            kpId: kp.id,
            isKnowledgeCard: true,
          })),
        },
        {
          name: '专题讲义',
          children: FIRST_BATCH.map(kp => ({
            name: `专题讲义｜${kp.name}`,
            type: 'docx',
            kpId: kp.id,
            isLecture: true,
          })),
        },
        { name: '寓言与记忆卡', type: 'folder', children: [] },
      ],
    },
    {
      name: '02 CSP-J 复赛',
      children: [
        { name: '算法基础与代码实现', type: 'folder', children: [] },
        { name: '数据结构与搜索', type: 'folder', children: [] },
        { name: '动态规划与图论', type: 'folder', children: [] },
        { name: '专题训练与复盘', type: 'folder', children: [] },
        { name: '讲题与拓展资料', type: 'folder', children: [] },
      ],
    },
    {
      name: '03 班级专属资料（需班级码）',
      children: [
        { name: '周练与模考', type: 'folder', children: [] },
        { name: '班级挑战', type: 'folder', children: [] },
        { name: '活动Boss与限定奖励', type: 'folder', children: [] },
      ],
    },
  ],
};

// ============================================================
// Main: create structure + set permissions + output links
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const listDocs = args.includes('--list-docs');

  console.log('=== 飞书资料库初始化 ===');
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}\n`);

  // Verify token works
  try {
    const T = await getToken();
    console.log('✅ Token valid\n');
  } catch (e) {
    console.error(`❌ Token failed: ${e.message}`);
    process.exit(1);
  }

  // Check scopes
  const scopeRes = await api('GET', '/auth/v3/scope');
  const scopes = scopeRes.data?.scopes || [];
  console.log('Available scopes:', scopes.length);
  const needed = ['drive:drive', 'docx:document', 'docx:document:readonly'];
  for (const n of needed) {
    if (scopes.includes(n)) console.log(`  ✅ ${n}`);
    else console.log(`  ⚠️  ${n} MISSING`);
  }
  console.log('');

  if (!execute) {
    console.log('📋 Plan (no changes made):');
    console.log(`  Root: "${STRUCTURE.name}"`);
    console.log('  Sub-folders: 00 从这里开始, 01 CSP-J 初赛, 02 CSP-J 复赛, 03 班级专属资料');
    console.log(`  Knowledge cards: ${FIRST_BATCH.length}`);
    console.log(`  Course lectures: 71 (P1-P71)`);
    console.log(`  Special lectures: ${FIRST_BATCH.length}`);
    console.log('\n  Run with --execute to create documents.');
    return;
  }

  // ---- EXECUTE ----
  console.log('🚀 Creating document structure...\n');

  // Phase 1: Create only the critical documents (not all 71 lectures + 25 cards per course)
  // Focus on: root nav, sub-folders, 8 knowledge cards, 8 lectures, 71 course placeholder docs

  const createdDocs = []; // { name, document_id, url, kpId, type }

  // 1. Create root folder
  const rootToken = await createFolder(STRUCTURE.name);
  if (!rootToken) { console.error('❌ Root folder creation failed. Aborting.'); return; }

  // 2. Helper: recursively create structure (simplified — skip 71 individual lectures)
  async function createNode(node, parentToken) {
    const token = await createFolder(node.name, parentToken);
    if (!token) return;
    if (node.children) {
      for (const child of node.children) {
        await createNode(child, token);
      }
    }
    return token;
  }

  // Create only essential sub-folders (not all 71 lecture docs)
  console.log('\n--- Sub-folders ---');
  const folder00Token = await createFolder('00 从这里开始', rootToken);
  const folder01Token = await createFolder('01 CSP-J 初赛', rootToken);
  const folder02Token = await createFolder('02 CSP-J 复赛', rootToken);
  const folder03Token = await createFolder('03 班级专属资料（需班级码）', rootToken);

  // 00 sub-items
  if (folder00Token) {
    const learnTokens = [];
    for (const label of ['学习路线：零基础入门', '学习路线：一轮复习', '学习路线：考前冲刺', '如何使用本资料库']) {
      const doc = await createDocx(label, folder00Token);
      if (doc) {
        createdDocs.push({ name: label, ...doc, type: 'guide' });
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  // 01 sub-folders
  if (folder01Token) {
    const course01Token = await createFolder('课程线：C1 入门（P1-P25）', folder01Token);
    const course02Token = await createFolder('课程线：C2 基础（P26-P50）', folder01Token);
    const course03Token = await createFolder('课程线：C3 进阶（P51-P71）', folder01Token);
    const rescueToken = await createFolder('真题知识点救援', folder01Token);
    const lectureToken = await createFolder('专题讲义', folder01Token);

    // 8 knowledge cards
    if (rescueToken) {
      console.log('\n--- Knowledge Cards ---');
      for (const kp of FIRST_BATCH) {
        const doc = await createDocx(`知识卡｜${kp.name}`, rescueToken);
        if (doc) {
          createdDocs.push({ name: `知识卡｜${kp.name}`, ...doc, kpId: kp.id, type: 'knowledge-card' });
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    // 8 lecture docs
    if (lectureToken) {
      console.log('\n--- Lecture Docs ---');
      for (const kp of FIRST_BATCH) {
        const doc = await createDocx(`专题讲义｜${kp.name}`, lectureToken);
        if (doc) {
          createdDocs.push({ name: `专题讲义｜${kp.name}`, ...doc, kpId: kp.id, type: 'lecture' });
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    // Create placeholder course docs (just the folder structures, not 71 individual docs)
    // Actual course docs will be linked from learning-resources.json
  }

  // 02 & 03: just folders (leave empty for now)
  if (folder02Token) {
    for (const label of ['算法基础与代码实现', '数据结构与搜索', '动态规划与图论', '专题训练与复盘', '讲题与拓展资料']) {
      await createFolder(label, folder02Token);
      await new Promise(r => setTimeout(r, 150));
    }
  }

  if (folder03Token) {
    for (const label of ['周练与模考', '班级挑战', '活动Boss与限定奖励']) {
      await createFolder(label, folder03Token);
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Create main navigation document
  console.log('\n--- Main Navigation Doc ---');
  const navDoc = await createDocx('智子学习资料库｜CSP 学习导航', rootToken);
  if (navDoc) {
    createdDocs.push({ name: '智子学习资料库｜CSP 学习导航（总导航）', ...navDoc, type: 'nav' });
  }

  // Set public permissions
  console.log('\n--- Setting Public Permissions ---');
  // For knowledge cards: try to set public
  const docsToMakePublic = createdDocs.filter(d => ['knowledge-card', 'lecture', 'guide', 'nav'].includes(d.type));
  for (const doc of docsToMakePublic) {
    if (doc.document_id) {
      await setPublicPermission(doc.document_id, 'docx');
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Output
  console.log('\n\n=== RESULTS ===');
  console.log(JSON.stringify(createdDocs, null, 2));

  // Write links file
  const linksPath = path.join(ROOT, 'reports', 'feishu-links.json');
  const reportsDir = path.join(ROOT, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(linksPath, JSON.stringify({
    generated: new Date().toISOString(),
    rootFolderToken,
    rootFolderUrl: `https://larksuite.feishu.cn/drive/home/?folder=${rootToken}`,
    documents: createdDocs,
  }, null, 2));
  console.log(`\nLinks → ${linksPath}`);
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
