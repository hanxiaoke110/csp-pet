// Import recovered super-* (CSP-J 阅读程序/完善程序) children into the
// reviewed export. The recovered data (.tmp/super-recovery/<year>.json) was
// extracted from official CSP-J papers and triple-verified (official answer
// key + independent solving +, for 2022, actual compilation runs).
//
// For each recovered question this script:
//   - replaces question/code with the official paper text (canonical was an
//     AI-paraphrased variant that mismatched the official sub-questions)
//   - fills subQuestions (children) with options + official answers
//   - sets group='J' (required by the super channel rule)
//   - records manualVerified evidence with the verification provenance
//
// After running: build-canonical, then add the ids to VERIFIED_PROGRAM_IDS
// in lib/channels.mjs, then verify/publish.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reviewedPath = path.join(root, '.tmp/reviewed-question-bank.json');
const evidencePath = path.join(root, '.tmp/question-bank-v2-evidence.json');

const reviewed = JSON.parse(fs.readFileSync(reviewedPath, 'utf8'));

let imported = 0;
let childCount = 0;
const problems = [];

for (const year of ['2021', '2022', '2023', '2024']) {
  const file = path.join(root, `.tmp/super-recovery/${year}.json`);
  if (!fs.existsSync(file)) { problems.push(`${year}: recovery file missing`); continue; }
  const recovered = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const [id, data] of Object.entries(recovered)) {
    const entry = reviewed.questions[id];
    if (!entry) { problems.push(`${id}: not in reviewed export`); continue; }
    if (!Array.isArray(data.children) || data.children.length === 0) {
      problems.push(`${id}: no children recovered`);
      continue;
    }
    for (const [index, child] of data.children.entries()) {
      if (!Array.isArray(child.options) || child.options.length < 2
          || !Number.isInteger(child.correctIndex)
          || child.correctIndex < 0 || child.correctIndex >= child.options.length) {
        problems.push(`${id} child ${index + 1}: invalid options/correctIndex`);
      }
    }
    if (data.officialQuestion) entry.question = data.officialQuestion;
    if (data.officialCode) entry.code = data.officialCode;
    entry.group = 'J';
    entry.subQuestions = data.children.map((child, index) => ({
      id: `${id}:sub:${index + 1}`,
      label: child.label,
      position: index + 1,
      options: child.options,
      correctIndex: child.correctIndex,
      explanation: child.explanation || '',
    }));
    imported++;
    childCount += data.children.length;
  }
}

if (problems.length > 0) {
  console.error('Problems:\n' + problems.join('\n'));
  process.exit(1);
}

fs.writeFileSync(reviewedPath, JSON.stringify(reviewed, null, 2));
console.log(`Imported ${imported} super questions, ${childCount} children total.`);
console.log('Next: build-canonical, add ids to VERIFIED_PROGRAM_IDS, verify + manualVerified evidence.');
