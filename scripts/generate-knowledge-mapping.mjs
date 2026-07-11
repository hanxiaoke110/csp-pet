#!/usr/bin/env node
/**
 * 题目→知识点映射生成脚本
 *
 * 读取 unified-quiz-bank.json 和 knowledge-points.json，
 * 根据现有 knowledgePoint 字段 + 题干关键词生成 question-knowledge-mapping.json。
 *
 * 用法：
 *   node scripts/generate-knowledge-mapping.mjs          # 生成映射
 *   node scripts/generate-knowledge-mapping.mjs --verify  # 验证映射覆盖率
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BANK_PATH = path.join(ROOT, 'public/course-data/unified-quiz-bank.json');
const KP_PATH = path.join(ROOT, 'public/course-data/knowledge-points.json');
const MAPPING_PATH = path.join(ROOT, 'public/course-data/question-knowledge-mapping.json');

const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
const kpCatalog = JSON.parse(fs.readFileSync(KP_PATH, 'utf8'));

// ============================================================
// Build old knowledgePoint → new KP ID map
// ============================================================

const oldToNew = {};
for (const item of kpCatalog.items) {
  for (const oldKp of (item.existingQuizKps || [])) {
    oldToNew[oldKp] = item.id;
  }
}

// ============================================================
// Fallback keyword-based inference for "其他" and unmapped
// ============================================================

const KP_KEYWORD_RULES = [
  { id: 'binary-and-bitwise', re: /二进制|位运算|补码|原码|反码|异或|按位|移位|bit|AND|OR|XOR|NOT(?=\s|$|，|。)/i },
  { id: 'number-theory', re: /质数|素数|质因数|约数|公约数|公倍数|gcd|lcm|同余|整除|模运算|埃氏筛/i },
  { id: 'data-types-and-units', re: /int\b|double\b|float\b|long\s+long|char\b|bool\b|unsigned|short\b|字节|存储.*大小|sizeof|取值范围|溢出|类型转换|强制.*转换|ASCII.*码|GB|MB|KB|TB|内存.*大小/i },
  { id: 'stack-and-queue', re: /栈|stack|push|pop|top\(|队列|queue|enqueue|dequeue|front\(|rear|FIFO|LIFO|后进先出|先进先出/i },
  { id: 'expression-evaluation', re: /表达式.*值|前缀.*后缀.*中缀|逆波兰|运算符.*优先|a\s*\+\s*b|逻辑表达式|短路求值|&&|\|\||!\s*\(/i },
  { id: 'tree', re: /二叉树|二叉.*树|先序|中序|后序|前序|遍历.*树|叶子.*节点|叶子.*结点|深度.*高度|二叉.*搜索|BST|哈夫曼|堆|heap|完全.*树|满.*树/i },
  { id: 'graph', re: /图.*有向|无向图|邻接矩阵|邻接表|DFS|BFS|拓扑排序|最短路径|连通|度数|度\s/i },
  { id: 'complexity', re: /时间复杂度|空间复杂度|O\(n\)|O\(n\^2\)|O\(n\s*log\s*n\)|O\(log\s*n\)|大O|算法.*复杂度/ },
  { id: 'recursion', re: /递归|递推|f\(n\s*-\s*1\)|f\(n\s*-\s*2\)|自调用|return.*f\(|回溯|递归.*深度|间接递归|mutual recursion/i },
  { id: 'greedy', re: /贪心|局部最优|找零钱|活动选择|区间调度|最优.*策略/i },
  { id: 'binary-search', re: /二分|binary.search|mid\s*=|left\s*=|right\s*=|排序.*查找|查找.*排序|冒泡|选择.*排序|插入.*排序|快速.*排序|归并/i },
  { id: 'flood-fill', re: /洪水填充|flood.fill|连通块|迷宫|染色/i },
  { id: 'encoding-and-decoding', re: /编码|解码|Unicode|UTF-8|Base64|哈夫曼编码/i },
  { id: 'dynamic-programming', re: /动态规划|DP|最优子结构|重叠子问题|记忆化|背包|最长.*子序列|编辑距离|LCS|LIS/i },
  { id: 'computer-networks', re: /IP\s|域名|DNS|TCP|UDP|HTTP|HTTPS|FTP|SMTP|局域网|广域网|OSI|协议|URL.*组成|网络|Internet|上网/i },
  { id: 'computer-history', re: /计算机.*发展|电子管|晶体管|集成电路|冯.*诺依曼|图灵|ENIAC|第一台|诞生|发明|摩尔定律|发展.*阶段/i },
  { id: 'programming-languages', re: /#include|using\s+namespace|编译|链接|预处理|解释.*语言|面向对象|C\+\+|Python|Java|机器.*语言|汇编|高级语言|低级语言|标识符|关键字|保留字|注释|变量.*定义|变量.*声明|常量|const|#define|cin\s*>>|cout\s*<<|scanf|printf|输入.*输出|文件.*读写|string|struct|结构体|函数.*定义|函数.*声明|void\s+\w+\s*\(/i },
  { id: 'array-and-string', re: /数组|一维|二维|下标|a\[\d+\]|strcmp|strlen|strcpy|strcat|字符串.*比较|字符串.*拷贝|字符.*数组|s\[/i },
  { id: 'control-structures', re: /if\s*\(|else|switch\s*\(|分支|条件|for\s*\(|while\s*\(|do\s*{|break|continue|循环.*嵌套|循环.*执行|循环.*次数|循环体/i },
  { id: 'combinatorics', re: /排列|组合|C\(\d|P\(\d|阶乘|方案数|概率|互斥|对立|染色|骨牌|走法|路径数|鸽巢|加法原理|乘法原理|抽屉/i },
  { id: 'program-reading', re: /程序.*输出|运行.*结果|以下.*代码.*输出|执行.*后.*输出|程序.*功能|代码.*运行|输出.*是|结果.*是/i },
];

function inferKpId(questionText) {
  const text = String(questionText || '');
  for (const rule of KP_KEYWORD_RULES) {
    if (rule.re.test(text)) return rule.id;
  }
  return null;
}

// ============================================================
// Main mapping
// ============================================================

const questions = Object.values(bank);
const mappings = {};
const stats = { mapped: 0, unmapped: 0, byOldKp: 0, byInference: 0 };

for (const q of questions) {
  const oldKp = q.knowledgePoint || '';
  let primary = null;
  let method = '';

  // 1. Try direct oldKp → newKp mapping
  if (oldToNew[oldKp]) {
    primary = oldToNew[oldKp];
    method = 'existing-kp';
    stats.byOldKp++;
  }

  // 2. If oldKp is "其他" or unmapped, try keyword inference
  if (!primary || oldKp === '其他') {
    const inferred = inferKpId(q.question || '');
    if (inferred) {
      if (!primary) {
        primary = inferred;
        method = 'inferred';
        stats.byInference++;
      }
      // else: already had a primary from oldKp, keep it. But if oldKp was "其他", prefer inferred
    }
    if (oldKp === '其他' && inferred && (!primary || primary === oldToNew['其他'])) {
      primary = inferred;
      method = 'inferred-override';
      stats.byInference++;
      stats.byOldKp--;
    }
  }

  if (primary) {
    mappings[q.id] = { primary };
    if (method) mappings[q.id]._method = method;
    stats.mapped++;
  } else {
    stats.unmapped++;
    // Still add an entry with null primary for tracking
    mappings[q.id] = { primary: null, _needsReview: true };
  }
}

// Build output
const output = {
  _note: "题目 → 知识点映射。每题 1 个 primary，客户端题后按钮据此显示'没懂？看XX知识卡'。secondary 后续补充。_method 和 _needsReview 为生成时标注，发布前可删除。",
  version: 1,
  updated: new Date().toISOString().slice(0, 10),
  mappings,
};

fs.writeFileSync(MAPPING_PATH, JSON.stringify(output, null, 2));

// ============================================================
// Report
// ============================================================

console.log(`\n=== Question → Knowledge Point Mapping ===`);
console.log(`Total questions: ${questions.length}`);
console.log(`Mapped:  ${stats.mapped} (${(stats.mapped/questions.length*100).toFixed(1)}%)`);
console.log(`  By existing knowledgePoint: ${stats.byOldKp}`);
console.log(`  By keyword inference:      ${stats.byInference}`);
console.log(`Unmapped: ${stats.unmapped} (${(stats.unmapped/questions.length*100).toFixed(1)}%)`);

// Per-KP breakdown
const byKp = {};
for (const [qid, m] of Object.entries(mappings)) {
  const kp = m.primary || '未映射';
  byKp[kp] = (byKp[kp] || 0) + 1;
}
console.log(`\nPer knowledge point:`);
for (const [kp, count] of Object.entries(byKp).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kp}: ${count}`);
}

// Unmapped questions
if (stats.unmapped > 0) {
  console.log(`\n=== Unmapped questions (${stats.unmapped}) ===`);
  const unmapped = questions.filter(q => !mappings[q.id]?.primary || mappings[q.id]?.primary === null);
  for (const q of unmapped.slice(0, 20)) {
    const stem = String(q.question || '').replace(/\s+/g, ' ').slice(0, 80);
    console.log(`  ${q.id}: ${stem}...`);
  }
  if (unmapped.length > 20) console.log(`  ...and ${unmapped.length - 20} more`);
}

console.log(`\nMapping written → ${MAPPING_PATH}`);
console.log('Done.');
