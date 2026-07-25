// Manual-review source repairs (2026-07-24), each verified against the
// official GESP paper (OCR text / page image in reports/gesp-sources/).
//
//   gesp-2025-06-2-04  options replaced with the OFFICIAL option set
//                      (canonical options were fabricated and two of them worked)
//   gesp-2025-03-1-02  full question replacement (canonical content did not
//                      match the official 2025-03 一级 Q2 at all)
//   gesp-2024-09-3-10  stem+code restored from official paper (was garbled)
//   gesp-2024-12-3-09  code restored from official paper (was truncated)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reviewedPath = path.join(root, '.tmp/reviewed-question-bank.json');
const reviewed = JSON.parse(fs.readFileSync(reviewedPath, 'utf8'));

function patch(id, changes) {
  const q = reviewed.questions[id];
  if (!q) throw new Error(`${id} not found`);
  Object.assign(q, changes);
  console.log(`patched ${id}`);
}

patch('gesp-2025-06-2-04', {
  // Official options (reports/gesp-sources/ocr/2025-06-2.txt page 2):
  options: ['A. N % 1000 / 100', 'B. N / 1000 % 100', 'C. N / 1000 / 100', 'D. N % 100 / 100'],
  correctIndex: 0, // official answer key line: 答案 CACAD… → Q4 = A
  explanation: '如 N=1234：N%1000=234，234/100=2，即百位。答案A。B 的 N/1000%100=1，C、D 结果均为 0。',
});

patch('gesp-2025-03-1-02', {
  // Official 2025-03 一级 Q2 (reports/gesp-sources/ocr/2025-03-1.txt):
  question: '在某集成开发环境中编辑一个源代码文件时，不可以执行下面（ ）操作。',
  options: ['A. 修改变量定义', 'B. 保存代码修改', 'C. 撤销代码修改', 'D. 插入执行截图'],
  correctIndex: 3, // D
  explanation: '在 IDE 中编辑源代码文件时，可以修改变量定义、保存修改、撤销修改；执行截图是图片，无法插入纯文本的源代码文件。答案D。',
});

patch('gesp-2024-09-3-10', {
  // Official 2024-09 三级 Q10 (reports/gesp-sources/ocr/2024-09-3.txt):
  question: '下列程序中，result 和 result2 输出分别是（ ）。',
  code: `long a = 123;
int b = 1;
long result = a & b;
cout << result << endl;

long a2 = -123;
unsigned int b2 = -1;
long result2 = a2 & b2;
cout << result2 << endl;`,
  // correctIndex stays 3 (D: 1 -123)
  explanation: 'result = 123 & 1 = 1。b2 = -1 转为 unsigned int 为 0xFFFFFFFF，a2 = -123 与其按位与后保留低 32 位补码，转回 long 仍为 -123。输出 1 -123。答案D。',
});

patch('gesp-2024-12-3-09', {
  // Official 2024-12 三级 Q9 (reports/gesp-sources/ocr/2024-12-3.txt):
  question: '下列程序输出的是（ ）。',
  code: `string ch = "hello";
if (ch[5] == NULL) {
    cout << "right" << endl;
} else if (ch[5] == '\\e') {
    cout << "wrong" << endl;
} else {
    cout << "hello" << endl;
}`,
  // correctIndex stays 0 (A: right)
  explanation: '"hello" 下标 0~4 为字母，ch[5] 是结尾的空字符 \'\\0\'，与 NULL 相等，进入第一个分支输出 right。答案A。',
});

fs.writeFileSync(reviewedPath, JSON.stringify(reviewed, null, 2));
console.log('done — rebuild canonical next');
