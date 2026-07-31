interface ConfirmModalProps {
  icon: string;
  title: string;
  desc?: string;
  price?: number;
  coins?: number;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ icon, title, desc, price, coins, confirmText, danger, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="gacha-overlay" onClick={onCancel}>
      <div className="buy-confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="buy-confirm-header">
          <span>{icon} {title}</span>
          <button className="ai-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="buy-confirm-body">
          {desc && <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{desc}</div>}
          {price != null && <div className="buy-confirm-price">🪙 {price} 金币</div>}
          {coins != null && <div className="buy-confirm-balance">当前余额：🪙 {coins} 金币</div>}
        </div>
        <div className="buy-confirm-actions">
          <button className="mode-btn mode-btn-back" onClick={onCancel}>取消</button>
          <button className="mode-btn" style={danger ? { background: '#dc2626' } : undefined} onClick={onConfirm}>
            {confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}
