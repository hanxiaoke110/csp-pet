import { createPortal } from 'react-dom';
import { TYPE_CONFIG, type SectionType } from './ProblemViewer';

interface Props {
  sectionType: SectionType;
  problemTitle: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function UnderstandModal({ sectionType, problemTitle, onClose, onConfirm }: Props) {
  const cfg = TYPE_CONFIG[sectionType];

  // portal 到 body：避免祖先卡片的 backdrop-filter 让 fixed 定位失效
  return createPortal(
    <div className="quiz-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="quiz-modal" style={{ maxWidth: 400 }}>
        <div className="quiz-header">
          <span>{cfg.required ? '🔴 必做确认' : '🟡 选做确认'}</span>
          <button className="quiz-close" onClick={onClose}>✖</button>
        </div>
        <div className="quiz-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🤔</div>
          <h4 style={{ marginBottom: 8 }}>你真的理解这道题了吗？</h4>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            {problemTitle}
          </p>
          <div style={{ background: '#fffbeb', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 12, color: '#92400e' }}>
            ⚠️ 奖励将在<b>完成本周选择题练习</b>后发放
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              className="mode-btn mode-btn-back"
              onClick={onClose}
            >
              📝 再练练
            </button>
            <button
              className="mode-btn"
              onClick={() => { onConfirm(); onClose(); }}
              style={{ background: '#22c55e' }}
            >
              ✅ 我理解了
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
