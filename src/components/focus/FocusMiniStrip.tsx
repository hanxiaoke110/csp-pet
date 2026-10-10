import { forwardRef, useEffect, useRef, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { EyeOff, GripVertical, Maximize2, Pause, Play, Square } from 'lucide-react';
import type { FocusMiniCommand, FocusMiniSnapshot } from '../../types/focus';
import { deriveFocusTiming } from '../../utils/focusTimer';
import { formatFocusClock } from './FocusTimer';
import './focusMini.css';

interface Position { x: number; y: number }
const POSITION_KEY = 'csp_focus_mini_position';

function initialPosition(): Position {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
  } catch { /* 使用默认位置 */ }
  return { x: Math.max(18, window.innerWidth / 2 - 210), y: 18 };
}

const FocusMiniStrip = forwardRef<HTMLDivElement, { snapshot: FocusMiniSnapshot }>(function FocusMiniStrip({ snapshot }, ref) {
  const session = snapshot.session;
  const [nowMs, setNowMs] = useState(Date.now());
  const [position, setPosition] = useState<Position>(initialPosition);
  const drag = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const elapsedEmitted = useRef('');

  useEffect(() => {
    if (!session || session.status !== 'running') return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.status]);

  useEffect(() => {
    if (!session) return;
    const timing = deriveFocusTiming(session, nowMs);
    if (timing.completed && elapsedEmitted.current !== session.id) {
      elapsedEmitted.current = session.id;
      emit('focus-session-elapsed', { sessionId: session.id }).catch(() => {});
    }
  }, [session, nowMs]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!drag.current) return;
      const width = 420;
      const height = 64;
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.current.offsetX)),
        y: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - drag.current.offsetY)),
      });
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch {}
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [position]);

  if (!session) return null;
  const timing = deriveFocusTiming(session, nowMs);
  const command = (type: FocusMiniCommand['type']) => emit('focus-mini-command', { type, sessionId: session.id } satisfies FocusMiniCommand).catch(() => {});

  return (
    <div
      ref={ref}
      className="focus-mini-strip pet-interact"
      style={{ transform: `translate(${Math.round(position.x)}px,${Math.round(position.y)}px)` }}
      onMouseDown={event => {
        if ((event.target as HTMLElement).closest('button')) return;
        drag.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
      }}
    >
      <GripVertical className="focus-mini-grip" />
      <div className="focus-mini-symbol">🌱</div>
      <div className="focus-mini-time">{formatFocusClock(timing.remainingSeconds)}</div>
      <div className="focus-mini-copy">
        <b>{session.status === 'review' ? '这一段结束啦' : snapshot.reminderText || session.goal}</b>
        <span>{session.status === 'review' ? '回到学习助手，记一下完成情况' : snapshot.reminderText ? '轻轻确认一下自己的节奏' : session.status === 'paused' ? '已暂停，不计入专注时间' : '正在专注'}</span>
      </div>
      <div className="focus-mini-actions">
        {session.status === 'review'
          ? <button type="button" aria-label="打开学习助手" onClick={() => command('open')}><Maximize2 /></button>
          : <>
              <button type="button" aria-label={session.status === 'paused' ? '继续专注' : '暂停专注'} onClick={() => command(session.status === 'paused' ? 'resume' : 'pause')}>
                {session.status === 'paused' ? <Play /> : <Pause />}
              </button>
              <button type="button" aria-label="提前结束" onClick={() => command('finish')}><Square /></button>
            </>}
        <button type="button" aria-label="隐藏本次迷你计时条" onClick={() => command('hide')}><EyeOff /></button>
      </div>
    </div>
  );
});

export default FocusMiniStrip;
