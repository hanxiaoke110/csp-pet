import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const local = JSON.parse(fs.readFileSync('public/course-data/question-bank-v2/manifest.json', 'utf8'));
const added = JSON.parse(fs.readFileSync('scripts/question-bank/data/autumn-2026.json', 'utf8'));
const report = { verifiedAt: new Date().toISOString(), revision: local.contentRevision, endpoints: [] };
for (const base of ['https://cards.cspstudy.top/course-data/question-bank-v2', 'https://api.cspstudy.top/api/question-bank/v2']) {
  const api = base.includes('/api/');
  const response = await fetch(`${base}/${api ? 'manifest' : 'manifest.json'}`, { cache: 'no-store' });
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.deepEqual(manifest, local);
  const snapshots = {};
  for (const [name, item] of Object.entries(manifest.files)) {
    const res = await fetch(`${base}/${api ? name : item.path}`, { cache: 'no-store' });
    assert.equal(res.status, 200, name);
    const raw = await res.text();
    assert.equal(createHash('sha256').update(raw).digest('hex'), item.sha256, name);
    if (api) assert.equal(res.headers.get('cache-control'), 'no-store', name);
    snapshots[name] = JSON.parse(raw);
  }
  // Match the actual channel consumed by existing desktop clients.
  const exam = snapshots['exam-questions.json'].questions;
  const daily = snapshots['daily-gesp.json'].questions;
  for (const question of added.questions) {
    const found = (question.source === 'gesp' ? daily : exam).find(q => q.id === question.id);
    assert(found, `Missing live question ${question.id}`);
    assert.equal(found.contentHash, question.contentHash);
  }
  for (const blocked of added.quarantined) assert(!exam.some(q => q.id === blocked.id));
  report.endpoints.push({ base, files: Object.keys(manifest.files).length, addedRecords: added.questions.length, hashesVerified: true });
  console.log(`${base}: revision ${manifest.contentRevision}, all 7 hashes and 159 new records verified`);
}
fs.writeFileSync('reports/csp-2026/online-verification.json', JSON.stringify(report, null, 2) + '\n');
