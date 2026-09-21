import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HASHED_SNAPSHOT = /^(daily-gesp|super-cspj|exam-questions|exam-manifests|dungeon-mixed|topic-practice|verification-summary)\.[a-f0-9]{12}\.json$/;
const AUTHORING_FILES = new Set([
  'canonical.json',
  'verification.json',
  'exam-manifests.json',
  'source-catalog.json',
]);

const UNUSED_RUNTIME_PATHS = [
  '3d-preview.html',
  'batch-preview.html',
  'pet-preview.html',
  'pet-preview-all.html',
  'download.html',
  'tauri.svg',
  'vite.svg',
  'course-data/unified-quiz-bank.backup-1783601740325.json',
  'course-data/course-card-index.json',
  'course-data/lessons.json',
  'course-data/stages.json',
  'course-data/quiz-bank.json',
  'course-data/unified-quiz-bank.json',
  'course-data/version.json',
  // These answer-sheet crops are deliberately blocked by every quiz renderer.
  // Their structured code equivalents remain in the bundled question banks.
  'course-data/gesp-code-images',
];

function removeUnusedRuntimeFiles(distRoot) {
  const directoryBytes = directory => fs.readdirSync(directory, { withFileTypes: true })
    .reduce((total, entry) => {
      const entryPath = path.join(directory, entry.name);
      return total + (entry.isDirectory() ? directoryBytes(entryPath) : fs.statSync(entryPath).size);
    }, 0);
  let removedBytes = 0;
  let removedPaths = 0;
  for (const relativePath of UNUSED_RUNTIME_PATHS) {
    const target = path.join(distRoot, relativePath);
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    removedBytes += stat.isDirectory() ? directoryBytes(target) : stat.size;
    fs.rmSync(target, { recursive: true, force: true });
    removedPaths += 1;
  }
  return { removedBytes, removedPaths };
}

export async function optimizeBundledPetSprites(distRoot) {
  const directory = path.join(distRoot, 'pet-sprites/2d');
  if (!fs.existsSync(directory)) {
    return { converted: 0, savedBytes: 0, skipped: 'sprite directory missing' };
  }

  let converted = 0;
  let savedBytes = 0;
  for (const fileName of fs.readdirSync(directory)) {
    if (!fileName.toLowerCase().endsWith('.png')) continue;
    const input = path.join(directory, fileName);
    const output = path.join(directory, `${path.basename(fileName, '.png')}.webp`);
    const originalBytes = fs.statSync(input).size;
    try {
      await sharp(input).webp({ lossless: true, effort: 5 }).toFile(output);
    } catch {
      fs.rmSync(output, { force: true });
      continue;
    }
    const webpBytes = fs.statSync(output).size;
    if (webpBytes >= originalBytes) {
      fs.rmSync(output, { force: true });
      continue;
    }
    fs.rmSync(input, { force: true });
    converted += 1;
    savedBytes += originalBytes - webpBytes;
  }
  return { converted, savedBytes, skipped: null };
}

export function pruneDistQuestionBank(distRoot) {
  const directory = path.join(distRoot, 'course-data/question-bank-v2');
  const manifestPath = path.join(directory, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { removed: 0, kept: 0 };

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const activeSnapshots = new Set(Object.values(manifest.files || {}).map(entry => entry.path));
  let removed = 0;
  let kept = 0;

  for (const fileName of fs.readdirSync(directory)) {
    const shouldRemove = AUTHORING_FILES.has(fileName)
      || (HASHED_SNAPSHOT.test(fileName) && !activeSnapshots.has(fileName));
    if (shouldRemove) {
      fs.rmSync(path.join(directory, fileName), { force: true });
      removed += 1;
    } else {
      kept += 1;
    }
  }
  return { removed, kept };
}

export async function pruneDistAssets(distRoot, options = {}) {
  const questionBank = pruneDistQuestionBank(distRoot);
  const unused = removeUnusedRuntimeFiles(distRoot);
  const sprites = options.optimizeSprites === false
    ? { converted: 0, savedBytes: 0, skipped: 'disabled' }
    : await optimizeBundledPetSprites(distRoot);
  return { questionBank, unused, sprites };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('Usage: node scripts/prune-dist-question-bank.mjs <dist-directory> [...]');
    process.exitCode = 1;
  } else {
    for (const target of targets) {
      const result = await pruneDistAssets(path.resolve(target));
      console.log(`Pruned ${result.questionBank.removed} unused question-bank files from ${target}; kept ${result.questionBank.kept}.`);
      console.log(`Removed ${result.unused.removedPaths} development-only paths (${(result.unused.removedBytes / 1024 / 1024).toFixed(1)} MiB).`);
      if (result.sprites.skipped) {
        console.warn(`Sprite WebP optimization skipped: ${result.sprites.skipped}. PNG fallback remains available.`);
      } else {
        console.log(`Converted ${result.sprites.converted} bundled sprite sheets to lossless WebP; saved ${(result.sprites.savedBytes / 1024 / 1024).toFixed(1)} MiB.`);
      }
    }
  }
}
