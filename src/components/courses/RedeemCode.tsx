import { useState } from 'react';
import { useCourseStore } from '../../stores/courseStore';
import { usePetStore } from '../../stores/petStore';
import type { Lesson } from '../../types/course';

// ─── Code validation ───
const SECRET = 'csp-coach-2025';

function makeHash(level: string, date: string): string {
  let h = 0;
  const s = `${level}-${date}-${SECRET}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  let v = Math.abs(h);
  for (let i = 0; i < 4; i++) {
    result = chars[v % chars.length] + result;
    v = Math.floor(v / chars.length);
  }
  return result;
}

function verifyExcellenceCode(code: string): { level: string } | null {
  // Support both old format EXC-1-0529-ABCD and new format EXC-1-0529-ABCD-RAND
  const match = code.match(/^EXC-([123])-(\d{4})-([A-Z0-9]{4})(?:-[A-Z0-9]{4})?$/);
  if (!match) return null;
  const [, level, date, check] = match;
  return makeHash(level, date) === check ? { level } : null;
}

// ─── Rewards ───
const LESSON_REWARD = { exp: 50, coins: 30, affection: 10 };
const STAGE_REWARD = { exp: 100, coins: 60, affection: 20 };
const EXCELLENCE_REWARDS: Record<string, { exp: number; coins: number; label: string }> = {
  '1': { exp: 100, coins: 60, label: '🥇 一等奖' },
  '2': { exp: 60, coins: 40, label: '🥈 二等奖' },
  '3': { exp: 30, coins: 20, label: '🥉 三等奖' },
};

interface Props { onClose: () => void; }

export default function RedeemCode({ onClose }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'already'; message: string } | null>(null);

  const courseStore = useCourseStore();
  const petStore = usePetStore();

  const isLessonPassword = (code: string): Lesson | null => {
    const lessons = courseStore.lessons || [];
    return lessons.find(l => l.password && l.password === code) || null;
  };

  const handleRedeem = () => {
    const code = input.trim();
    if (!code) return;

    // 1. Try lesson password
    const lesson = isLessonPassword(code);
    if (lesson) {
      const rewarded = getRewardedLessons();
      if (rewarded.has(lesson.id)) {
        setResult({ type: 'already', message: `第 ${lesson.order} 课奖励已领取过了` });
        return;
      }

      const { lessons } = useCourseStore.getState();
      const idsToUnlock = lessons.filter(l => l.order <= lesson.order).map(l => l.id);
      courseStore.unlockLessonsUpTo(lesson.order);

      const saved = localStorage.getItem('csp_unlocked_lessons');
      const existing: string[] = saved ? JSON.parse(saved) : [];
      const merged = new Set([...existing, ...idsToUnlock]);
      localStorage.setItem('csp_unlocked_lessons', JSON.stringify([...merged]));

      const isStageEnd = lesson.order % 25 === 0;
      const reward = isStageEnd ? STAGE_REWARD : LESSON_REWARD;
      const activePetId = petStore.activePetId;
      if (activePetId) {
        petStore.addExp(activePetId, reward.exp);
        petStore.addAffection(activePetId, reward.affection);
      }
      petStore.addCoins(reward.coins);
      markRewarded(lesson.id);

      setResult({
        type: 'success',
        message: isStageEnd
          ? `🎓 阶段毕业！第 ${lesson.order} 课解锁\n+${reward.exp} EXP  +${reward.coins} 金币  +${reward.affection} 好感度`
          : `🎉 第 ${lesson.order} 课解锁！\n+${reward.exp} EXP  +${reward.coins} 金币  +${reward.affection} 好感度`,
      });
      return;
    }

    // 2. Try excellence code (EXC-{level}-{date}-{check})
    const excInfo = verifyExcellenceCode(code);
    if (excInfo) {
      try {
        const used = JSON.parse(localStorage.getItem('csp_used_exc_codes') || '[]');
        if (used.includes(code)) {
          setResult({ type: 'already', message: '此优秀码已被使用' });
          return;
        }
      } catch {}

      const reward = EXCELLENCE_REWARDS[excInfo.level];
      const activePetId = petStore.activePetId;
      if (activePetId) petStore.addExp(activePetId, reward.exp);
      petStore.addCoins(reward.coins);

      try {
        const used = JSON.parse(localStorage.getItem('csp_used_exc_codes') || '[]');
        used.push(code);
        localStorage.setItem('csp_used_exc_codes', JSON.stringify(used));
      } catch {}

      setResult({
        type: 'success',
        message: `${reward.label} 优秀学生奖励！\n+${reward.exp} EXP  +${reward.coins} 金币`,
      });
      return;
    }

    // 3. No match
    setResult({ type: 'error', message: '兑换码无效，请检查输入' });
  };

  return (
    <div className="ai-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ai-modal" style={{ width: 400 }}>
        <div className="ai-modal-header">
          <span>🎁 神秘代码</span>
          <button className="ai-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ai-modal-body" style={{ padding: 20 }}>
          {!result ? (
            <>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, textAlign: 'center' }}>
                输入老师给的神秘代码，解锁隐藏奖励 ٩(ˊᗜˋ*)و
              </p>
              <div className="pw-row">
                <input
                  type="text" className="pw-input" style={{ flex: 1 }}
                  placeholder="输入兑换码..."
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRedeem(); }}
                  autoFocus
                />
              </div>
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button className="pw-btn" onClick={handleRedeem}>兑换</button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                {result.type === 'success' ? '🎉' : result.type === 'already' ? '📋' : '❌'}
              </div>
              <div style={{
                fontSize: 14, fontWeight: 600, whiteSpace: 'pre-line',
                color: result.type === 'error' ? '#ef4444' : '#1e293b',
                lineHeight: 1.8, marginBottom: 16,
              }}>
                {result.message}
              </div>
              <button className="pw-btn" onClick={() => { setResult(null); setInput(''); }}>
                {result.type === 'success' ? '好的！' : '重新输入'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── helpers ───

function getRewardedLessons(): Set<string> {
  try {
    const saved = localStorage.getItem('csp_rewarded_lessons');
    return new Set(saved ? JSON.parse(saved) : []);
  } catch { return new Set(); }
}

function markRewarded(lessonId: string) {
  const set = getRewardedLessons();
  set.add(lessonId);
  localStorage.setItem('csp_rewarded_lessons', JSON.stringify([...set]));
}
