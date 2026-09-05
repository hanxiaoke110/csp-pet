export type PersistedProblemStatus = 'not_started' | 'completed' | 'retry' | 'attempted';

const VALID_STATUSES = new Set<PersistedProblemStatus>([
  'not_started',
  'completed',
  'retry',
  'attempted',
]);

function parseStatuses(raw: string | null | undefined): Record<string, PersistedProblemStatus> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const result: Record<string, PersistedProblemStatus> = {};
    for (const [id, status] of Object.entries(parsed)) {
      if (VALID_STATUSES.has(status as PersistedProblemStatus)) {
        result[id] = status as PersistedProblemStatus;
      }
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Merge the synchronous local snapshot with SQLite's fallback snapshot.
 * Local values are newer for ordinary conflicts; completion is monotonic and
 * therefore wins even when it only exists in the slower SQLite copy.
 */
export function mergeProblemStatusSnapshots(
  localRaw: string | null | undefined,
  sqliteRaw: string | null | undefined,
): string | null {
  const local = parseStatuses(localRaw);
  const sqlite = parseStatuses(sqliteRaw);
  if (!local && !sqlite) return null;

  const merged: Record<string, PersistedProblemStatus> = { ...(sqlite || {}), ...(local || {}) };
  for (const id of new Set([...Object.keys(sqlite || {}), ...Object.keys(local || {})])) {
    if (local?.[id] === 'completed' || sqlite?.[id] === 'completed') {
      merged[id] = 'completed';
    }
  }
  return JSON.stringify(merged);
}

export function countCompletedProblems(raw: string | null | undefined): number {
  const parsed = parseStatuses(raw);
  return parsed ? Object.values(parsed).filter(status => status === 'completed').length : 0;
}
