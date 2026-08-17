interface DungeonConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 试炼场统一确认弹窗（像素风，与 ElementGuide 模态同风格）。
 * 替代原生 window.confirm —— Tauri dialog 插件 2.7+ 已移除 confirm 命令，
 * window.confirm 会被 init 脚本转发到不存在的 plugin:dialog|confirm 导致 ACL 报错。
 */
export default function DungeonConfirmModal({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: DungeonConfirmModalProps) {
  return (
    <div className="dungeon-confirm-modal" role="dialog" aria-modal="true">
      <div className="dungeon-confirm-card">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="dungeon-confirm-actions">
          <button className="pixel-btn" onClick={onCancel}>{cancelLabel}</button>
          <button className="pixel-btn primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
      <style>{`
        .dungeon-confirm-modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .dungeon-confirm-card {
          background: var(--bg-card);
          border: 4px solid var(--border-pixel);
          padding: 20px 24px;
          max-width: 340px;
          width: 100%;
          text-align: center;
        }
        .dungeon-confirm-card h3 {
          font-family: var(--pixel-font);
          font-size: 14px;
          color: var(--gold);
          margin: 0 0 12px;
        }
        .dungeon-confirm-card p {
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-light);
          margin: 0 0 20px;
        }
        .dungeon-confirm-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        .dungeon-confirm-actions .pixel-btn {
          font-size: 12px;
          padding: 8px 18px;
        }
      `}</style>
    </div>
  );
}
