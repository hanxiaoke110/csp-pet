// Record manualVerified evidence for the 15 recovered super-* questions.
// Their children answers were recovered from official papers and verified:
//   - 2021: official answer sheet (pages/2021-J/p13.png) + per-question reasoning
//   - 2022: two independent third-party answer keys + actual g++ compilation runs
//   - 2023: official answer PDF (answers/2023-J.pdf, red-marked) + independent solving
//   - 2024: LUOGU SCP-J official answer key + per-question reasoning (some compiled)
// Run AFTER jury-topup.mjs finishes (evidence file must not be written concurrently).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IDS = [
  'super-2021-completion-1', 'super-2021-reading-1', 'super-2021-reading-2', 'super-2021-reading-3',
  'super-2022-reading-1', 'super-2022-reading-2', 'super-2022-reading-3',
  'super-2023-reading-1', 'super-2023-reading-2', 'super-2023-reading-3',
  'super-2024-completion-1', 'super-2024-completion-2',
  'super-2024-reading-1', 'super-2024-reading-2', 'super-2024-reading-3',
];
const NOTES = {
  '2021': '子题恢复自 CCF CSP-J 2021 官方卷（pages/2021-J），答案以官方答题纸 p13 为准并逐题独立演算复核。',
  '2022': '子题恢复自 CCF CSP-J 2022 官方卷，答案经两个第三方答案源交叉确认并用 g++ 编译实测验证。',
  '2023': '子题恢复自 CCF CSP-J 2023 官方卷，答案以官方答案 PDF（answers/2023-J.pdf 红字）为准并逐题独立演算复核。',
  '2024': '子题恢复自洛谷 SCP-J 2024 模拟卷（该套题的真实出处），答案以官方参考答案为准并逐题独立演算复核。',
};

const canonical = JSON.parse(fs.readFileSync(path.join(root, 'public/course-data/question-bank-v2/canonical.json'), 'utf8'));
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const qmap = new Map(canonical.questions.map(q => [q.id, q]));

for (const id of IDS) {
  const q = qmap.get(id);
  if (!q) { console.log(`${id}: NOT IN CANONICAL`); continue; }
  const year = id.split('-')[1];
  const entry = evidence[id] || {};
  entry.contentHash = q.contentHash;
  entry.collectedAt = new Date().toISOString();
  entry.manualVerified = { approved: true, by: 'kimi-code-review', at: new Date().toISOString(), note: NOTES[year] };
  evidence[id] = entry;
  console.log(`manualVerified: ${id} (${q.children.length} children)`);
}

fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
console.log('Done. Run verify-canonical to update verdicts.');
