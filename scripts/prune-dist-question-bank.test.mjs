import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pruneDistAssets } from './prune-dist-question-bank.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createBuildFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-dist-prune-'));
  temporaryDirectories.push(root);
  const bankDirectory = path.join(root, 'course-data/question-bank-v2');
  fs.mkdirSync(path.join(root, 'course-data/gesp-code-images'), { recursive: true });
  fs.mkdirSync(bankDirectory, { recursive: true });
  fs.writeFileSync(path.join(root, 'pet-preview.html'), 'preview');
  fs.writeFileSync(path.join(root, 'course-data/gesp-code-images/unsafe.png'), 'image');
  fs.writeFileSync(path.join(bankDirectory, 'manifest.json'), JSON.stringify({
    files: { daily: { path: 'daily-gesp.aaaaaaaaaaaa.json' } },
  }));
  fs.writeFileSync(path.join(bankDirectory, 'daily-gesp.aaaaaaaaaaaa.json'), 'active');
  fs.writeFileSync(path.join(bankDirectory, 'daily-gesp.bbbbbbbbbbbb.json'), 'old');
  fs.writeFileSync(path.join(bankDirectory, 'canonical.json'), 'authoring');
  return root;
}

describe('pruneDistAssets', () => {
  it('keeps active snapshots and removes only non-runtime assets', async () => {
    const root = createBuildFixture();
    const result = await pruneDistAssets(root, { optimizeSprites: false });

    expect(fs.existsSync(path.join(root, 'course-data/question-bank-v2/manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'course-data/question-bank-v2/daily-gesp.aaaaaaaaaaaa.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'course-data/question-bank-v2/daily-gesp.bbbbbbbbbbbb.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'course-data/question-bank-v2/canonical.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'course-data/gesp-code-images'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'pet-preview.html'))).toBe(false);
    expect(result.questionBank.removed).toBe(2);
    expect(result.unused.removedPaths).toBe(2);
  });
});
