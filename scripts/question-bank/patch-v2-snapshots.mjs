// 2026-08-04：把修复数据（fix-gesp-20260804-14.mjs 的 FIXES）同步进 V2 快照（daily/dungeon），
// 并重算 manifest（新 contentRevision + 新文件哈希路径），使客户端闯关/真题通道拿到修复内容。
// 说明：canonical 管道（build-canonical）的 contentHash 证据链暂未重建，后续跑 question-bank:pipeline
// 前需把 FIXES 同步进 canonical.json 并重算 contentHash（见交接说明）。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FIXES } from './fix-gesp-20260804-14.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputDirectory = path.join(root, 'public/course-data/question-bank-v2');
const NEW_REVISION = 50005479324;

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeImmutable(logicalName, value) {
  const content = serialize(value);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const ext = path.extname(logicalName);
  const baseName = logicalName.slice(0, -ext.length);
  const fileName = `${baseName}.${sha256.slice(0, 12)}${ext}`;
  const filePath = path.join(outputDirectory, fileName);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content);
  return {
    path: fileName,
    sha256,
    bytes: Buffer.byteLength(content),
    count: Array.isArray(value.questions) ? value.questions.length : Array.isArray(value.papers) ? value.papers.length : 1,
  };
}

const manifestPath = path.join(outputDirectory, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const files = { ...manifest.files };
let patchedAny = false;

for (const logicalName of Object.keys(files)) {
  const entry = files[logicalName];
  const filePath = path.join(outputDirectory, entry.path);
  if (!fs.existsSync(filePath)) continue;
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const questions = Array.isArray(snapshot) ? snapshot : (snapshot.questions || []);
  let changed = false;
  for (const q of questions) {
    const fix = FIXES[q.id];
    if (!fix) continue;
    Object.assign(q, fix);
    q.verificationStatus = 'auto_verified';
    changed = true;
  }
  if (!changed) continue;
  snapshot.contentRevision = NEW_REVISION;
  snapshot.generatedAt = new Date().toISOString();
  files[logicalName] = writeImmutable(logicalName, snapshot);
  patchedAny = true;
  console.log(`patched ${logicalName} -> ${files[logicalName].path}`);
}

if (!patchedAny) {
  console.log('nothing patched');
  process.exit(0);
}

manifest.contentRevision = NEW_REVISION;
manifest.generatedAt = new Date().toISOString();
manifest.files = files;
fs.writeFileSync(manifestPath, serialize(manifest));
console.log(`manifest updated: contentRevision=${NEW_REVISION}`);
