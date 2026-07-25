#!/usr/bin/env node
/**
 * Auto-map 411 unmapped published questions to knowledge points.
 * Uses canonical knowledgePoint field + source/level heuristics to match
 * against existing knowledge-points.json items.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const kps = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/knowledge-points.json'), 'utf8'));
const mapping = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-knowledge-mapping.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/manifest.json'), 'utf8'));

// Build KP lookup: existingQuizKps → KP ID
const kpByExistingName = new Map();
for (const kp of kps.items) {
  for (const ekp of (kp.existingQuizKps || [])) {
    kpByExistingName.set(ekp, kp.id);
  }
}

// Published questions
const readChannel = (name) => {
  const f = manifest.files[name];
  return JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2', f.path), 'utf8')).questions;
};
const allPublished = [...readChannel('daily-gesp.json'), ...readChannel('exam-questions.json')];

// Canonical knowledgePoint → KP ID mapping (extended from our analysis)
const canonicalToKp = {
  // Direct matches (from existingQuizKps)
  '计算机基础': 'computer-networks',     // 计算机基础 → 计算机网络基础 (closest match)
  '数据类型与运算': 'data-types-and-units',
  '表达式与运算': 'expression-evaluation',
  '进制与编码': 'encoding-and-decoding',
  '函数与递归': 'recursion',
  '控制结构': 'control-structures',
  '循环结构': 'control-structures',
  '条件判断': 'control-structures',
  '数组与字符串': 'array-and-string',
  '数组/字符串': 'array-and-string',
  '数据结构-图': 'graph',
  '数据结构-树': 'tree',
  '数据结构-线性': 'stack-and-queue',
  '数论': 'number-theory',
  '排序与查找': 'binary-search',
  '组合数学': 'combinatorics',
  '程序阅读': 'program-reading',
  '栈': 'stack-and-queue',
  '算法思想': 'complexity',
  '算法基础': 'complexity',

  // Mapped to existing KPs
  'C++语法基础': 'programming-languages',   // C++ grammar → programming languages
  '输入输出': 'programming-languages',       // I/O → programming languages
  '函数/结构体': 'recursion',               // Function related → recursion (covers function calls)
  '线段树—区间修改与lazy标记': 'tree',
  '树形DP—最大独立集': 'dynamic-programming',
  '矩阵变幻（递归分形）': 'recursion',
  '枚举算法': 'complexity',                 // Will be updated when 'enumeration' KP is added
  '双向映射维护': 'array-and-string',
  '笛卡尔树递归分治': 'tree',
  '循环与数组': 'control-structures',
  '质因数分解': 'number-theory',
  '最小区间覆盖（贪心）': 'greedy',
  '进制转换-进位统计': 'binary-and-bitwise',
  '十进制转k进制进位统计': 'binary-and-bitwise',
  'DFS合并求最大代价': 'graph',
  '约瑟夫问题': 'array-and-string',
  '矩形计数（排序+二分）': 'binary-search',
  'Base64解码': 'encoding-and-decoding',
  'Base64解码实现': 'encoding-and-decoding',
  '欧拉线性筛（约数个数和约数和）': 'number-theory',
  '枚举因数打印': 'number-theory',
  '洪水填充（BFS）': 'flood-fill',
  '位运算位移程序': 'binary-and-bitwise',
  '递归与DP（二分查找最坏比较次数）': 'recursion',
  '牛顿迭代求平方根': 'number-theory',
  '编辑距离DP': 'dynamic-programming',
  '实数域二分查找': 'binary-search',
  'LCS最长公共子序列DP': 'dynamic-programming',
  '最长公共子序列LCS（DP实现）': 'dynamic-programming',
  '二分查找（精度控制）': 'binary-search',
  '实数二分查找': 'binary-search',
  '快速幂（递归+迭代）': 'number-theory',
  '递归与DP对比': 'recursion',
  '广度优先搜索BFS迷宫最短路': 'flood-fill',
  '贪心区间调度（最大不相交区间数）': 'greedy',
  '动态规划—数字三角形': 'dynamic-programming',
  '拓扑排序+贪心—学习新技术': 'graph',
  '博弈论—取石子+状压DP': 'dynamic-programming',
  '单调栈—找后面第一个大于的元素': 'stack-and-queue',
  '并查集—无路径压缩合并与计数': 'graph',
  '双指针—子序列删除问题': 'array-and-string',
  '动态规划—取石子博弈+状压DP': 'dynamic-programming',
  '贪心—区间覆盖问题': 'greedy',
  '贪心—区间覆盖最少区间选择': 'greedy',
  '字符串匹配—KMP算法实现': 'array-and-string',
  '位运算lowbit应用': 'binary-and-bitwise',
  '进程调度算法': 'complexity',
  '网络流—Dinic算法': 'graph',
  'AC自动机—多模式串匹配': 'graph',
  '并查集—无路径压缩的最坏复杂度分析': 'graph',
  '位运算—加密解密程序': 'binary-and-bitwise',
  '树的重心—DFS求子树权值和': 'tree',
  '树形DP—树的最大权值和': 'dynamic-programming',
  '线段树—区间查询': 'tree',
  '树链剖分—重儿子与DFS序': 'tree',
  '莫队算法—区间统计': 'complexity',
  'B+树应用—数据库索引': 'tree',
  'Miller-Rabin素数测试': 'number-theory',
  '字符串哈希—双哈希防碰撞': 'array-and-string',
  '线段树—维护区间最大值': 'tree',
  '网络流—Dinic算法分层与增广': 'graph',
  'MapReduce框架': 'computer-networks',
  'TDD测试驱动开发': 'computer-history',
  '字符串匹配—KMP算法': 'array-and-string',
  '网络流—Edmonds-Karp算法': 'graph',
  '字符串哈希+滑动窗口': 'array-and-string',
  '图论—Dijkstra优先队列优化': 'graph',
  'ST表—稀疏表静态RMQ': 'dynamic-programming',
  'GESP 2026年6月2级真题': 'control-structures',
  '待复核': null,  // CSP exam questions — will try source/level heuristic
  '其他': null,     // Miscellaneous
};

// Process unmapped published questions
let mapped = 0;
let skipped = 0;
const unmappedReasons = {};

for (const q of allPublished) {
  if (mapping.mappings[q.id]?.primary) continue; // Already mapped

  const ckp = q.knowledgePoint || '';
  let kpId = canonicalToKp[ckp];

  // Fallback for '待复核' and '其他': use source + group heuristic
  if (!kpId) {
    if (q.source === 'csp_exam') {
      if (q.type === 'choice') {
        // CSP choice questions — try content-based matching
        const text = (q.question || '') + (q.code || '');
        if (text.includes('二进制') || text.includes('位运算') || text.includes('补码') || text.includes('原码')) {
          kpId = 'binary-and-bitwise';
        } else if (text.includes('排序') || text.includes('冒泡') || text.includes('选择排序')) {
          kpId = 'binary-search'; // sorting falls under binary-search for now
        } else if (text.includes('链表')) {
          kpId = 'array-and-string';
        } else if (text.includes('栈') || text.includes('队列')) {
          kpId = 'stack-and-queue';
        } else if (text.includes('树') || text.includes('二叉树') || text.includes('遍历')) {
          kpId = 'tree';
        } else if (text.includes('图') || text.includes('DFS') || text.includes('BFS') || text.includes('遍历')) {
          kpId = 'graph';
        } else if (text.includes('递归') || text.includes('递推')) {
          kpId = 'recursion';
        } else if (text.includes('复杂度') || text.includes('时间') || text.includes('算法')) {
          kpId = 'complexity';
        } else if (text.includes('编码') || text.includes('ASCII') || text.includes('Base64')) {
          kpId = 'encoding-and-decoding';
        } else if (text.includes('排列') || text.includes('组合') || text.includes('概率')) {
          kpId = 'combinatorics';
        } else if (text.includes('表达式') || text.includes('前缀') || text.includes('后缀')) {
          kpId = 'expression-evaluation';
        } else if (text.includes('存储') || text.includes('内存') || text.includes('地址')) {
          kpId = 'computer-networks';
        } else if (q.exam?.group === 'J') {
          kpId = 'programming-languages'; // default for CSP-J
        } else {
          kpId = 'complexity'; // default for CSP-S
        }
      } else {
        // Reading/fillBlank — use program-reading
        kpId = 'program-reading';
      }
    } else {
      // GESP questions — use level heuristic
      const lv = q.exam?.level || 1;
      if (lv <= 1) kpId = 'computer-networks';
      else if (lv === 2) kpId = 'control-structures';
      else if (lv === 3) kpId = 'array-and-string';
      else kpId = 'recursion';
    }
  }

  if (!kpId) {
    skipped++;
    unmappedReasons[ckp] = (unmappedReasons[ckp] || 0) + 1;
    continue;
  }

  // Verify KP exists
  if (!kps.items.find(k => k.id === kpId)) {
    skipped++;
    continue;
  }

  mapping.mappings[q.id] = {
    primary: kpId,
    _method: 'auto-mapped-by-knowledgePoint',
    _needsReview: true,
  };
  mapped++;
}

// Save
fs.writeFileSync(
  path.join(root, 'public/course-data/question-knowledge-mapping.json'),
  JSON.stringify(mapping, null, 2) + '\n',
);

console.log(`Auto-mapped: ${mapped} questions`);
console.log(`Skipped: ${skipped}`);
if (Object.keys(unmappedReasons).length > 0) {
  console.log('Skipped reasons:', JSON.stringify(unmappedReasons));
}
