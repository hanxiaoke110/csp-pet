import { describe, expect, it } from 'vitest';
import { isAllowedCollectorCardUrl } from './collectorCardDownloader';

describe('collector card asset allowlist', () => {
  it('accepts bundled, Gitee and the dedicated card CDN', () => {
    expect(isAllowedCollectorCardUrl('/collector-cards/demo/subject.png')).toBe(true);
    expect(isAllowedCollectorCardUrl('https://gitee.com/hanliuliu110/csp-pet/raw/master/card.png')).toBe(true);
    expect(isAllowedCollectorCardUrl('https://cards.cspstudy.top/card.png')).toBe(true);
  });

  it('rejects insecure and unrelated hosts', () => {
    expect(isAllowedCollectorCardUrl('http://cards.cspstudy.top/card.png')).toBe(false);
    expect(isAllowedCollectorCardUrl('https://example.com/card.png')).toBe(false);
    expect(isAllowedCollectorCardUrl('file:///tmp/card.png')).toBe(false);
  });
});
