// In-memory cache for problem statuses, backed by SQLite.
// Provides synchronous reads (for React render) with async persistence.
import { sqliteGet, sqliteSetFireAndForget } from './sqlite-storage';
import type { ProblemStatus } from '../components/courses/ProblemViewer';

let cache: Record<string, ProblemStatus> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Load problem statuses from SQLite (or localStorage fallback).
 * Call once at app startup before any component reads problem status.
 */
export async function loadProblemStatuses(): Promise<void> {
  // Primary: SQLite
  const raw = await sqliteGet('problem_status');
  if (raw) {
    try { cache = JSON.parse(raw); return; } catch { /* corrupted, fall through */ }
  }

  // Fallback: localStorage
  try {
    const lsRaw = localStorage.getItem('csp_problem_status');
    if (lsRaw) cache = JSON.parse(lsRaw);
  } catch { /* unrecoverable */ }
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

  // Debounced fire-and-forget save
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const json = JSON.stringify(cache);
    sqliteSetFireAndForget('problem_status', json);
    try { localStorage.setItem('csp_problem_status', json); } catch {}
  }, 300);
}
