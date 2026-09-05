// In-memory cache for problem statuses, backed by SQLite.
// Provides synchronous reads (for React render) with async persistence.
import { sqliteGet, sqliteSetFireAndForget } from './sqlite-storage';
import type { ProblemStatus } from '../components/courses/ProblemViewer';
import { mergeProblemStatusSnapshots } from './problemStatusMerge';

let cache: Record<string, ProblemStatus> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Load problem statuses from SQLite (or localStorage fallback).
 * Call once at app startup before any component reads problem status.
 */
export async function loadProblemStatuses(): Promise<void> {
  const sqliteRaw = await sqliteGet('problem_status');
  let localRaw: string | null = null;
  try { localRaw = localStorage.getItem('csp_problem_status'); } catch {}

  const merged = mergeProblemStatusSnapshots(localRaw, sqliteRaw);
  if (!merged) {
    cache = {};
    return;
  }
  cache = JSON.parse(merged);

  // Repair both copies so a later backup or restart observes the same progress.
  try { localStorage.setItem('csp_problem_status', merged); } catch {}
  if (sqliteRaw !== merged) sqliteSetFireAndForget('problem_status', merged);
}

/**
 * Synchronous read — safe to call in useState initializers and render.
 */
export function getProblemStatus(problemId: string): ProblemStatus {
  return cache[problemId] || 'not_started';
}

/**
 * Synchronous write to cache + debounced async persist to SQLite.
 * Safe to call in synchronous event handlers.
 */
export function setProblemStatus(problemId: string, status: ProblemStatus): void {
  cache[problemId] = status;

  // Sync write to localStorage immediately so achievements & other readers see latest
  const json = JSON.stringify(cache);
  try { localStorage.setItem('csp_problem_status', json); } catch {}

  // Debounced async persist to SQLite
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    sqliteSetFireAndForget('problem_status', json);
  }, 300);
}
