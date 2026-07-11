#!/usr/bin/env node
/**
 * 洛谷题目提取导入脚本
 *
 * 从 ti.luogu.com.cn 提取 NOIP/GESP 初赛试题，转换为统一题库格式。
 *
 * 用法：
 *   node scripts/import-luogu.mjs --source noip --years 2015-2018 --group popularization
 *   node scripts/import-luogu.mjs --source gesp --dates 2025-09,2025-12,2026-03
 *   node scripts/import-luogu.mjs --source gesp --dates all-missing
 *   node scripts/import-luogu.mjs --source noip --list    # 列出可用试卷
 *   node scripts/import-luogu.mjs --source gesp --list     # 列出可用试卷
 *
 * 输出：reports/luogu-import/{source}-extracted.json（提取结果）
 *       reports/luogu-import/{source}-to-merge.json（可直接合并到 unified-quiz-bank）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const BANK_PATH = path.join(root, 'public/course-data/unified-quiz-bank.json');
const OUTPUT_DIR = path.join(root, 'reports/luogu-import');

// ============================================================
// 洛谷试卷目录
// ============================================================

const LUOGU_PAPERS = {
  noip: {
    popularization: [ // 普及组 ≈ CSP-J
      [2007, 1001], [2008, 1003], [2009, 1005], [2010, 1007],
      [2011, 1009], [2012, 1011], [2013, 1013], [2014, 1015],
      [2015, 1017], [2016, 1019], [2017, 1021], [2018, 1028],
    ],
    improvement: [ // 提高组 ≈ CSP-S
      [2007, 1002], [2008, 1004], [2009, 1006], [2010, 1008],
      [2011, 1010], [2012, 1012], [2013, 1014], [2014, 1016],
      [2015, 1018], [2016, 1020], [2017, 1022], [2018, 1029],
    ],
  },
  gesp: {
    // 格式：{ 考试日期: { 级别: problemset_id } }
    // 从洛谷 page 1-4 整理
    samples: { 1: 1101, 2: 1102, 3: 1103, 4: 1104, 5: 1105, 6: 1106, 7: 1107, 8: 1108 },
    '2023-03': { 1: 1121, 2: 1122 },
    '2023-06': { 1: 1123, 2: 1124, 3: 1125, 4: 1126 },
    '2023-09': { 1: 1127, 2: 1128, 3: 1129, 4: 1130, 5: 1131, 6: 1132 },
    '2023-12': { 1: 1133, 2: 1134, 3: 1135, 4: 1136, 5: 1137, 6: 1138, 7: 1139, 8: 1140 },
    '2024-03': { 1: 1141, 2: 1142, 3: 1143, 4: 1144, 5: 1145, 6: 1146, 7: 1147, 8: 1148 },
    '2024-06': { 1: 1149, 2: 1150, 3: 1151, 4: 1152, 5: 1153, 6: 1154, 7: 1155, 8: 1156 },
    '2024-09': { 1: 1157, 2: 1158, 3: 1159, 4: 1160, 5: 1161, 6: 1162, 7: 1163, 8: 1164 },
    '2024-12': { 1: 1165, 2: 1166, 3: 1167, 4: 1168, 5: 1169, 6: 1170, 7: 1171, 8: 1172 },
    '2025-03': { 1: 1173, 2: 1174, 3: 1175, 4: 1176, 5: 1177, 6: 1178, 7: 1179, 8: 1180 },
    '2025-06': { 1: 1181, 2: 1182, 3: 1183, 4: 1184, 5: 1185, 6: 1186, 7: 1187, 8: 1188 },
    '2025-09': { 1: 1189, 2: 1190, 3: 1191, 4: 1192, 5: 1193, 6: 1194, 7: 1195, 8: 1196 },
    '2025-12': { 1: 1197, 2: 1198, 3: 1199, 4: 1200, 5: 1201, 6: 1202, 7: 1203, 8: 1204 },
    '2026-03': { 1: 1205, 2: 1206, 3: 1207, 4: 1208, 5: 1209, 6: 1210, 7: 1211, 8: 1212 },
    '2026-06': { 1: 1213, 2: 1214, 3: 1215, 4: 1216, 5: 1217, 6: 1218, 7: 1219, 8: 1220 },
  },
};

// ============================================================
// NOIP 筛选规则：C++ 相关、跳过的内容
// ============================================================

// Pascal 特征：出现这些关键字的题跳过
const PASCAL_MARKERS = [
  /var\s+\w+\s*:\s*(integer|array|string|boolean|char|real)/i,
  /\bwriteln\b/i, /\breadln\b/i, /\bBegin\b/, /\bEnd\./,
  /:\s*=\s*\d+\s*to\s*\d+\s*do\b/i, // Pascal for loop
  /\.maxint\b/i, /\bdiv\s+\d/i, // Pascal operators: div, mod (actually div is the key difference)
  /\bchr\(\d+\)/i, /\bord\(/i, // Pascal char functions
  /(?:\bvar\s|,)\s*\w+\s*:\s*array\s*\[/i, // Pascal array declaration
];

// 过时/不适用内容特征（跳过）
const OBSOLETE_MARKERS = [
  /软盘|光盘|磁盘|3\.5\s*英寸|CD-ROM|DVD|U盘容量|MP\d|MPEG/i,
  /Pentium|奔腾|386|486|586|主频.*MHz|MHz.*主频/i,
  /Windows\s*(95|98|XP|2000|ME|NT)|DOS\s|MS-DOS/i,
  /拨号|调制解调器|ISDN|ADSL|56k|modem/i,
  /显示器.*英寸|CRT|分辨率.*x\d{3}/i,
  /图灵诞辰|图灵.*年|今年.*\d+.*周年/i,
  /内存条.*MB|内存.*\d{1,3}MB(?!\d)/i,
];

// C++ 特征：确认是 C++ 题目
const CPP_MARKERS = [
  /#include\s*<iostream>/i, /#include\s*<bits\/stdc\+\+\.h>/i,
  /#include\s*<cstdio>/i, /#include\s*<cstring>/i,
  /using\s+namespace\s+std/i, /\bint\s+main\b/i,
  /\bcout\s*<</i, /\bcin\s*>>/i, /\bstd::/i,
  /\bvector\b/i, /\bstring\b/i, /\bnullptr\b/i,
];

// 问题求解（非选择题，跳过）
const PROBLEM_SOLVING_MARKERS = [
  /问题求解|第.*题.*（.*分|以下程序段|将.*填入|写出.*结果/i,
];

// ============================================================
// 知识点自动推断
// ============================================================

const KP_RULES = [
  { kp: '进制与编码', re: /进制|二进制|八进制|十六进制|十进制|补码|原码|反码|ASCII|编码|Unicode|位运算|按位|异或|移位|bit/i },
  { kp: '计算机基础', re: /硬件|CPU|内存|存储|RAM|ROM|cache|高速缓存|硬盘|主板|网卡|GPU|操作系统|进程|线程|文件系统|编译器|解释器|IP地址|域名|协议|局域网|URL/i },
  { kp: '控制结构', re: /if\s*\(|else|switch|分支|条件判断|循环|for\s*\(|while\s*\(|dowhile|break|continue/i },
  { kp: '数组与字符串', re: /数组|一维|二维|下标|a\[\d+\]|strcmp|strlen|strcpy|string|字符串.*比较|字符串.*拷贝/i },
  { kp: '函数与递归', re: /递归|递推|f\(n\s*-\s*1\)|f\(n\s*-\s*2\)|自调用|return|回溯|void\s+\w+\s*\(/i },
  { kp: '排序与查找', re: /排序|冒泡|选择.*排序|插入.*排序|快速.*排序|归并|二分|查找|搜索/i },
  { kp: '数据结构-线性', re: /栈|队列|链表|push|pop|enqueue|dequeue|top|front|rear/i },
  { kp: '数据结构-树', re: /二叉树|树.*遍历|先序|中序|后序|叶子|结点|节点|深度|高度|根.*左.*右|前序|二叉.*搜索/i },
  { kp: '数据结构-图', re: /图.*有向|无向图|邻接|DFS|BFS|拓扑|最短路径|连通|度/i },
  { kp: '算法思想', re: /枚举|贪心|动态规划|回溯|分治|复杂度|时间.*O\(|O\(n\)|O\(n\^2\)|O\(n\^3\)|O\(n\s*log\s*n\)/i },
  { kp: '组合数学', re: /排列|组合|C\(\d|P\(\d|阶乘|方案数|概率|互斥|对立|期望|染色|骨牌|走法|路径数/i },
  { kp: '数论', re: /质数|素数|质因数|最大公约数|最小公倍数|gcd|lcm|约数|同余|整除|模|mod\b|埃氏筛/i },
  { kp: '表达式与运算', re: /表达式.*值|运算.*优先级|\+\s*\+|a\s*\+\s*b|逻辑表达式|关系表达式|前缀.*后缀.*中缀|逆波兰/i },
  { kp: 'C++语法基础', re: /合法.*标识符|关键字|变量.*定义|变量.*声明|类型.*转换|强制转换|int|double|char|bool|void|sizeof|const|#define/i },
  { kp: '输入输出', re: /cin\s*>>|cout\s*<<|scanf|printf|输入输出|文件.*读写|fopen|ifstream|getline/i },
  { kp: '程序阅读', re: /程序.*输出|运行.*结果|以下.*代码.*输出|执行.*后.*输出|程序.*功能/i },
];

function inferKnowledgePoint(questionText) {
  const text = String(questionText || '').toLowerCase().replace(/\s+/g, ' ');
  for (const rule of KP_RULES) {
    if (rule.re.test(text)) return rule.kp;
  }
  return '其他';
}

// ============================================================
// 数据提取
// ============================================================

const LUOGU_BASE = 'https://ti.luogu.com.cn/problemset';

async function fetchPaper(pid) {
  const url = `${LUOGU_BASE}/${pid}`;
  console.error(`  Fetching ${url}...`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const html = await resp.text();

  // 提取 window._feInjection
  const match = html.match(/window\._feInjection\s*=\s*JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/);
  if (!match) throw new Error(`_feInjection not found in ${url}`);

  const injection = JSON.parse(decodeURIComponent(match[1]));
  if (injection.code !== 200) throw new Error(`_feInjection code=${injection.code}`);

  const problemset = injection.currentData?.problemset;
  if (!problemset) throw new Error('problemset not found in _feInjection');

  return { problemset, pid };
}

function cleanOption(text) {
  // 去掉选项首尾空格，但保留内容
  return String(text || '').trim();
}

function parseLuoguProblem(problem, paperInfo) {
  const { source, year, group, level, paperId } = paperInfo;

  // 只处理选择题类型
  if (problem.type !== 'MultipleSelection') return null;

  // 取第一个 question variant（洛谷一个 problem 可能有多变体）
  const variant = (problem.questions || [])[0];
  if (!variant || !Array.isArray(variant.choices)) return null;

  const description = String(problem.description || '').trim();
  const choices = variant.choices.map(cleanOption).filter(c => c.length > 0);

  // 至少 2 个选项
  if (choices.length < 2) return null;

  // 正确答案：洛谷用字母 A/B/C/D...
  const correctLetter = (variant.correctAnswers || [])[0];
  if (!correctLetter) return null;
  const correctIndex = correctLetter.charCodeAt(0) - 'A'.charCodeAt(0);
  if (correctIndex < 0 || correctIndex >= choices.length) return null;

  // NOIP 特殊筛选
  if (source === 'noip') {
    // 跳过 Pascal 题
    if (PASCAL_MARKERS.some(re => re.test(description) || re.test(choices.join(' ')))) return null;
    // 跳过过时题
    if (OBSOLETE_MARKERS.some(re => re.test(description))) return null;
    // 跳过问题求解
    if (PROBLEM_SOLVING_MARKERS.some(re => re.test(description))) return null;
  }

  // 判断题：2 个选项，且是"正确/错误"或"√/×"
  const isBoolean = choices.length === 2 && (
    /^正确|^错误|^√|^×|^对$|^错$/.test(choices[0]) ||
    choices.every(c => /^[√×]$/.test(c) || /^正确$|^错误$|^对$|^错$/.test(c))
  );

  // 构建选项（加 A. B. C. D. 前缀如果还没有）
  const options = choices.map((c, i) => {
    const letter = String.fromCharCode(65 + i);
    if (c.startsWith(`${letter}. `) || c.startsWith(`${letter}.`) ||
        c.startsWith(`${letter} `) || c.startsWith(`${letter}、`)) {
      return c;
    }
    return `${letter}. ${c}`;
  });

  // 生成 ID
  const idx = String(problem.id || '').padStart(3, '0');
  let id;
  if (source === 'noip') {
    const g = group === 'popularization' ? 'p' : 't';
    id = `noip-${year}-${g}-${idx}`;
  } else if (source === 'gesp') {
    const dateLabel = paperInfo.dateLabel || 'unknown';
    id = `gesp-${dateLabel}-${level}-${idx}`;
  } else {
    id = `${source}-${year}-${idx}`;
  }

  const question = description
    .replace(/\\n/g, '\n')
    .replace(/````/g, '```'); // Fix escaped code fences

  const knowledgePoint = inferKnowledgePoint(question);

  return {
    id,
    source,
    year: parseInt(year) || 0,
    knowledgePoint,
    question,
    options,
    correctIndex,
    explanation: `官方答案：${correctLetter}。`,
    difficulty: 2,
    questionType: isBoolean ? 'boolean' : 'choice',
    hasImage: false,
    ...(level ? { level: parseInt(level) || undefined } : {}),
    _luogu_pid: problem.id, // 保留洛谷问题 ID 用于追溯
  };
}

// ============================================================
// 主流程
// ============================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: '', list: false, years: '', group: '', dates: '', levels: '' };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--list': opts.list = true; break;
      case '--years': opts.years = args[++i]; break;
      case '--group': opts.group = args[++i]; break;
      case '--dates': opts.dates = args[++i]; break;
      case '--levels': opts.levels = args[++i]; break;
    }
  }
  return opts;
}

function resolvePapers(source, opts) {
  if (source === 'noip') {
    const groups = opts.group ? [opts.group] : ['popularization', 'improvement'];
    const papers = [];
    for (const g of groups) {
      const list = LUOGU_PAPERS.noip[g] || [];
      for (const [year, pid] of list) {
        if (opts.years) {
          const [start, end] = opts.years.split('-').map(Number);
          if (year < start || year > end) continue;
        }
        papers.push({ pid, source: 'noip', year, group: g });
      }
    }
    return papers;
  }

  if (source === 'gesp') {
    const papers = [];
    const dates = opts.dates === 'all-missing'
      ? Object.keys(LUOGU_PAPERS.gesp).filter(d => d !== 'samples')
      : (opts.dates || '').split(',').filter(Boolean);

    const allDates = opts.dates === 'all' || opts.dates === 'all-missing'
      ? Object.keys(LUOGU_PAPERS.gesp).filter(d => d !== 'samples')
      : dates;

    for (const dateLabel of allDates) {
      const levels = LUOGU_PAPERS.gesp[dateLabel];
      if (!levels) { console.error(`  Unknown date: ${dateLabel}`); continue; }

      const wantLevels = opts.levels
        ? opts.levels.split(',').map(Number)
        : [1, 2, 3, 4]; // 默认 CSP-J 相关级别

      for (const lv of wantLevels) {
        const pid = levels[lv];
        if (!pid) continue;
        // GESP 年份从日期标签取
        const year = parseInt(dateLabel.split('-')[0]);
        papers.push({ pid, source: 'gesp', year, level: lv, dateLabel });
      }
    }
    return papers;
  }

  return [];
}

// ============================================================
// 入口
// ============================================================

const opts = parseArgs();

if (opts.list) {
  if (opts.source === 'noip' || !opts.source) {
    console.log('\n=== NOIP 普及组 (≈CSP-J) ===');
    for (const [y, pid] of LUOGU_PAPERS.noip.popularization) {
      console.log(`  ${y}: problemset/${pid}`);
    }
    console.log('\n=== NOIP 提高组 (≈CSP-S) ===');
    for (const [y, pid] of LUOGU_PAPERS.noip.improvement) {
      console.log(`  ${y}: problemset/${pid}`);
    }
  }
  if (opts.source === 'gesp' || !opts.source) {
    console.log('\n=== GESP C++ 真题 ===');
    for (const [date, levels] of Object.entries(LUOGU_PAPERS.gesp)) {
      if (date === 'samples') continue;
      const lvs = Object.keys(levels).join(',');
      console.log(`  ${date}: L${lvs} (${Object.keys(levels).length} papers)`);
    }
  }
  process.exit(0);
}

if (!opts.source) {
  console.error('Usage: node scripts/import-luogu.mjs --source <noip|gesp> [--years 2015-2018] [--group popularization] [--dates 2025-09,2025-12] [--levels 1,2,3,4] [--list]');
  process.exit(1);
}

const papers = resolvePapers(opts.source, opts);
console.error(`\nResolved ${papers.length} papers to fetch.\n`);

// 读取现有题库
let existingBank = {};
try {
  existingBank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
} catch {
  console.error('Warning: could not read existing question bank.');
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const allExtracted = [];
let totalImported = 0;
let totalSkipped = 0;

for (const info of papers) {
  let data;
  try {
    data = await fetchPaper(info.pid);
  } catch (e) {
    console.error(`  SKIP problemset/${info.pid}: ${e.message}`);
    continue;
  }

  const problems = data.problemset.problems || [];
  const imported = [];

  for (const prob of problems) {
    const q = parseLuoguProblem(prob, { paperId: info.pid, ...info });
    if (q) {
      imported.push(q);
    } else {
      totalSkipped++;
    }
  }

  const label = info.source === 'noip'
    ? `NOIP ${info.year} ${info.group === 'popularization' ? '普及组' : '提高组'}`
    : `GESP ${info.dateLabel} L${info.level}`;

  console.error(`  ${label}: ${imported.length} imported, ${problems.length - imported.length} skipped (of ${problems.length} total)`);
  allExtracted.push(...imported);
  totalImported += imported.length;

  // Rate limit
  await new Promise(r => setTimeout(r, 500));
}

console.error(`\nTotal: ${totalImported} imported, ${totalSkipped} skipped.`);

// 写提取结果
const extractedPath = path.join(OUTPUT_DIR, `${opts.source}-extracted.json`);
fs.writeFileSync(extractedPath, JSON.stringify(allExtracted, null, 2));
console.error(`Extracted data → ${extractedPath}`);

// 生成合并文件
const mergeMap = {};
for (const q of allExtracted) {
  mergeMap[q.id] = q;
}
const mergePath = path.join(OUTPUT_DIR, `${opts.source}-to-merge.json`);
fs.writeFileSync(mergePath, JSON.stringify(mergeMap, null, 2));
console.error(`Merge-ready data → ${mergePath}`);

// 检查重复 ID
const existingIds = new Set(Object.keys(existingBank));
const newIds = allExtracted.map(q => q.id);
const duplicates = newIds.filter(id => existingIds.has(id));
if (duplicates.length > 0) {
  console.error(`\n⚠️  ${duplicates.length} duplicate IDs with existing bank:`);
  duplicates.slice(0, 20).forEach(id => console.error(`     ${id}`));
  if (duplicates.length > 20) console.error(`     ...and ${duplicates.length - 20} more`);
}

// 统计
const byKp = {};
for (const q of allExtracted) {
  byKp[q.knowledgePoint] = (byKp[q.knowledgePoint] || 0) + 1;
}
console.error('\nBy knowledge point:');
for (const [kp, count] of Object.entries(byKp).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${kp}: ${count}`);
}

console.error('\nDone.');
