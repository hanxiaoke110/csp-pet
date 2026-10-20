import { useEffect, useRef, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Window as TauriWindow } from '@tauri-apps/api/window';
import { safeListen } from '../../lib/tauriEvents';
import { useFocusStore } from '../../stores/focusStore';
import { usePetStore } from '../../stores/petStore';
import type { FocusMiniCommand, FocusMiniSnapshot } from '../../types/focus';
import { petCopy } from '../pet/PetCopy';
import { storageWritesAllowed } from '../../lib/restoreBarrier';

function playFocusChime(): void {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);
    gain.connect(context.destination);
    [659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.16);
      oscillator.stop(context.currentTime + 0.52 + index * 0.16);
    });
    window.setTimeout(() => { void context.close(); }, 1200);
  } catch { /* 提示音失败不影响记录 */ }
}

/**
 * 全局专注运行时：不依赖当前路由，确保孩子切到其他页面后计时仍能完成。
 * 桌面迷你条复用现有 pet WebView2，避免 Windows 多置顶 WebView2 卡死。
 */
export default function FocusRuntime() {
  const activeSession = useFocusStore(state => state.activeSession);
  const settings = useFocusStore(state => state.settings);
  const [hiddenSessionId, setHiddenSessionId] = useState<string | null>(null);
  const [reminderText, setReminderText] = useState('');
  const previousPetVisible = useRef<boolean | null>(null);
  const reminderTimer = useRef<number | null>(null);

  const showMini = Boolean(
    activeSession
    && settings.miniWindowEnabled
    && hiddenSessionId !== activeSession.id,
  );

  const syncDesktop = (overrideReminder = reminderText) => {
    const state = useFocusStore.getState();
    const visible = Boolean(
      state.activeSession
      && state.settings.miniWindowEnabled
      && hiddenSessionId !== state.activeSession.id,
    );
    const payload: FocusMiniSnapshot = {
      session: visible ? state.activeSession : null,
      settings: state.settings,
      reminderText: overrideReminder || undefined,
    };
    emit('focus-state-sync', payload).catch(() => {});
  };

  useEffect(() => {
    if (!activeSession) setHiddenSessionId(null);
    else if (hiddenSessionId && hiddenSessionId !== activeSession.id) setHiddenSessionId(null);
  }, [activeSession?.id]);

  useEffect(() => {
    syncDesktop();
  }, [activeSession, settings, hiddenSessionId, reminderText]);

  useEffect(() => {
    let cancelled = false;
    if (showMini && previousPetVisible.current === null) {
      void TauriWindow.getByLabel('pet').then(async windowHandle => {
        if (cancelled || !windowHandle) return;
        previousPetVisible.current = await windowHandle.isVisible().catch(() => true);
        await invoke('show_pet_window').catch(() => {});
        syncDesktop();
      }).catch(() => {});
    } else if (!showMini && previousPetVisible.current !== null) {
      const restoreVisible = previousPetVisible.current;
      previousPetVisible.current = null;
      if (!restoreVisible) void invoke('hide_pet_window').catch(() => {});
    }
    return () => { cancelled = true; };
  }, [showMini]);

  useEffect(() => {
    const cleanups = [
      safeListen<FocusMiniCommand>('focus-mini-command', event => {
        if (!storageWritesAllowed()) return;
        const session = useFocusStore.getState().activeSession;
        if (!session || session.id !== event.payload.sessionId) return;
        if (event.payload.type === 'pause') useFocusStore.getState().pause();
        else if (event.payload.type === 'resume') useFocusStore.getState().resume();
        else if (event.payload.type === 'finish') useFocusStore.getState().requestFinish();
        else if (event.payload.type === 'open') {
          invoke('bring_to_front').catch(() => {});
          window.history.pushState({}, '', '/focus');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        else if (event.payload.type === 'hide') setHiddenSessionId(session.id);
      }),
      safeListen('focus-mini-ready', () => syncDesktop()),
      safeListen<{ sessionId: string }>('focus-session-elapsed', event => {
        if (!storageWritesAllowed()) return;
        const session = useFocusStore.getState().activeSession;
        if (session?.id === event.payload.sessionId) useFocusStore.getState().completeNaturally();
      }),
    ];
    return () => cleanups.forEach(cleanup => cleanup());
  }, [hiddenSessionId, reminderText]);

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'running') return;
    const reconcile = () => {
      if (!storageWritesAllowed()) return;
      const result = useFocusStore.getState().tick(Date.now());
      if (result === 'reminder') {
        const text = petCopy.focusReminder();
        setReminderText(text);
        if (usePetStore.getState().ownedPets.length > 0) emit('pet-bubble', { text }).catch(() => {});
        if (reminderTimer.current !== null) window.clearTimeout(reminderTimer.current);
        reminderTimer.current = window.setTimeout(() => setReminderText(''), 5000);
      } else if (result === 'completed') {
        const text = petCopy.focusComplete();
        setReminderText(text);
        if (usePetStore.getState().ownedPets.length > 0) emit('pet-bubble', { text }).catch(() => {});
        if (useFocusStore.getState().settings.endSoundEnabled) playFocusChime();
      }
    };
    reconcile();
    const timer = window.setInterval(reconcile, 1000);
    return () => window.clearInterval(timer);
  }, [activeSession?.id, activeSession?.status]);

  useEffect(() => () => {
    if (reminderTimer.current !== null) window.clearTimeout(reminderTimer.current);
  }, []);

  return null;
}
