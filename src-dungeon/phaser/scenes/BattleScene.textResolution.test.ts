import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Canvas battle text sizing', () => {
  it('keeps native text resolution so Canvas raw frames match logical text sizes', () => {
    const scene = readFileSync(new URL('./BattleScene.ts', import.meta.url), 'utf8');
    // Phaser 3 Canvas TextCanvasRenderer batches the raw frame. Resolution > 1
    // triples glyph size even while GameObject.width still reports logical units.
    expect(scene).not.toMatch(/\.setResolution\(\s*[2-9]/);
  });
});
