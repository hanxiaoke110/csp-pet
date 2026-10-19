// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_FOCUS_SETTINGS, useFocusStore } from '../../stores/focusStore';
import FocusRuntime from './FocusRuntime';
const handlers = vi.hoisted(() => new Map<string, (event: any) => void>());
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async (name, handler) => { handlers.set(name, handler); return () => handlers.delete(name); }),
}));
it('keeps mini-bar commands and completion active while the page switches to a dungeon', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers(); localStorage.clear();
  useFocusStore.setState({ settings: { ...DEFAULT_FOCUS_SETTINGS, miniWindowEnabled: false, endSoundEnabled: false }, activeSession: null, records: [], archivedDaily: [], recentGoals: [], loaded: true });
  useFocusStore.getState().start('阅读', 5);
  const id = useFocusStore.getState().activeSession!.id;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const render = (page: string) => <><FocusRuntime /><main key={page}>{page}</main></>;
  try {
    await act(async () => root.render(render('focus')));
    await act(async () => root.render(render('dungeon')));
    await act(async () => handlers.get('focus-mini-command')!({ payload: { sessionId: id, type: 'pause' } }));
    expect(useFocusStore.getState().activeSession?.status).toBe('paused');
    await act(async () => handlers.get('focus-mini-command')!({ payload: { sessionId: id, type: 'resume' } }));
    await act(async () => vi.advanceTimersByTime(5 * 60000));
    expect(useFocusStore.getState().activeSession?.status).toBe('review');
  } finally { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
