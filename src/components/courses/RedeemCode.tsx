import { useState } from 'react';
import { useCourseStore } from '../../stores/courseStore';
import { usePetStore } from '../../stores/petStore';
import type { Lesson } from '../../types/course';
import { getDeviceId } from '../../utils/crypto';

const API = 'https://api.cspstudy.top';

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

  const handleRedeem = async () => {
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

    // 1.5 Compensation code (CMP-): server-generated, class-bound, one-time
    if (code.toUpperCase().startsWith('CMP-')) {
      const normalized = code.toUpperCase();
      try {
        const used = JSON.parse(localStorage.getItem('csp_used_comp_codes') || '[]');
        if (used.includes(normalized)) {
          setResult({ type: 'already', message: '此补偿码已被兑换' });
          return;
        }
      } catch {}

      try {
        const resp = await fetch(`${API}/api/codes/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: normalized, device_hash: getDeviceId() }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.error) {
          setResult({ type: 'error', message: data.error || '兑换失败，请稍后重试' });
          return;
        }
        petStore.addCoins(data.coins || 0);
        petStore.addExpToPool(data.exp || 0);
        try {
          const used = JSON.parse(localStorage.getItem('csp_used_comp_codes') || '[]');
          used.push(normalized);
          localStorage.setItem('csp_used_comp_codes', JSON.stringify(used));
        } catch {}
        setResult({
          type: 'success',
          message: `🎁 补偿到账：+${data.coins} 金币，+${data.exp} 经验（已存入经验池，可在智子页分配）`,
        });
      } catch {
        setResult({ type: 'error', message: '网络连接失败，请稍后重试' });
      }
      return;
    }

    // 2. Excellence code (EXC-*): server-side validation (secret no longer shipped to clients)
    if (/^EXC-[123]-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.toUpperCase())) {
      const normalized = code.toUpperCase();
      try {
        const used = JSON.parse(localStorage.getItem('csp_used_exc_codes') || '[]');
        if (used.includes(normalized)) {
          setResult({ type: 'already', message: '此优秀码已被使用' });
          return;
        }
      } catch {}

      try {
        const resp = await fetch(`${API}/api/codes/redeem-exc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: normalized, device_hash: getDeviceId() }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.error) {
          setResult({ type: 'error', message: data.error || '兑换失败，请稍后重试' });
          return;
        }
        const reward = EXCELLENCE_REWARDS[data.level] || EXCELLENCE_REWARDS['1'];
        const activePetId = petStore.activePetId;
        if (activePetId) petStore.addExp(activePetId, data.exp || 0);
        petStore.addCoins(data.coins || 0);
        try {
          const used = JSON.parse(localStorage.getItem('csp_used_exc_codes') || '[]');
          used.push(normalized);
          localStorage.setItem('csp_used_exc_codes', JSON.stringify(used));
        } catch {}
        setResult({
          type: 'success',
          message: `${reward.label} 优秀学生奖励！\n+${data.exp} EXP  +${data.coins} 金币`,
        });
      } catch {
        setResult({ type: 'error', message: '网络连接失败，请稍后重试' });
      }
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
