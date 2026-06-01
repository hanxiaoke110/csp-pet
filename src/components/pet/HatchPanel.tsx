import { useEffect, useRef, useState } from 'react';
import { useHatchStore, type HatchingEgg } from '../../stores/hatchStore';
import { usePetStore } from '../../stores/petStore';

const RARITY_STYLE: Record<string, { border: string; glow: string; label: string }> = {
  common:    { border: '#94a3b8', glow: '#e2e8f044', label: '普通' },
  rare:      { border: '#3b82f6', glow: '#93c5fd44', label: '稀有' },
  legendary: { border: '#f59e0b', glow: '#fcd34d44', label: '传说' },
};

function EggCard({ egg, onClaim }: { egg: HatchingEgg; onClaim: (egg: HatchingEgg) => void }) {
  const style = RARITY_STYLE[egg.rarity];
  const [remaining, setRemaining] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const update = () => {
      if (egg.status === 'incubating' && egg.startTime) {
        const end = egg.startTime + egg.duration;
        const left = end - Date.now();
        if (left <= 0) {
          setRemaining('即将完成...');
        } else {
          const mins = Math.floor(left / 60_000);
          const secs = Math.floor((left % 60_000) / 1000);
          setRemaining(mins > 0 ? `剩余 ${mins} 分 ${secs} 秒` : `剩余 ${secs} 秒`);
        }
      }
    };
    update();
    intervalRef.current = setInterval(update, 1000);
    return () => clearInterval(intervalRef.current);
  }, [egg.status, egg.startTime, egg.duration]);

  const getDisplay = () => {
    switch (egg.status) {
      case 'waiting':
        return { icon: '🥚', text: '等待孵化', className: 'egg-waiting' };
      case 'incubating':
        return { icon: '🔥', text: remaining || '孵化中...', className: 'egg-incubating' };
      case 'ready':
        return { icon: '✨', text: '🔓 可领取！', className: 'egg-ready' };
      case 'failed':
        return { icon: '💔', text: '孵化失败', className: 'egg-failed' };
    }
  };

  const display = getDisplay();

  return (
    <div
      className={`egg-card ${display.className}`}
      style={{
        border: `2px solid ${style.border}`,
        boxShadow: egg.status === 'incubating'
          ? `0 0 16px ${style.glow}`
          : egg.status === 'ready'
          ? `0 0 20px ${egg.rarity === 'legendary' ? '#fcd34d' : style.glow}`
          : 'none',
      }}
    >
      <div className="egg-icon">{display.icon}</div>
      <div className="egg-info">
        <div className="egg-name">{egg.petName}</div>
        <div className="egg-tier" style={{ color: style.border, fontSize: 11 }}>
          {style.label}
        </div>
        <div className="egg-status-text">{display.text}</div>
        {egg.status === 'failed' && egg.downloadProgress && (
          <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4, wordBreak: 'break-all' }}>
            {egg.downloadProgress}
          </div>
        )}
      </div>
      <div className="egg-actions">
        {egg.status === 'waiting' && (
          <button className="oj-btn oj-btn-pass" onClick={() => useHatchStore.getState().startHatching(egg.eggId)}>开始孵化</button>
        )}
        {egg.status === 'ready' && (
          <button className="oj-btn oj-btn-pass" onClick={() => onClaim(egg)}>领取</button>
        )}
        {egg.status === 'failed' && (
          <button className="oj-btn oj-btn-done" onClick={() => useHatchStore.getState().retryEgg(egg.eggId)}>
            免费重新孵化
          </button>
        )}
      </div>
    </div>
  );
}

export default function HatchPanel() {
  const { eggs, checkEggs, claimEgg } = useHatchStore();
  const claimHatchedPet = usePetStore(s => s.claimHatchedPet);
  const [claimedPet, setClaimedPet] = useState<HatchingEgg | null>(null);

  // Poll every 3 seconds to check if eggs are ready
  useEffect(() => {
    const interval = setInterval(() => checkEggs(), 3000);
    return () => clearInterval(interval);
  }, [checkEggs]);

  const handleClaim = (egg: HatchingEgg) => {
    const result = claimEgg(egg.eggId);
    if (result) {
      claimHatchedPet(result.speciesId, result.petName);
      setClaimedPet(result);
      setTimeout(() => setClaimedPet(null), 3000);
    }
  };

  if (eggs.length === 0 && !claimedPet) {
    return (
      <div className="hatch-empty">
        <div style={{ fontSize: 48, opacity: 0.4 }}>🥚</div>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          暂无孵化中的精灵<br />
          抽卡或商城购买精灵后开始孵化
        </p>
      </div>
    );
  }

  return (
    <div className="hatch-panel">
      {claimedPet && (
        <div className="hatch-claimed-toast">
          ✅ 智子孵化成功！已加入智子背包
        </div>
      )}

      {eggs.map(egg => (
        <EggCard key={egg.eggId} egg={egg} onClaim={handleClaim} />
      ))}
    </div>
  );
}
