// Rebuild question→knowledge-point mapping with conservative rules.
//
// Root cause of the "知识卡对应不准确" bug: the kp catalog has only 21 cards
// (mostly advanced topics), but the bank's questions are mostly basic C++
// (数据类型/控制结构/函数参数/数组/循环). The old auto-inferred mapping forced
// every question onto one of the 21 cards — e.g. a parameter-passing question
// (函数与递归) was shown the 「递归与递推」 or 「编程语言与编译原理」 card.
//
// Rule: only map a question when its topic CONFIDENTLY matches one of the 21
// cards. Otherwise primary=null (the UI hides the entry) and the question is
// flagged _needsReview for future card creation. A missing card is always
// better than a wrong card.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/canonical.json'), 'utf8'));
const mappingPath = path.join(root, 'public/course-data/question-knowledge-mapping.json');
const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

// Ordered rules: first match wins. Rules test the QUESTION TEXT (and code),
// not the knowledgePoint label — a label like 函数与递归 covers both recursion
// questions (card exists) and parameter-passing questions (no card). A missing
// card is always better than a wrong card.
function qText(q) {
  return `${q.question || ''} ${q.code || ''}`.toLowerCase();
}

const RULES = [
  ['dynamic-programming', t => /动态规划|状压|数字三角形|编辑距离|最长公共子序列|lcs|树形dp|背包/.test(t)],
  ['graph', t => /无向图|有向图|邻接矩阵|邻接表|顶点|拓扑排序|最短路|dijkstra|网络流|dinic|edmonds|并查集|深度优先遍历|广度优先遍历/.test(t) && !/流程图/.test(t)],
  ['encoding-and-decoding', t => /加密|解密|base64|哈夫曼编码|原码|反码|补码|进制转换|\(\s*十六进制\s*\)|八进制|十六进制/.test(t)],
  ['tree', t => /二叉树|二叉搜索树|完全二叉树|哈夫曼树|树链剖分|笛卡尔树|b\+树|树的重心|avl/.test(t)],
  ['stack-and-queue', t => /栈|队列/.test(t)],
  ['greedy', t => /贪心|区间调度|区间覆盖/.test(t)],
  ['binary-search', t => /二分查找|二分答案|实数二分|牛顿迭代|折半查找/.test(t)],
  ['flood-fill', t => /洪水填充|flood ?fill|迷宫/.test(t)],
  ['complexity', t => /时间复杂度|空间复杂度/.test(t)],
  ['number-theory', t => /质因数|素数|质数|isprime|最大公约|最小公倍|同余|miller-rabin|约数个数|约数和|欧拉筛|线性筛/.test(t)],
  ['binary-and-bitwise', t => /位运算|lowbit|异或|按位|左移|右移|位移|<<=|>>=|&\s*0x|\^\s*0x/.test(t)],
  ['expression-evaluation', t => /前缀表达式|中缀表达式|后缀表达式|逆波兰|运算符优先级/.test(t)],
  ['combinatorics', t => /组合数学|排列组合|概率/.test(t)],
  ['computer-networks', t => /计算机网络|tcp|udp|ip地址|dns|域名|http|url|网络协议/.test(t)],
  ['computer-history', t => /图灵|冯·诺依曼|eniac|计算机发展史|第一台.*计算机/.test(t)],
  ['program-reading', t => /程序阅读/.test(t)],
  ['array-and-string', t => /kmp|ac自动机|字符串哈希|字符串匹配|哈希表|哈希冲突|哈希函数|数组|字符串/.test(t)],
  ['control-structures', t => /for\s*\(|while\s*\(|if\s*\(|循环|分支|条件|流程图.*结构/.test(t)],
  ['data-types-and-units', t => /字节|取值范围|数据类型|整型|浮点|字符型|ascii|存储单位|kb|mb|gb|sizeof/.test(t)],
  // recursion：仅题干真的涉及递归/递推时（参数传递、引用、指针等函数题不映射）
  ['recursion', t => /递归|递推|斐波那契|汉诺塔|阶乘|快速幂/.test(t)],
  ['programming-languages', t => /编译器|解释器|编译原理|面向对象|关键字/.test(t)],
];

function expectedKp(q) {
  const t = qText(q);
  for (const [kp, test] of RULES) {
    if (test(t)) return kp;
  }
  return null;
}

const newMappings = {};
let kept = 0;
let changed = 0;
let nulled = 0;
let added = 0;
const changes = [];

for (const q of canonical.questions) {
  const expected = expectedKp(q);
  const old = mapping.mappings[q.id] || null;
  if (!expected) {
    if (old?.primary) {
      newMappings[q.id] = { primary: null, _method: 'rules-20260724', _needsReview: true, _was: old.primary };
      nulled++;
      changes.push(`${q.id}: ${old.primary} → null (${q.knowledgePoint})`);
    }
    continue;
  }
  if (old?.primary === expected) {
    newMappings[q.id] = old;
    kept++;
    continue;
  }
  newMappings[q.id] = {
    primary: expected,
    _method: 'rules-20260724',
    ...(old?.primary ? { _was: old.primary } : {}),
  };
  if (old?.primary) { changed++; changes.push(`${q.id}: ${old.primary} → ${expected} (${q.knowledgePoint})`); }
  else added++;
}

const out = {
  ...mapping,
  updated: new Date().toISOString().slice(0, 10),
  mappings: newMappings,
};
fs.writeFileSync(mappingPath, JSON.stringify(out, null, 2));

console.log(`kept=${kept} changed=${changed} added=${added} nulled=${nulled}`);
console.log(`mapped total: ${kept + changed + added}, hidden (no confident kp): ${nulled}`);
console.log('\n--- sample changes (first 40) ---');
for (const c of changes.slice(0, 40)) console.log(' ', c);
