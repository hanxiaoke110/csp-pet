import { useState } from 'react';
import { BookOpen, Brain, Clock3, Music2, PenLine, Play, Sparkles } from 'lucide-react';
import type { FocusSettings } from '../../types/focus';

interface Props {
  defaultMinutes: number;
  miniWindowEnabled: boolean;
  gentleReminderEnabled: boolean;
  endSoundEnabled: boolean;
  recentGoals: string[];
  onStart: (goal: string, minutes: number) => void;
  onSettingsChange: (next: Partial<FocusSettings>) => void;
}

const PRESETS = [
  { minutes: 15, label: '小专注', hint: '阅读与背诵' },
  { minutes: 25, label: '标准专注', hint: '普通作业' },
  { minutes: 45, label: '深度专注', hint: '刷题与创作' },
];

const GOAL_SUGGESTIONS = [
  { label: '阅读', icon: BookOpen },
  { label: '写作业', icon: PenLine },
  { label: '背诵', icon: Brain },
  { label: '练习', icon: Music2 },
];

export default function FocusSetup({
  defaultMinutes,
  miniWindowEnabled,
  gentleReminderEnabled,
  endSoundEnabled,
  recentGoals,
  onStart,
  onSettingsChange,
}: Props) {
  const [goal, setGoal] = useState('');
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [customMinutes, setCustomMinutes] = useState(defaultMinutes);
  const [custom, setCustom] = useState(!PRESETS.some(item => item.minutes === defaultMinutes));
  const [error, setError] = useState('');

  const chooseMinutes = (value: number) => {
    setMinutes(value);
    setCustom(false);
    setError('');
    onSettingsChange({ defaultMinutes: value });
  };

  const useCustom = () => {
    const next = Math.min(120, Math.max(5, Math.round(customMinutes || 5)));
    setCustomMinutes(next);
    setMinutes(next);
    setCustom(true);
    setError('');
    onSettingsChange({ defaultMinutes: next });
  };

  const submit = () => {
    if (!goal.trim()) {
      setError('先写下一件想完成的小事吧');
      return;
    }
    if (minutes < 5 || minutes > 120) {
      setError('专注时间可以设置为 5～120 分钟');
      return;
    }
    onStart(goal.trim(), minutes);
  };

  return (
    <section className="focus-card focus-setup" aria-labelledby="focus-setup-title">
      <div className="focus-card-heading">
        <span className="focus-heading-icon"><Sparkles /></span>
        <div>
          <h2 id="focus-setup-title">准备专注</h2>
          <p>现在只需要想好一件想完成的事</p>
        </div>
      </div>

      <label className="focus-field-label" htmlFor="focus-goal">这次想完成什么？</label>
      <input
        id="focus-goal"
        className="focus-goal-input"
        value={goal}
        maxLength={60}
        onChange={event => { setGoal(event.target.value); setError(''); }}
        onKeyDown={event => { if (event.key === 'Enter') submit(); }}
        placeholder="例如：背英语单词、写数学作业、阅读二十页……"
      />
      <div className="focus-suggestion-row" aria-label="目标快捷建议">
        {GOAL_SUGGESTIONS.map(item => {
          const Icon = item.icon;
          return <button key={item.label} type="button" onClick={() => { setGoal(item.label); setError(''); }}><Icon /> {item.label}</button>;
        })}
      </div>

      {recentGoals.length > 0 && (
        <div className="focus-recent-goals">
          <span>最近：</span>
          {recentGoals.slice(0, 3).map(item => <button key={item} type="button" onClick={() => setGoal(item)}>{item}</button>)}
        </div>
      )}

      <div className="focus-duration-title"><Clock3 /> 选择专注时长</div>
      <div className="focus-duration-grid">
        {PRESETS.map(item => (
          <button
            type="button"
            key={item.minutes}
            className={!custom && minutes === item.minutes ? 'selected' : ''}
            onClick={() => chooseMinutes(item.minutes)}
          >
            <b>{item.minutes}<small> 分钟</small></b>
            <span>{item.label}</span>
            <em>{item.hint}</em>
          </button>
        ))}
        <div className={`focus-custom-duration ${custom ? 'selected' : ''}`}>
          <b>自定义</b>
          <div><input aria-label="自定义专注分钟" type="number" min={5} max={120} value={customMinutes} onChange={event => setCustomMinutes(Number(event.target.value))} /><span>分钟</span></div>
          <button type="button" onClick={useCustom}>使用</button>
        </div>
      </div>

      <div className="focus-options" aria-label="专注选项">
        <label><input type="checkbox" checked={miniWindowEnabled} onChange={event => onSettingsChange({ miniWindowEnabled: event.target.checked })} /><span><b>桌面迷你计时条</b><small>学习时也能看到剩余时间</small></span></label>
        <label><input type="checkbox" checked={gentleReminderEnabled} onChange={event => onSettingsChange({ gentleReminderEnabled: event.target.checked })} /><span><b>一次轻提醒</b><small>中途由智子轻轻鼓励一次</small></span></label>
        <label><input type="checkbox" checked={endSoundEnabled} onChange={event => onSettingsChange({ endSoundEnabled: event.target.checked })} /><span><b>结束提示音</b><small>时间到时播放短提示音</small></span></label>
      </div>

      {error && <p className="focus-form-error" role="alert">{error}</p>}
      <button className="focus-primary-button" type="button" onClick={submit}><Play /> 开始专注</button>
      <p className="focus-privacy-note">只在本机计时和保存，不监控你使用的其他软件</p>
    </section>
  );
}
