import { useEffect, useState, useSyncExternalStore } from 'react';
import { emit, listen } from '@tauri-apps/api/event';

export type PerformanceMode = 'standard' | 'economy';
export const PERFORMANCE_MODE_KEY = 'csp_performance_mode_v1';
const EVENT = 'csp-performance-mode';
let memory: PerformanceMode = 'standard';
const listeners = new Set<() => void>();
const valid = (value: unknown): value is PerformanceMode => value === 'standard' || value === 'economy';
const desktop = () => typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
export function readPerformanceMode(): PerformanceMode {
  try { const saved = localStorage.getItem(PERFORMANCE_MODE_KEY); if (valid(saved)) memory = saved; } catch { /* session fallback */ }
  return memory;
}
function receive(mode: PerformanceMode) {
  memory = mode;
  try { localStorage.setItem(PERFORMANCE_MODE_KEY, mode); } catch { /* session fallback */ }
  listeners.forEach(listener => listener());
}
export function writePerformanceMode(mode: PerformanceMode): void {
  receive(mode);
  if (desktop()) void emit(EVENT, mode).catch(() => {});
}
let stopEvents: (() => void) | undefined;
export function subscribePerformanceMode(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopEvents) {
    const storage = (event: StorageEvent) => {
      if (event.key === PERFORMANCE_MODE_KEY && valid(event.newValue)) receive(event.newValue);
    };
    window.addEventListener('storage', storage);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (desktop()) void listen<unknown>(EVENT, event => {
      if (!disposed && valid(event.payload)) receive(event.payload);
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    stopEvents = () => { disposed = true; window.removeEventListener('storage', storage); unlisten?.(); };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { stopEvents?.(); stopEvents = undefined; }
  };
}
export function usePerformanceMode(): PerformanceMode {
  return useSyncExternalStore(subscribePerformanceMode, readPerformanceMode, () => 'standard');
}
/** Visibility and reduced motion affect decoration only, never study/reward clocks. */
export function useVisualBudget() {
  const mode = usePerformanceMode();
  const [hidden, setHidden] = useState(() => document.hidden);
  const [reduced, setReduced] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => { setHidden(document.hidden); setReduced(Boolean(media?.matches)); };
    document.addEventListener('visibilitychange', update); media?.addEventListener('change', update);
    return () => { document.removeEventListener('visibilitychange', update); media?.removeEventListener('change', update); };
  }, []);
  return { economy: mode === 'economy', hidden, reduced };
}
