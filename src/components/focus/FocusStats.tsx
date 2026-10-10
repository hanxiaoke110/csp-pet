import { useState } from 'react';
import { BarChart3, Clock3, Trash2 } from 'lucide-react';
import type { FocusDailyAggregate, FocusRecord } from '../../types/focus';
import { localDateKey } from '../../utils/localDate';

interface Props {
  records: FocusRecord[];
  archivedDaily: FocusDailyAggregate[];
  onClear: () => void;
}

function mondayOf(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function durationText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

export default function FocusStats({ records, archivedDaily, onClear }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const today = new Date();
  const start = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, key: localDateKey(date), label: '一二三四五六日'[index] };
  });
  const totals = new Map<string, { seconds: number; sessions: number }>();
  for (const item of archivedDaily) totals.set(item.date, { seconds: item.focusedSeconds, sessions: item.sessions });
  for (const record of records) {
    const key = localDateKey(new Date(record.endedAt));
    const current = totals.get(key) || { seconds: 0, sessions: 0 };
    current.seconds += record.focusedSeconds;
    current.sessions += 1;
    totals.set(key, current);
  }
  const weekSeconds = days.reduce((sum, day) => sum + (totals.get(day.key)?.seconds || 0), 0);
  const todayData = totals.get(localDateKey(today)) || { seconds: 0, sessions: 0 };
  const maxSeconds = Math.max(1, ...days.map(day => totals.get(day.key)?.seconds || 0));

  return (
    <section className="focus-card focus-stats">
      <div className="focus-stats-heading">
        <div><BarChart3 /><span><b>我的专注记录</b><small>只保存在这台电脑</small></span></div>
        {(records.length > 0 || archivedDaily.length > 0) && (
          confirmClear
            ? <div className="focus-clear-confirm"><span>确定全部清空？</span><button type="button" onClick={() => { onClear(); setConfirmClear(false); }}>确定</button><button type="button" onClick={() => setConfirmClear(false)}>取消</button></div>
            : <button type="button" className="focus-clear-button" onClick={() => setConfirmClear(true)}><Trash2 /> 清空记录</button>
        )}
      </div>
      <div className="focus-stat-summary">
        <div><Clock3 /><span><small>今天</small><b>{durationText(todayData.seconds)}</b><em>{todayData.sessions} 次专注</em></span></div>
        <div><BarChart3 /><span><small>本周</small><b>{durationText(weekSeconds)}</b><em>按自己的节奏就好</em></span></div>
      </div>
      <div className="focus-week-chart" aria-label="本周专注时长">
        {days.map(day => {
          const seconds = totals.get(day.key)?.seconds || 0;
          return <div key={day.key}><span>{seconds ? `${Math.floor(seconds / 60)}分` : ''}</span><i style={{ height: `${Math.max(seconds ? 10 : 3, (seconds / maxSeconds) * 100)}%` }} /><b>{day.label}</b></div>;
        })}
      </div>
      <div className="focus-recent-list">
        <h3>最近记录</h3>
        {records.length === 0
          ? <p>还没有记录。想用的时候，再开始第一段专注就好。</p>
          : records.slice(0, 10).map(record => (
            <div key={record.id}><span><b>{record.goal}</b><small>{new Date(record.endedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span><em>{durationText(record.focusedSeconds)}</em></div>
          ))}
      </div>
    </section>
  );
}
