// One-off repair: gesp-2024-06-4-13（GESP 2024-06 四级第13题）canonical 里 code 为 null，
// 题干「下面的程序中，如果输入10 0，会输出（ ）」学生无法作答（2026-08-17 学生反馈）。
// 官方原卷代码此前已在 src-dungeon/data/csp-exam-bank.json 中补全（Division 异常处理示例），
// 本脚本把该代码同步进 V2 canonical + verification（contentHash 重算、revision 提升），
// 随后跑 publish-snapshots.mjs 重新发布渠道。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stableContentHash } from './lib/normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'public/course-data/question-bank-v2');
const canonicalPath = path.join(outDir, 'canonical.json');
const verificationPath = path.join(outDir, 'verification.json');

const QUESTION_ID = 'gesp-2024-06-4-13';
// 与 src-dungeon/data/csp-exam-bank.json 中同 ID 题的官方原卷代码一致
const FIXED_CODE = `#include <iostream>
using namespace std;
double Division(int a, int b)
{
    if (b == 0)
        throw "Division by zero condition!";
    else
        return ((double)a / (double)b);
}
void func()
{
    int len, time;
    cin >> len >> time;
    cout << Division(len, time) << endl;
}
int main()
{
    try {
        func();
    }
    catch (const char* errmsg) {
        cout << errmsg << endl;
    }
    catch (const int errmsg) {
        cout << errmsg << endl;
    }
    return 0;
}`;

const NEW_REVISION = 50005479324;

// ---- canonical ----
const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
const question = canonical.questions.find(q => q.id === QUESTION_ID);
if (!question) throw new Error(`${QUESTION_ID} not found in canonical`);
if (question.code) throw new Error(`${QUESTION_ID} already has code, abort`);

question.question = question.question.normalize('NFKC'); // 下⾯→下面、输⼊→输入（兼容字符归一）
question.code = FIXED_CODE;
const { contentHash: _old, importOrigin, importPriority, ...hashable } = question;
question.contentHash = stableContentHash(hashable);
canonical.contentRevision = NEW_REVISION;
fs.writeFileSync(canonicalPath, `${JSON.stringify(canonical, null, 2)}\n`);

// ---- verification ----
const verification = JSON.parse(fs.readFileSync(verificationPath, 'utf8'));
const verdict = verification.results.find(r => r.questionId === QUESTION_ID);
if (!verdict) throw new Error(`${QUESTION_ID} verdict not found in verification`);
verdict.contentHash = question.contentHash;
verdict.evidence.contentHash = question.contentHash;
verdict.evidence.codeRestored = {
  at: '2026-08-17',
  note: '学生反馈缺代码无法作答；从 src-dungeon/data/csp-exam-bank.json 同步官方原卷代码（Division 除零异常处理示例）。答案保持 A（官方原卷答案表 2026-08-04 已确认）。',
};
verdict.evidence.deterministic = {
  ...verdict.evidence.deterministic,
  reason: 'code_restored_after_verification',
};
verification.contentRevision = NEW_REVISION;
verification.verificationRevision = NEW_REVISION;
fs.writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);

console.log(`${QUESTION_ID} code restored. canonical/verification contentRevision -> ${NEW_REVISION}`);
console.log(`new contentHash: ${question.contentHash}`);
