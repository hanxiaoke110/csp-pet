import { beforeEach, describe, expect, it, vi } from 'vitest';

const sqlite = vi.hoisted(() => ({
  raw: null as string | null,
  write: vi.fn(),
}));

vi.mock('./sqlite-storage', () => ({
  sqliteGet: vi.fn(async () => sqlite.raw),
  sqliteSetFireAndForget: sqlite.write,
}));

import { getProblemStatus, loadProblemStatuses } from './problemStatusCache';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
  });
  sqlite.raw = null;
  sqlite.write.mockReset();
});

describe('loadProblemStatuses', () => {
  it('merges divergent snapshots and repairs both persistence copies', async () => {
    localStorage.setItem('csp_problem_status', JSON.stringify({
      localDone: 'completed',
      sqliteDone: 'retry',
    }));
    sqlite.raw = JSON.stringify({
      localDone: 'retry',
      sqliteDone: 'completed',
    });

    await loadProblemStatuses();

    expect(getProblemStatus('localDone')).toBe('completed');
    expect(getProblemStatus('sqliteDone')).toBe('completed');
    expect(JSON.parse(localStorage.getItem('csp_problem_status')!)).toEqual({
      localDone: 'completed',
      sqliteDone: 'completed',
    });
    expect(sqlite.write).toHaveBeenCalledWith(
      'problem_status',
      JSON.stringify({ localDone: 'completed', sqliteDone: 'completed' }),
    );
  });

  it('clears an old in-memory cache when neither snapshot is readable', async () => {
    localStorage.setItem('csp_problem_status', '{broken');
    sqlite.raw = '{broken';

    await loadProblemStatuses();

    expect(getProblemStatus('localDone')).toBe('not_started');
  });
});
