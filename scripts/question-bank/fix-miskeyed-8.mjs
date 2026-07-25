// Fix 8 genuinely mis-keyed canonical answers found via the
// model_canonical_conflict dispute bucket (2026-07-24).
//
// Each fix is backed by THREE independent confirmations:
//   1. unanimous DeepSeek jury votes for the corrected answer
//   2. independent blind solve (Kimi, different model family)
//   3. the question's own stored explanation reasoning (several explanations
//      explicitly state the canonical key was wrong, e.g. gesp-2024-03-1-08)
//
// Fixes are applied to SOURCE data (never directly to canonical.json):
//   - csp-j-2022-c03 / csp-j-2022-c14  → csp-choice-recovery.json
//   - the rest                          → .tmp/reviewed-question-bank.json
// Rebuild afterwards, then re-jury (rejury-fixed-8.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FIXES = {
  'csp-j-2020-c13': {
    correctIndex: 2, // C 己丑
    explanation: '1949%10=9→己，1949%12=5→丑（2020%12=4为子，顺推5为丑）。1949年为己丑年。答案C。',
  },
  'csp-j-2022-c03': {
    correctIndex: 3, // D 将p指向y的地址
    explanation: 'p=q 是指针赋值：p 改为指向 q 所指的变量 y，即 p 指向 y 的地址。答案D。考查指针赋值与指向关系。',
  },
  'csp-j-2022-c14': {
    correctIndex: 0, // A 12
    explanation: '按长度枚举去重：a,b,c(3个)；ab,bc,ca(3个)；abc,bca,cab(3个)；abca,bcab(2个)；abcab(1个)，共12个。答案A。',
  },
  'gesp-2024-03-1-08': {
    correctIndex: 0, // A 30
    explanation: 'i%3 且 i%7 非零即不能被 3 或 7 整除。1~10 中符合条件的为 1,2,4,5,8,10，和为 30。答案A。',
  },
  'gesp-2024-12-1-15': {
    correctIndex: 2, // C N=N/10
    explanation: '每次循环先取个位 n1，再 N=N/10 去掉个位，然后取新的个位 n2，比较相邻两位是否递增。答案C。',
  },
  'gesp-2025-06-1-08': {
    correctIndex: 2, // C 9 10
    explanation: '前置 ++ 返回左值，故 (++X)++ 合法：先 ++X 使 X=9，输出后置++的旧值 9，随后 X 变为 10。输出 9，X 为 10。答案C。',
  },
  'gesp-2025-06-2-08': {
    correctIndex: 3, // D 132
    explanation: '外循环结束 i=12；内循环最后一次在 i=11 时执行，结束后 j=11。输出 i*j=12*11=132。答案D。',
  },
  'gesp-2025-06-2-15': {
    correctIndex: 1, // B
    explanation: 'now_number=0 本就位于 L1 与 L2 之间，移动后效果不变，A 说法正确；数字逢 10 归零，出现 9 后接 0 的行并不递增，B 说法错误。答案B。',
  },
};

const RECOVERY_IDS = new Set(['csp-j-2022-c03', 'csp-j-2022-c14']);

// 1. recovery source
const recoveryPath = path.join(root, 'scripts/question-bank/data/csp-choice-recovery.json');
const recovery = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'));
for (const q of recovery.questions) {
  const fix = FIXES[q.id];
  if (fix && RECOVERY_IDS.has(q.id)) {
    console.log(`${q.id}: ${q.answer.correctIndex} -> ${fix.correctIndex}`);
    q.answer.correctIndex = fix.correctIndex;
    q.explanation = fix.explanation;
  }
}
fs.writeFileSync(recoveryPath, JSON.stringify(recovery, null, 2));

// 2. reviewed export (note: some CSP questions use legacy id format, e.g.
// csp-j-2020-c13 is stored as csp-j-2020-013)
const REVIEWED_KEYS = { 'csp-j-2020-c13': 'csp-j-2020-013' };
const reviewedPath = path.join(root, '.tmp/reviewed-question-bank.json');
const reviewed = JSON.parse(fs.readFileSync(reviewedPath, 'utf8'));
for (const [id, fix] of Object.entries(FIXES)) {
  if (RECOVERY_IDS.has(id)) continue;
  const key = REVIEWED_KEYS[id] || id;
  const q = reviewed.questions[key];
  if (!q) throw new Error(`${id} (${key}) not found in reviewed export`);
  console.log(`${id} [${key}]: ${q.correctIndex} -> ${fix.correctIndex}`);
  q.correctIndex = fix.correctIndex;
  q.explanation = fix.explanation;
}
fs.writeFileSync(reviewedPath, JSON.stringify(reviewed, null, 2));

console.log('8 answers fixed in source data. Rebuild canonical next.');
