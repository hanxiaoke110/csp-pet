import { useEffect } from 'react';
import { DUNGEON_SYNC_OUTBOX_KEY } from '../utils/syncOutbox';

/** No UI, no idle server polling, and no financial reward replay. */
export default function DungeonSyncRuntime() {
  useEffect(() => {
    let stopped = false;
    const retry = async () => {
      try {
        if (stopped || !localStorage.getItem(DUNGEON_SYNC_OUTBOX_KEY)) return;
        const { flushPendingDungeonSync } = await import('../utils/api');
        if (!stopped) await flushPendingDungeonSync();
      } catch (error) {
        // Retain local progress; a transport/storage problem must not crash study pages.
        console.warn('[dungeon-sync] Deferred progress remains local:', error);
      }
    };
    void retry();
    const onOnline = () => { void retry(); };
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => { void retry(); }, 60000);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', onOnline); };
  }, []);
  return null;
}
