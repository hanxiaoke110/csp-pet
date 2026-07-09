import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'reports/gesp-2026-06/text');

const ANSWERS = {
  1: 'CDDCBDCCAABABBB'.split(''),
  2: 'CBDBBBAAADABDBA'.split(''),
  3: 'ABCBACCABDDBCBB'.split(''),
  4: 'BBCCBCBCCBCBCCA'.split(''),
};

for (const [level, answers] of Object.entries(ANSWERS)) {
  if (answers.length !== 15) throw new Error(`level ${level} answer count should be 15`);
}

const FIXES = new Map([
  ['3-2', {
    question: '计算机厂商为了计算方便，一般采用 1000 进制。如果我们买的厂商标注的是 1 TB 的硬盘，它实际的存储容量是（ ）。',
    options: [
      'A. 1000 × 1000 × 1000 × 1000 ÷ 1024 ÷ 1024 ÷ 1024b = 931Gb',
      'B. 1000 × 1000 × 1000 × 1000 ÷ 1024 ÷ 1024 ÷ 1024B = 931GB',
      'C. 1024 × 1024 × 1024 × 1024 ÷ 1000 ÷ 1000 ÷ 1024B = 1049GB',
      'D. 1000 × 1024 × 1024 × 1024 ÷ 1024 ÷ 1024 ÷ 1024b = 977Gb',
    ],
  }],
  ['2-15', {
    question: '某学校举办“校园演讲比赛”，每位选手由 8 位评委打分（分数为 0 ~ 10 的整数），且每位评委必须打分。计分规则：去掉一个最高分，去掉一个最低分。如下程序通过键盘先输入选手编号，然后依次输入 8 个分数，并计算最终得分。下列说法正确的是（ ）。',
  }],
  ['3-15', {
    question: '现在有一个数，请你分别判断它们是否可能是二进制、八进制、十进制、十六进制。例如，6AFF 就只可能是十六进制，而 1011 则是四种进制皆有可能。输入 N（保证 1 <= N <= 1000），表示有 N 个数让你进行判断，接下来输入 N 个字符串（保证所有字符串长度不超过 10），判断可能是四个进制当中的哪个进制数。输出 N 行，每行 4 个数，用空格隔开，分别表示给定的字符串是否可能表示一个二进制数、八进制数、十进制数、十六进制数。使用 1 表示可能，使用 0 表示不可能。下面程序横线处可以满足这个要求的是（ ）。',
  }],
  ['4-6', {
    question: '小杨正在开发一款名为“星际网格”的游戏，他用二维数组 int map[5][4]; 来表示地图。已知 int 占 4 字节，如果 map 的内存地址是 0x2000，则表达式 &map + 1 的地址值是（ ）。',
  }],
  ['4-8', {
    question: '某班 3 个小组、每组 4 名同学的分数存入下面的二维数组 score，则 score[1][2] 的值是（ ）。',
  }],
  ['3-3', {
    question: '低 4 位、高 4 位压缩技术，适用于数据仅使用字节的一部分（如仅用低 4 位）的场景。字节结构：一个字节为 8 位，分为高 4 位（高位）和低 4 位（低位）。当数据是十六进制数（0 ~ 15，即 0x0 到 0xF），每个值仅需 4 位表示，高 4 位全为 0。将两个相邻的 4 位值合并为一个字节。四个数据 0x1、0x2、0x3、0x4 采用上述压缩技术压缩以后是（ ）。',
  }],
  ['3-4', {
    options: [
      'A. 负数的补码，一个快速方法是从右往左扫描正数的二进制形式，遇到第一个 1 之后，左边的所有位都取反。',
      'B. 对于一个 n 位的二进制数：最大表示范围：[-(2^(n-1))-1, +(2^(n-1)-1)]。',
      'C. 反码减法可以统一为加法。符号位可以直接参与运算。',
      'D. 反码表示中，0 的表示不唯一：0000 0000B 和 1111 1111B。',
    ],
  }],
  ['3-6', {
    options: [
      'A. 找唯一数：数组中唯一出现一次的数，其余出现两次，全部异或结果即为该数。例如：数组 [5, 7, 9, 7, 5]（唯一数是 9）。',
      'B. 交换两个数：a ^= b; b ^= a; a ^= b;（无需临时变量）。',
      'C. 将二进制位整体左移 n 位，高位溢出舍弃，低位补 0；等价于 num 乘以 2^n。',
      'D. 对每一个二进制位取反，包括符号位，简单运算规则是 ~n = -n - 1。',
    ],
  }],
  ['3-9', {
    question: '在 C++ 中，对于 32 位有符号整数 int 类型数据 n，关于按位取反运算符 ~，下列说法正确的是（ ）。',
  }],
  ['3-10', {
    options: [
      'A. 原码是最直观的一种有符号数表示方法。最高位（最左边的位）为符号位：0 表示正数，1 表示负数，其余位为数值位（真值的绝对值）。',
      'B. 补码完美解决了原码和反码的缺陷，是现代计算机中表示有符号整数的标准方式。正数的补码与其原码、反码相同；负数的补码是将其对应正数的原码按位取反（得到反码），然后加 1。',
      'C. 计算补码的一个更快的技巧：从右往左扫描正数的二进制形式，遇到第一个 1 之后，左边的所有位都取反。',
      'D. 对于一个 n 位的二进制数，补码最大表示范围为 [-2^(n-1), +2^(n-1)]。',
    ],
  }],
  ['3-11', {
    options: [
      'A. num & 1，结果为 1 则奇数，0 则偶数（仅看最低位）。',
      'B. num & 0xFF 保留低 8 位。',
      'C. num & b 的结果一定小于等于 num。',
      'D. 若 num 左移导致高位溢出（如超过整型范围），结果符合乘法规律。',
    ],
  }],
  ['4-12', {
    question: '小杨的机器人正在能量踏板上跳跃，踏板编号为 1, 2, 3, ...。跳到第 n 块踏板的方案数满足递推式 f(n) = f(n - 1) + f(n - 2)。若 f(1) = 1, f(2) = 2，则运行以下代码计算 jump(5) 的结果是（ ）。',
  }],
  ['4-13', {
    question: '在“模拟实验室”程序中，为了防止除以 0 导致崩溃，小杨使用了异常处理机制。执行以下代码将输出（ ）。',
  }],
]);

const ZH_FIX = new Map(Object.entries({
  '⽉': '月', '⼩': '小', '⽼': '老', '⽐': '比', '⼆': '二', '⾏': '行',
  '⽂': '文', '⾯': '面', '⽤': '用', '⼗': '十', '⾃': '自', '⼀': '一',
  '⼋': '八', '⾼': '高', '⽰': '示', '⽅': '方', '⼯': '工', '⾊': '色',
  '⼊': '入', '⽆': '无', '⼜': '又', '⽬': '目', '⾝': '身', '⼿': '手',
  '⽽': '而', '⽣': '生', '⾥': '里', '⽯': '石', '⼝': '口', '⽇': '日',
  '⽴': '立', '⼤': '大', '⾦': '金', '⼟': '土', '⽕': '火', '⽔': '水',
  '⽊': '木', '⼈': '人', '⼦': '子', '⺟': '母', '⼚': '厂', '⾜': '足',
  '⾄': '至', '⽌': '止', '⽐': '比', '⽤': '用', '⼝': '口', '⽐': '比',
}));

function normalizeText(text) {
  let s = String(text || '').normalize('NFKC');
  for (const [from, to] of ZH_FIX) s = s.replaceAll(from, to);
  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function unwrapText(text) {
  return normalizeText(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('');
}

function cleanLine(line) {
  return normalizeText(line)
    .replace(/^--- page \d+ ---$/, '')
    .replace(/^\d+\s*\/\s*\d+$/, '')
    .trimEnd();
}

function answerIndex(letter) {
  return { A: 0, B: 1, C: 2, D: 3 }[letter];
}

function knowledgePoint(level, no, question, code) {
  const text = `${question}\n${code || ''}`;
  if (/编码|二进制|补码|反码|位运算|按位|0x|bit|Byte|KB|TB|硬盘|字节/.test(text)) return '计算机基础';
  if (/数组|字符串|string|char|strcpy|strcat|二维数组/.test(text)) return '数组/字符串';
  if (/函数|return|形参|引用|指针|结构体|struct|异常|文件|ifstream/.test(text)) return '函数/结构体';
  if (/排序|稳定|递推|算法|复杂度|质数|枚举|corner case/.test(text)) return '算法基础';
  if (/for|while|循环|break|continue/.test(text)) return '循环结构';
  if (/if|else|条件|判断/.test(text)) return '条件判断';
  if (/cin|cout|printf|scanf|输入|输出/.test(text)) return '输入输出';
  if (/表达式|运算|变量|类型|float|int|double|bool|not|or|and/.test(text)) return '表达式与运算';
  return `GESP 2026年6月${level}级真题`;
}

function parseLevel(level) {
  const txt = fs.readFileSync(path.join(sourceDir, `gesp-2026-06-cpp-${level}.txt`), 'utf8');
  const lines = txt.split('\n').map(cleanLine).filter(line => line.trim());
  const start = lines.findIndex(line => /^第 1 题/.test(line));
  const end = lines.findIndex((line, index) => index > start && /^2 判断题/.test(line));
  const body = lines.slice(start, end);
  const starts = [];
  body.forEach((line, index) => {
    const match = line.match(/^第 (\d+) 题/);
    if (match && Number(match[1]) <= 15) starts.push([Number(match[1]), index]);
  });

  const questions = [];
  for (let i = 0; i < starts.length; i++) {
    const [no, index] = starts[i];
    const next = i + 1 < starts.length ? starts[i + 1][1] : body.length;
    const chunk = body.slice(index, next).filter(line => !/^\d+\s*\/\s*\d+$/.test(line));
    const firstOpt = chunk.findIndex(line => /^[ABCD]\./.test(line.trim()));
    const before = firstOpt >= 0 ? chunk.slice(0, firstOpt) : chunk;
    const optLines = firstOpt >= 0 ? chunk.slice(firstOpt) : [];

    const codeLines = [];
    const qLines = [];
    for (const raw of before) {
      const stripped = raw.replace(/^第 \d+ 题\s*/, '').trim();
      if (/^\d+$/.test(stripped)) continue;
      if (/^\d+\s+/.test(stripped)) {
        const code = stripped.replace(/^\d+\s*/, '').trimEnd();
        if (code && !/^\d+$/.test(code)) codeLines.push(code);
      } else if (stripped) {
        qLines.push(stripped);
      }
    }

    const options = [];
    let current = null;
    for (const raw of optLines) {
      const line = raw.trim();
      const match = line.match(/^([ABCD])\.\s*(.*)$/);
      if (match) {
        if (current) options.push(current);
        current = `${match[1]}. ${match[2]}`;
      } else if (current) {
        const cont = line.replace(/^\d+\s*/, '').trimEnd();
        if (cont && !/^\d+$/.test(cont)) current += `\n${cont}`;
      }
    }
    if (current) options.push(current);

    const key = `${level}-${no}`;
    const fix = FIXES.get(key) || {};
    const answer = ANSWERS[level][no - 1];
    const question = fix.question || unwrapText(qLines.join('\n').replace(/^第 \d+ 题\s*/, ''));
    const code = fix.code === null ? null : (fix.code || (codeLines.length ? codeLines.join('\n') : null));
    const fixedOptions = fix.options || options.map(option => normalizeText(option));
    questions.push({
      id: `gesp-2026-06-${level}-${String(no).padStart(2, '0')}`,
      source: 'gesp',
      year: 2026,
      month: 6,
      knowledgePoint: knowledgePoint(level, no, question, code),
      question,
      ...(code ? { code } : {}),
      options: fixedOptions,
      correctIndex: answerIndex(answer),
      explanation: `官方答案：${answer}。`,
      difficulty: level,
      questionType: 'choice',
      hasImage: false,
      level,
    });
  }
  return questions;
}

function toDungeonQuestion(q) {
  return {
    id: q.id,
    year: q.year,
    month: q.month,
    group: 'GESP',
    type: 'choice',
    knowledgePoint: q.knowledgePoint,
    difficulty: q.difficulty,
    question: q.question,
    code: q.code || null,
    image: q.image || null,
    codeImage: q.codeImage || null,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    level: q.level,
  };
}

const additions = [1, 2, 3, 4].flatMap(parseLevel);
const bad = additions.filter(q => q.options.length !== 4 || q.correctIndex == null || !q.question);
if (bad.length) {
  console.error(JSON.stringify(bad, null, 2));
  throw new Error(`bad parsed questions: ${bad.length}`);
}

fs.mkdirSync(path.join(root, 'reports/gesp-2026-06'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/gesp-2026-06/generated-choice-questions.json'), JSON.stringify(additions, null, 2));

const unifiedPath = path.join(root, 'public/course-data/unified-quiz-bank.json');
const unified = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));
for (const q of additions) unified[q.id] = q;
fs.writeFileSync(unifiedPath, `${JSON.stringify(unified, null, 2)}\n`);

const dungeonPath = path.join(root, 'src-dungeon/data/csp-exam-bank.json');
const dungeon = JSON.parse(fs.readFileSync(dungeonPath, 'utf8'));
const existing = new Set(dungeon.questions.map(q => q.id));
const withoutOld = dungeon.questions.filter(q => !additions.some(add => add.id === q.id));
dungeon.questions = [...withoutOld, ...additions.map(toDungeonQuestion)];
fs.writeFileSync(dungeonPath, `${JSON.stringify(dungeon, null, 2)}\n`);

console.log(`generated: ${additions.length}`);
for (const level of [1, 2, 3, 4]) {
  console.log(`level ${level}: ${additions.filter(q => q.level === level).length}`);
}
console.log(`replaced existing: ${additions.filter(q => existing.has(q.id)).length}`);
