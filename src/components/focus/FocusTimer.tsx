import { Pause, Play, Square } from 'lucide-react';
import type { FocusSession } from '../../types/focus';

interface Props {
  session: FocusSession;
  remainingSeconds: number;
  progress: number;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
}

export function formatFocusClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function FocusTimer({ session, remainingSeconds, progress, onPause, onResume, onFinish }: Props) {
  const paused = session.status === 'paused';
  return (
    <section className={`focus-card focus-active ${paused ? 'is-paused' : ''}`} aria-live="polite">
      <div className="focus-active-kicker">{paused ? '暂时休息一下' : '正在专注'}</div>
      <h2>{session.goal}</h2>
      <div className="focus-clock" aria-label={`剩余 ${formatFocusClock(remainingSeconds)}`}>{formatFocusClock(remainingSeconds)}</div>
      <div className="focus-progress-track" aria-hidden="true"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} /></div>
      <p>{paused ? '准备好后继续就行，暂停不会算进专注时间' : '慢慢来，只完成眼前这一小段'}</p>
      <div className="focus-active-actions">
        {paused
          ? <button type="button" className="focus-resume-button" onClick={onResume}><Play /> 继续</button>
          : <button type="button" onClick={onPause}><Pause /> 暂停</button>}
        <button type="button" className="focus-finish-button" onClick={onFinish}><Square /> 提前结束</button>
      </div>
      <small>切换到浏览器、文档或其他学习软件，不会被判断为走神</small>
    </section>
  );
}
