import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { HatchRarity } from '../../stores/hatchStore';
import { HATCH_DURATIONS } from '../../stores/hatchStore';

interface Props {
  petName: string;
  rarity: HatchRarity;
  onStart: (name: string) => void;
  onLater: (name: string) => void;
  onClose: () => void;
}

const RARITY_INFO: Record<HatchRarity, { icon: string; color: string; glow: string; eggIcon: string; label: string }> = {
  common:    { icon: '⚪', color: '#94a3b8', glow: '#e2e8f0', eggIcon: '🥚', label: '普通' },
  rare:      { icon: '💙', color: '#3b82f6', glow: '#93c5fd', eggIcon: '🥚', label: '稀有' },
  legendary: { icon: '👑', color: '#f59e0b', glow: '#fcd34d', eggIcon: '🥚', label: '传说' },
};

export default function HatchConfirmModal({ petName, rarity, onStart, onLater, onClose }: Props) {
  const info = RARITY_INFO[rarity];
  const { min, max } = HATCH_DURATIONS[rarity];
  const minStr = min >= 60_000 ? `${Math.round(min / 60_000)} 分钟` : `${Math.round(min / 1000)} 秒`;
  const maxStr = max >= 60_000 ? `${Math.round(max / 60_000)} 分钟` : `${Math.round(max / 1000)} 秒`;
  const [isEgg, setIsEgg] = useState(false);
  const [name, setName] = useState(petName);

  // Pulse animation
  useEffect(() => {
    const t = setTimeout(() => setIsEgg(true), 300);
    return () => clearTimeout(t);
  }, []);

  // portal 到 body：避免祖先卡片的 backdrop-filter 让 fixed 定位失效
  return createPortal(
    <div className="hatch-overlay" onClick={onClose}>
      <div className="hatch-modal" onClick={e => e.stopPropagation()}>
        <button className="hatch-modal-close" onClick={onClose}>×</button>

        <h3>🥚 孵化确认</h3>

        <div
          className="hatch-egg-preview"
          style={{
            borderColor: info.color,
            boxShadow: `0 0 30px ${info.glow}44`,
            transform: isEgg ? 'scale(1)' : 'scale(0.5)',
            opacity: isEgg ? 1 : 0,
            transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <span style={{ fontSize: 48 }}>{info.eggIcon}</span>
        </div>

        <div
          className="hatch-rarity-badge"
          style={{ background: `${info.color}22`, color: info.color, borderColor: info.color }}
        >
          {info.icon} {info.label}精灵
        </div>

        <div className="hatch-pet-name" style={{ color: info.color }}>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              background: 'transparent', border: 'none', borderBottom: `2px solid ${info.color}44`,
              fontSize: 16, fontWeight: 700, color: info.color, textAlign: 'center',
              width: '100%', outline: 'none', padding: '4px 0',
            }}
            maxLength={20}
            placeholder="给精灵取个名字..."
          />
        </div>

        <div className="hatch-duration">
          预计孵化时间：{minStr} – {maxStr}
        </div>

        {rarity !== 'common' && (
          <div className="hatch-warning">
            ⚠️ 请保持网络畅通，若孵化失败可免费重新孵化
          </div>
        )}

        <div className="hatch-actions">
          <button className="oj-btn oj-btn-pass" onClick={() => onStart(name || petName)}>
            🥚 开始孵化
          </button>
          <button className="oj-btn oj-btn-done" onClick={() => onLater(name || petName)}>
            🕐 稍后再说
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
