import { describe, expect, it } from 'vitest';

import { chooseQuestionSnapshot } from './repository';

describe('question bank v2 snapshot selection', () => {
  it('prefers a newer valid current cache', () => {
    expect(chooseQuestionSnapshot(
      { revision: 3, valid: true, data: ['current'] },
      null,
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['current']);
  });

  it('falls back to a previous valid cache when current is corrupt', () => {
    expect(chooseQuestionSnapshot(
      { revision: 4, valid: false, data: ['bad'] },
      { revision: 3, valid: true, data: ['previous'] },
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['previous']);
  });

  it('uses bundled data when both cache slots are invalid', () => {
    expect(chooseQuestionSnapshot(
      { revision: 4, valid: false, data: ['bad-current'] },
      { revision: 3, valid: false, data: ['bad-previous'] },
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['bundle']);
  });
});
