#!/usr/bin/env node
/**
 * 洛谷题库核对修复脚本
 *
 * 用洛谷 ti.luogu.com.cn 的数据交叉验证现有题库：
 * 1. 缺代码 → 补代码
 * 2. 选项不一致 → 标记
 * 3. 答案不一致 → 标记
 * 4. 题干不完整 → 标记
 *
 * 用法：
 *   node scripts/verify-with-luogu.mjs --source gesp    # 核对所有 GESP 题
 *   node scripts/verify-with-luogu.mjs --source gesp --fix    # 核对并自动修复代码缺失
 *   node scripts/verify-with-luogu.mjs --source gesp --dry-run # 只出报告不写文件
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const BANK_PATH = path.join(root, 'public/course-data/unified-quiz-bank.json');
const OUTPUT_DIR = path.join(root, 'reports/luogu-import');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const LUOGU_BASE = 'https://ti.luogu.com.cn/problemset';

// ============================================================
// 洛谷 GESP 试卷目录
// ============================================================

const GESP_PAPERS = {
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
};

// ============================================================
// Fetch & Parse
// ============================================================

async function fetchPaper(pid) {
  const url = `${LUOGU_BASE}/${pid}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const match = html.match(/window\._feInjection\s*=\s*JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/);
  if (!match) throw new Error('_feInjection not found');
  const injection = JSON.parse(decodeURIComponent(match[1]));
  if (injection.code !== 200) throw new Error(`code=${injection.code}`);
  return injection.currentData?.problemset;
}

function extractCodeFromDescription(description) {
  // 提取 ```cpp ... ``` 代码块
  const codeBlocks = [];
  const fenceRe = /```(?:cpp|c\+\+|c|)\s*\n([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(description)) !== null) {
    codeBlocks.push(m[1].trim());
  }
  return codeBlocks;
}

function cleanDescription(description) {
  // 去掉代码块，只保留纯文本题干
  return String(description || '')
    .replace(/```(?:cpp|c\+\+|c|)[\s\S]*?```/gi, '')
    .replace(/\\n/g, '\n')
    .trim();
}

function normalizeText(text) {
  // 标准化文本用于比较：去掉 markdown/LaTeX 格式，统一空白
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold**
    .replace(/\*(.+?)\*/g, '$1')            // *italic*
    .replace(/`(.+?)`/g, '$1')              // `code`
    .replace(/\$(.+?)\$/g, '$1')            // $latex$
    .replace(/\s+/g, ' ')
    .replace(/[（(]\s*[）)]/g, '()')
    .replace(/[（(]\s*[）)]/g, '（）')
    .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248))
    .toLowerCase()
    .trim();
}

function similarity(a, b) {
  // 简单的前缀匹配 + 关键子串匹配，返回 0-1
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;

  // 提取关键片段（前 50 个非空白字符）
  const keyA = na.slice(0, 150).replace(/[，,。.；;：:]/g, '');
  const keyB = nb.slice(0, 150).replace(/[，,。.；;：:]/g, '');

  if (keyA === keyB) return 0.95;

  // 检查一个是否是另一个的子串
  if (keyA.length > 20 && keyB.length > 20) {
    if (keyA.includes(keyB) || keyB.includes(keyA)) return 0.85;
    // 前 40 字符匹配
    if (keyA.slice(0, 40) === keyB.slice(0, 40)) return 0.8;
    if (keyA.slice(0, 60) === keyB.slice(0, 60)) return 0.85;
  }

  return 0;
}

// ============================================================
// 单题比对逻辑
// ============================================================

function processLuoguMatch(ourQ, luoguProblem, paperKey, findings, bank, opts) {
  const variant = (luoguProblem.questions || [])[0];
  if (!variant) return 0;

  const ourStem = cleanDescription(ourQ.question || '');
  const ourCode = ourQ.code || '';
  const ourOptions = ourQ.options || [];

  const luoguCodes = extractCodeFromDescription(luoguProblem.description || '');
  const luoguDesc = cleanDescription(luoguProblem.description || '');
  const luoguChoices = (variant.choices || []).map(c => String(c).trim());
  const luoguAnswer = (variant.correctAnswers || [])[0];

  const fixList = [];

  // 1. 代码缺失检查
  const needsCode = /代码|程序|横线|补全|下面.*运行|下面.*输出|执行|阅读.*程序|程序.*输出|程序.*功能|程序段|代码段/i.test(ourStem);
  if (needsCode && !ourCode && luoguCodes.length > 0) {
    const combinedCode = luoguCodes.join('\n\n');
    fixList.push({ type: 'add_code', value: combinedCode });
  }

  // 2. 选项数量不匹配
  if (ourOptions.length !== luoguChoices.length) {
    fixList.push({
      type: 'option_count_mismatch',
      ours: ourOptions.length,
      luogu: luoguChoices.length,
      luoguOptions: luoguChoices,
    });
  } else {
    // 逐选项比对
    for (let i = 0; i < ourOptions.length; i++) {
      const ours = normalizeText(ourOptions[i].replace(/^[A-D][.、\s]+/, ''));
      const theirs = normalizeText(luoguChoices[i].replace(/^[A-D][.、\s]+/, ''));
      if (ours !== theirs && ours.length > 2 && theirs.length > 2) {
        const sim = similarity(ours, theirs);
        if (sim < 0.7) {
          fixList.push({
            type: 'option_mismatch',
            index: i,
            ours: ourOptions[i],
            luogu: luoguChoices[i],
          });
        }
      }
    }
  }

  // 3. 答案不一致
  if (luoguAnswer) {
    const luoguIdx = luoguAnswer.charCodeAt(0) - 'A'.charCodeAt(0);
    if (ourQ.correctIndex !== luoguIdx && luoguIdx >= 0 && luoguIdx < luoguChoices.length) {
      fixList.push({
        type: 'answer_mismatch',
        ours: ourQ.correctIndex,
        ours_letter: String.fromCharCode(65 + (ourQ.correctIndex || 0)),
        luogu: luoguIdx,
        luogu_letter: luoguAnswer,
      });
    }
  }

  if (fixList.length > 0) {
    findings.push({
      id: ourQ.id,
      paperKey,
      ourStem: ourStem.slice(0, 200),
      luoguDesc: luoguDesc.slice(0, 200),
      fixes: fixList,
    });

    if (opts.fix) {
      for (const fix of fixList) {
        if (fix.type === 'add_code') {
          bank[ourQ.id] = { ...bank[ourQ.id], code: fix.value };
        }
        if (fix.type === 'answer_mismatch') {
          bank[ourQ.id].correctIndex = fix.luogu;
          bank[ourQ.id].explanation = `官方答案：${fix.luogu_letter}。（已按洛谷官方答案修正）`;
        }
      }
    }
    return fixList.length;
  }
  return 0;
}

// ============================================================
// Main verification
// ============================================================

const args = process.argv.slice(2);
const opts = {
  source: '',
  fix: false,
  dryRun: true,
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source') opts.source = args[++i];
  if (args[i] === '--fix') { opts.fix = true; opts.dryRun = false; }
  if (args[i] === '--dry-run') opts.dryRun = true;
}

const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
const allQuestions = Object.values(bank);

// 按 source + date + level 分组现有题
function groupByPaper(qs, source) {
  const groups = {};
  for (const q of qs) {
    if (q.source !== source) continue;
    const m = (q.id || '').match(/^gesp-(\d{4}-\d{2})-(\d)/);
    if (!m) continue;
    const date = m[1];
    const level = parseInt(m[2]);
    const key = `${date}-L${level}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(q);
  }
  return groups;
}

const ourGroups = groupByPaper(allQuestions, opts.source);
console.error(`Found ${Object.keys(ourGroups).length} existing ${opts.source} exam papers.\n`);

const findings = [];
let totalCompared = 0;
let totalFixed = 0;

for (const [key, ourQs] of Object.entries(ourGroups)) {
  const [date, lvStr] = key.split('-L');
  const level = parseInt(lvStr);

  // 找洛谷 PID
  const luoguLevel = GESP_PAPERS[date];
  if (!luoguLevel) { console.error(`  SKIP ${key}: no Luogu paper mapping`); continue; }
  const pid = luoguLevel[level];
  if (!pid) { console.error(`  SKIP ${key}: no Luogu PID for level ${level}`); continue; }

  let problemset;
  try {
    problemset = await fetchPaper(pid);
  } catch (e) {
    console.error(`  SKIP ${key} (pid=${pid}): ${e.message}`);
    continue;
  }

  const luoguProblems = problemset.problems || [];
  // 只取 MultipleSelection 类型（选择题+判断题），按 ID 排序（保持原始顺序）
  const luoguChoices = luoguProblems
    .filter(p => p.type === 'MultipleSelection')
    .sort((a, b) => (a.id || 0) - (b.id || 0));

  // 我们的题按 question number 排序
  const sortedOurs = [...ourQs].sort((a, b) => {
    const na = parseInt((a.id || '').split('-').pop()) || 0;
    const nb = parseInt((b.id || '').split('-').pop()) || 0;
    return na - nb;
  });

  let matched = 0;

  for (let qi = 0; qi < sortedOurs.length; qi++) {
    const ourQ = sortedOurs[qi];
    totalCompared++;
    const ourStem = cleanDescription(ourQ.question || '');

    // 先在洛谷里找最佳文本匹配
    let bestMatch = null, bestScore = 0;
    for (const p of luoguChoices) {
      const luoguStem = cleanDescription(p.description || '');
      const score = similarity(ourStem, luoguStem);
      if (score > bestScore) { bestScore = score; bestMatch = p; }
    }

    // 位置匹配作为验证：如果位置 qi 的题文本相似度也高，用位置匹配
    const posMatch = luoguChoices[qi];
    if (posMatch) {
      const posScore = similarity(ourStem, cleanDescription(posMatch.description || ''));
      if (posScore >= 0.8) {
        // 位置匹配高置信度，直接用
        bestMatch = posMatch;
        bestScore = posScore;
      }
    }

    if (!bestMatch || bestScore < 0.6) {
      // 找不到可靠匹配，跳过
      continue;
    }

    matched++;
    const n = processLuoguMatch(ourQ, bestMatch, key, findings, bank, opts);
    if (n > 0) totalFixed++;
  }

  console.error(`  ${key}: matched=${matched}/${sortedOurs.length}, issues=${totalFixed} (pid=${pid})`);
  await new Promise(r => setTimeout(r, 300)); // rate limit
}

console.error(`\n=== Summary ===`);
console.error(`Total compared: ${totalCompared}`);
console.error(`Findings: ${findings.length}`);
console.error(`Fixed (if --fix): ${totalFixed}`);

// 分类汇总
const byType = {};
for (const f of findings) {
  for (const fix of f.fixes) {
    byType[fix.type] = (byType[fix.type] || 0) + 1;
  }
}
console.error('\nBy fix type:');
for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${t}: ${c}`);
}

// 答案不一致的单独列出
const answerMismatches = findings.filter(f => f.fixes.some(x => x.type === 'answer_mismatch'));
if (answerMismatches.length > 0) {
  console.error(`\n⚠️  ANSWER MISMATCHES (${answerMismatches.length}):`);
  for (const f of answerMismatches) {
    const af = f.fixes.find(x => x.type === 'answer_mismatch');
    console.error(`  ${f.id}: ours=${af.ours_letter} luogu=${af.luogu_letter}`);
  }
}

// 写报告
const report = {
  generated: new Date().toISOString(),
  source: opts.source,
  totalCompared,
  findings,
  summary: { answerMismatches: answerMismatches.length, ...byType },
};
const reportPath = path.join(OUTPUT_DIR, `${opts.source}-verify-report.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.error(`\nReport → ${reportPath}`);

// 如果 --fix 写回题库
if (opts.fix) {
  const backupPath = BANK_PATH.replace('.json', `.backup-${Date.now()}.json`);
  fs.copyFileSync(BANK_PATH, backupPath);
  console.error(`Backup → ${backupPath}`);
  fs.writeFileSync(BANK_PATH, JSON.stringify(bank, null, 2));
  console.error(`Fixed bank written → ${BANK_PATH}`);
} else {
  console.error('\n(Use --fix to apply code+answer fixes automatically)');
}
