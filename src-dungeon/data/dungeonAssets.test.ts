import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import dungeons from './dungeons.json';

describe('试炼场 Boss 战斗素材', () => {
  it('每个副本都有独立且存在的本地战斗立绘', () => {
    const sprites = dungeons.map(dungeon => dungeon.bossBattleSprite);

    expect(new Set(sprites).size).toBe(dungeons.length);
    for (const sprite of sprites) {
      expect(sprite).toMatch(/^\/dungeon-art-v3\/boss-battle-[a-z]+\.webp$/);
      expect(existsSync(resolve(process.cwd(), 'public', sprite.slice(1)))).toBe(true);
    }
  });
});
