import { describe, expect, it } from 'vitest';
import { countCompletedProblems, mergeProblemStatusSnapshots } from './problemStatusMerge';

describe('problem status persistence', () => {
  it('keeps the latest local state while never reverting a completed problem', () => {
    const merged = mergeProblemStatusSnapshots(
      JSON.stringify({ a: 'completed', b: 'attempted', c: 'retry' }),
      JSON.stringify({ a: 'retry', b: 'completed', d: 'completed' }),
    );

    expect(JSON.parse(merged!)).toEqual({
      a: 'completed',
      b: 'completed',
      c: 'retry',
      d: 'completed',
    });
    expect(countCompletedProblems(merged)).toBe(3);
  });

  it('uses either valid copy when the other copy is missing or damaged', () => {
    expect(JSON.parse(mergeProblemStatusSnapshots('{broken', '{"p":"completed"}')!))
      .toEqual({ p: 'completed' });
    expect(JSON.parse(mergeProblemStatusSnapshots('{"p":"completed"}', null)!))
      .toEqual({ p: 'completed' });
  });

  it('drops unknown status values instead of restoring invalid progress', () => {
    expect(JSON.parse(mergeProblemStatusSnapshots('{"a":"completed","b":"unknown"}', '{}')!))
      .toEqual({ a: 'completed' });
  });
});
