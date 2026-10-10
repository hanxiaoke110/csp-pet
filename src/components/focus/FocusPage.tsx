import { useEffect, useMemo, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { Leaf } from 'lucide-react';
import { useFocusStore } from '../../stores/focusStore';
import { deriveFocusTiming } from '../../utils/focusTimer';
import FocusReview from './FocusReview';
import FocusSetup from './FocusSetup';
import FocusStats from './FocusStats';
import FocusTimer from './FocusTimer';
import './focus.css';

const REMINDER_TEXT = '还在专注吗？慢慢来，完成这一小段就可以休息啦。';

export default function FocusPage() {
  const settings = useFocusStore(state => state.settings);
  const activeSession = useFocusStore(state => state.activeSession);
  const records = useFocusStore(state => state.records);
  const archivedDaily = useFocusStore(state => state.archivedDaily);
  const recentGoals = useFocusStore(state => state.recentGoals);
  const storageWarning = useFocusStore(state => state.storageWarning);
  const [nowMs, setNowMs] = useState(Date.now());
  const [message, setMessage] = useState('');

  const timing = useMemo(
    () => activeSession ? deriveFocusTiming(activeSession, nowMs) : null,
    [activeSession, nowMs],
  );

  useEffect(() => {
    if (!activeSession || activeSession.status === 'review') return;
    const reconcile = () => {
      const now = Date.now();
      setNowMs(now);
      const result = useFocusStore.getState().tick(now);
      if (result === 'reminder') {
        setMessage(REMINDER_TEXT);
        emit('pet-bubble', { text: REMINDER_TEXT }).catch(() => {});
        window.setTimeout(() => setMessage(''), 5000);
      }
    };
    reconcile();
    const timer = window.setInterval(reconcile, 1000);
    return () => window.clearInterval(timer);
  }, [activeSession?.id, activeSession?.status]);

  const start = (goal: string, minutes: number) => {
    const result = useFocusStore.getState().start(goal, minutes);
    if (!result.ok) setMessage(result.reason === 'goal' ? '先写下一件想完成的小事吧' : '现在还不能开始新的专注');
    else setMessage('');
  };

  const finish = () => {
    if (!window.confirm('要提前结束这次专注吗？已经专注的时间仍可以保存。')) return;
    useFocusStore.getState().requestFinish();
  };

  return (
    <div className="focus-page">
      <header className="focus-page-header">
        <div className="focus-page-mark"><Leaf /></div>
        <div><h1>专注学习</h1><p>写下现在要完成的一件事，然后安静地陪自己一会儿。</p></div>
      </header>
      {(message || storageWarning) && <div className="focus-page-message" role="status">{storageWarning || message}</div>}

      {!activeSession && (
        <FocusSetup
          defaultMinutes={settings.defaultMinutes}
          miniWindowEnabled={settings.miniWindowEnabled}
          gentleReminderEnabled={settings.gentleReminderEnabled}
          endSoundEnabled={settings.endSoundEnabled}
          recentGoals={recentGoals}
          onStart={start}
          onSettingsChange={next => useFocusStore.getState().updateSettings(next)}
        />
      )}

      {activeSession && activeSession.status !== 'review' && timing && (
        <FocusTimer
          session={activeSession}
          remainingSeconds={timing.remainingSeconds}
          progress={timing.progress}
          onPause={() => useFocusStore.getState().pause()}
          onResume={() => useFocusStore.getState().resume()}
          onFinish={finish}
        />
      )}

      {activeSession?.status === 'review' && (
        <FocusReview
          session={activeSession}
          onSave={outcome => {
            if (!useFocusStore.getState().saveReview(outcome)) setMessage('专注不足 1 分钟，可以选择不保存这次记录');
          }}
          onDiscard={() => useFocusStore.getState().discardReview()}
        />
      )}

      <FocusStats records={records} archivedDaily={archivedDaily} onClear={() => useFocusStore.getState().clearHistory()} />
    </div>
  );
}
