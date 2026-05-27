import { useState } from 'react';
import { useCourseStore } from '../../stores/courseStore';
import type { Lesson } from '../../types/course';

interface Props { lesson: Lesson; onUnlock: () => void; }

export default function PasswordUnlock({ lesson, onUnlock }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const unlockLessonsUpTo = useCourseStore(s => s.unlockLessonsUpTo);

  const handleSubmit = () => {
    if (input.trim() === lesson.password) {
      // Cascade unlock: all lessons up to this one
      const { lessons } = useCourseStore.getState();
      const idsToUnlock = lessons
        .filter(l => l.order <= lesson.order)
        .map(l => l.id);

      unlockLessonsUpTo(lesson.order);

      // Persist all unlocked IDs
      try {
        const saved = localStorage.getItem('csp_unlocked_lessons');
        const existing: string[] = saved ? JSON.parse(saved) : [];
        const merged = new Set([...existing, ...idsToUnlock]);
        localStorage.setItem('csp_unlocked_lessons', JSON.stringify([...merged]));
      } catch { /* ignore */ }

      onUnlock();
      setError('');
    } else {
      setError('密码不正确，请重试');
    }
  };

  return (
    <div className="password-unlock">
      <div className="pw-icon">🔒</div>
      <p className="pw-text">本课需要密码解锁。输入本课密码将同时解锁之前所有课程。</p>
      <div className="pw-row">
        <input
          type="text" className="pw-input" placeholder="输入解锁密码..."
          value={input} onChange={e => { setInput(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <button className="pw-btn" onClick={handleSubmit}>解锁</button>
      </div>
      {error && <p className="pw-error">{error}</p>}
    </div>
  );
}
