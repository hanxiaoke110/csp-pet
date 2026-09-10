import { describe, expect, it } from 'vitest';

import { gespLevelLabel, matchesGespLevel } from './questionFilters';

describe('GESP practice level filters', () => {
  it('keeps advanced questions out of the default foundation pool', () => {
    expect(matchesGespLevel({ source: 'gesp', level: 4 }, 'foundation')).toBe(true);
    expect(matchesGespLevel({ source: 'gesp', level: 5 }, 'foundation')).toBe(false);
    expect(matchesGespLevel({ source: 'csp_exam', group: 'J' }, 'foundation')).toBe(true);
  });

  it('allows an explicit advanced level or the complete GESP range', () => {
    expect(matchesGespLevel({ source: 'gesp', level: 7 }, 7)).toBe(true);
    expect(matchesGespLevel({ source: 'gesp', level: 7 }, 6)).toBe(false);
    expect(matchesGespLevel({ source: 'gesp', level: 8 }, 'all')).toBe(true);
  });

  it('provides clear scope labels', () => {
    expect(gespLevelLabel('foundation')).toBe('GESP 基础1-4级');
    expect(gespLevelLabel('all')).toBe('GESP 1-8级');
    expect(gespLevelLabel(6)).toBe('GESP 6级');
  });
});
