#!/usr/bin/env node
/**
 * 创建 21 份飞书知识卡文档，输出 document_id → knowledge-points.json 的 feishuCardUrl 映射。
 *
 * 用法：
 *   node scripts/create-knowledge-cards.mjs          # dry-run（只列计划）
 *   node scripts/create-knowledge-cards.mjs --execute  # 创建文档
 *   node scripts/create-knowledge-cards.mjs --execute --fill-urls  # 创建 + 自动填 knowledge-points.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NAV_URL = 'https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg';
const NAV_TITLE = '智子学习资料库｜CSP 学习导航';

// 21 knowledge points (from knowledge-points.json, in display order)
const CARDS = [
  { id: 'binary-and-bitwise', name: '二进制与位运算', stage: 'C2', summary: '用二进制表示信息，掌握与、或、非、异或和移位运算。理解补码、原码、反码的转换。' },
  { id: 'number-theory', name: '初等数论', stage: 'C2', summary: '素数判断、质因数分解、最大公约数（gcd）、最小公倍数（lcm）、同余与模运算。' },
  { id: 'data-types-and-units', name: '数据类型与存储单位', stage: 'C1', summary: '整型、浮点型、字符型、布尔型的取值范围与存储方式。位、字节、KB、MB、GB 的换算。' },
  { id: 'stack-and-queue', name: '栈与队列', stage: 'C2', summary: '后进先出（LIFO）与先进先出（FIFO）。栈在表达式求值、函数调用中的应用。队列在 BFS 中的应用。' },
  { id: 'expression-evaluation', name: '表达式求值', stage: 'C2', summary: '前缀、中缀、后缀表达式的转换与计算。运算符优先级与结合性。逻辑表达式的短路求值。' },
  { id: 'tree', name: '树', stage: 'C3', summary: '二叉树的基本概念与遍历（先序、中序、后序）。二叉搜索树、堆、哈夫曼编码。' },
  { id: 'graph', name: '图', stage: 'C3', summary: '图的基本概念（有向/无向、度、连通）。邻接矩阵与邻接表存储。DFS 与 BFS。' },
  { id: 'complexity', name: '时间复杂度与算法复杂度', stage: 'C3', summary: '大 O 表示法。最好、最坏、平均时间复杂度。常见复杂度级别 O(1)、O(n)、O(n²)、O(log n) 的直观含义。' },
  { id: 'recursion', name: '递归与递推', stage: 'C2', summary: '递归的基本思想：基准条件与递归条件。递推关系的建立。递归树与递归深度。尾递归优化。' },
  { id: 'greedy', name: '贪心算法', stage: 'C3', summary: '贪心策略：每步选局部最优。适用范围与证明方法。典型问题：找零钱、活动选择、区间调度。' },
  { id: 'binary-search', name: '二分查找与二分答案', stage: 'C3', summary: '二分查找的前提与实现。边界条件的处理。二分答案：在单调性上二分枚举答案。' },
  { id: 'flood-fill', name: '洪水填充与搜索', stage: 'C3', summary: 'DFS 与 BFS 的搜索框架。洪水填充算法的二维应用。连通块计数、迷宫路径。' },
  { id: 'encoding-and-decoding', name: '编码与解码', stage: 'C1', summary: 'ASCII 编码表的使用。字符与数字的转换。Base64、URL 编码的基本概念。哈夫曼编码的压缩原理。' },
  { id: 'dynamic-programming', name: '动态规划', stage: 'C4', summary: 'DP 的核心思想：最优子结构与重叠子问题。记忆化搜索与递推。经典问题：背包、最长子序列、编辑距离。' },
  { id: 'computer-networks', name: '计算机网络基础', stage: 'C1', summary: 'IP 地址、域名、DNS。局域网与广域网。TCP/IP 协议栈。HTTP 与 HTTPS 的区别。' },
  { id: 'computer-history', name: '计算机发展史', stage: 'C1', summary: '计算机的发展阶段（电子管→晶体管→集成电路）。冯·诺依曼结构。图灵与图灵机。' },
  { id: 'programming-languages', name: '编程语言与编译原理', stage: 'C2', summary: '编译型语言 vs 解释型语言。C++ 的编译过程（预处理、编译、汇编、链接）。常见编程语言分类。' },
  { id: 'array-and-string', name: '数组与字符串', stage: 'C2', summary: '一维与二维数组的定义、初始化和访问。字符数组与 string。字符串的比较、拷贝、拼接。下标与越界。' },
  { id: 'control-structures', name: '控制结构', stage: 'C1', summary: 'if-else、switch 分支选择。for、while、do-while 循环。break 与 continue。循环嵌套与变量作用域。' },
  { id: 'combinatorics', name: '组合数学与概率', stage: 'C3', summary: '排列、组合、阶乘。加法原理与乘法原理。概率的基本计算。鸽巢原理。' },
  { id: 'program-reading', name: '程序阅读与分析', stage: 'C2', summary: '阅读 C++ 程序，跟踪变量变化，推导输出结果。识别常见程序模式（累加、计数、最值、逆序）。' },
];

// ============================================================
// Main
// ============================================================

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const fillUrls = args.includes('--fill-urls');
const isDryRun = !execute;

console.log(`=== 飞书知识卡文档创建 ===`);
console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
console.log(`Cards: ${CARDS.length}\n`);

if (isDryRun) {
  for (const c of CARDS) {
    console.log(`  📄 知识卡｜${c.name}`);
    console.log(`     id: ${c.id}  stage: ${c.stage}`);
    console.log(`     ${c.summary.slice(0, 60)}...`);
  }
  console.log(`\nRun with --execute to create documents.`);
  console.log(`Add --fill-urls to auto-fill knowledge-points.json after creation.`);
  process.exit(0);
}

// ---- EXECUTE ----
const results = []; // { kpId, name, documentId, url }

for (let i = 0; i < CARDS.length; i++) {
  const c = CARDS[i];
  console.log(`[${i + 1}/${CARDS.length}] Creating: 知识卡｜${c.name} ...`);

  const content = [
    `# 知识卡｜${c.name}`,
    ``,
    `> 📖 ${c.summary}`,
    ``,
    `---`,
    ``,
    `## 📋 1 分钟速懂`,
    ``,
    `核心概念和关键图示将放在这里。`,
    ``,
    `## ⚡ 最容易踩的一个坑`,
    ``,
    `（待填入）`,
    ``,
    `---`,
    ``,
    `## 📚 想深入学习？`,
    ``,
    `打开「专题讲义｜${c.name}」`,
    ``,
    `---`,
    ``,
    `← [返回总导航：${NAV_TITLE}](${NAV_URL})`,
    ``,
    `💡 收藏总导航链接，即使不打开桌宠也能随时学习。`,
  ].join('\n');

  // Escape for CLI: write to temp file, use @file reference
  const tmpFile = path.join(ROOT, 'tmp-card-content.md');
  fs.writeFileSync(tmpFile, content, 'utf8');

  try {
    const cmd = `lark-cli docs +create --as user --doc-format markdown --title "知识卡｜${c.name.replace(/"/g, '\\"')}" --content "@tmp-card-content.md" --format json`;
    const stdout = execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    const result = JSON.parse(stdout);

    if (result.ok && result.data?.document?.document_id) {
      const docId = result.data.document.document_id;
      const docUrl = result.data.document.url || `https://scncdgmg7m6w.feishu.cn/docx/${docId}`;
      results.push({ kpId: c.id, name: c.name, documentId: docId, url: docUrl });
      console.log(`  ✅ ${docId}`);
    } else {
      console.log(`  ❌ API error: ${result.error?.message || result.msg || 'unknown'}`);
    }
  } catch (e) {
    console.log(`  ❌ Failed: ${e.message?.slice(0, 100)}`);
  }

  fs.unlinkSync(tmpFile);

  // Rate limit
  if (i < CARDS.length - 1) {
    await new Promise(r => setTimeout(r, 600));
  }
}

// Write results
const outputPath = path.join(ROOT, 'reports', 'feishu-knowledge-card-ids.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  created: new Date().toISOString(),
  total: results.length,
  cards: results,
}, null, 2));

console.log(`\n=== Results ===`);
console.log(`Created: ${results.length}/${CARDS.length}`);
console.log(`Output: reports/feishu-knowledge-card-ids.json`);

// Fill feishuCardUrl in knowledge-points.json
if (fillUrls && results.length > 0) {
  console.log(`\nFilling feishuCardUrl in knowledge-points.json...`);
  const kpPath = path.join(ROOT, 'public', 'course-data', 'knowledge-points.json');
  const kpData = JSON.parse(fs.readFileSync(kpPath, 'utf8'));

  const urlMap = {};
  for (const r of results) urlMap[r.kpId] = r.url;

  let filled = 0;
  for (const item of kpData.items) {
    if (urlMap[item.id]) {
      item.feishuCardUrl = `https://scncdgmg7m6w.feishu.cn/docx/${urlMap[item.id].split('/docx/')[1]}`;
      item.feishuCardTitle = `知识卡｜${item.name}`;
      filled++;
    }
  }

  kpData.updated = new Date().toISOString().slice(0, 10);
  kpData._note = `${filled}/${kpData.items.length} 知识点已填入 feishuCardUrl。飞书文档由 lark-cli --as user 创建。生图由 Codex 负责。`;
  fs.writeFileSync(kpPath, JSON.stringify(kpData, null, 2));
  console.log(`✅ Filled ${filled}/${kpData.items.length} feishuCardUrl fields`);
}

console.log('\nDone.');
