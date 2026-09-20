import { describe, expect, it } from 'vitest';
import { isAllowedWardrobeUrl } from './wardrobeAssetDownloader';

describe('wardrobe asset url policy', () => {
  it('allows bundled founders assets and approved HTTPS hosts', () => {
    expect(isAllowedWardrobeUrl('/wardrobe/founders/frames/gold-orbit.webp')).toBe(true);
    expect(isAllowedWardrobeUrl('/profile/avatars/zodiac/rat.webp')).toBe(true);
    expect(isAllowedWardrobeUrl('https://gitee.com/a/b/raw/master/item.webp')).toBe(true);
    expect(isAllowedWardrobeUrl('https://cards.cspstudy.top/wardrobe/item.webp')).toBe(true);
  });

  it('blocks insecure and unknown remote hosts', () => {
    expect(isAllowedWardrobeUrl('http://cards.cspstudy.top/item.webp')).toBe(false);
    expect(isAllowedWardrobeUrl('https://example.com/item.webp')).toBe(false);
    expect(isAllowedWardrobeUrl('file:///tmp/item.webp')).toBe(false);
  });
});
