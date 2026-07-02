export function ElementGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="element-guide-modal">
      <h3>元素克制手册</h3>
      <div className="element-chain">
        <p>🔥 火 → 🌪️ 风 → 🟫 地 → 💧 水 → 🔥</p>
      </div>
      <ul className="element-rules">
        <li><strong>克制：</strong>造成 1.5 倍伤害</li>
        <li><strong>被克：</strong>只造成 0.7 倍伤害</li>
        <li><strong>⭐ 光：</strong>没有克制关系，但很平衡</li>
      </ul>
      <button className="pixel-btn primary" onClick={onClose}>知道了</button>

      <style>{`
        .element-guide-modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .element-guide-modal h3 {
          font-family: var(--pixel-font);
          font-size: 12px;
          color: var(--gold);
          margin-bottom: 16px;
          text-align: center;
        }
        .element-chain {
          background: var(--bg-card);
          border: 4px solid var(--border-pixel);
          padding: 16px 24px;
          margin-bottom: 16px;
          font-size: 18px;
          text-align: center;
        }
        .element-rules {
          list-style: none;
          background: var(--bg-card);
          border: 4px solid var(--border-pixel);
          padding: 16px 24px;
          margin-bottom: 20px;
          max-width: 360px;
          width: 100%;
        }
        .element-rules li {
          font-size: 14px;
          line-height: 1.8;
          color: var(--text-light);
          margin-bottom: 8px;
        }
        .element-rules li:last-child {
          margin-bottom: 0;
        }
        .element-rules strong {
          color: var(--gold);
        }
      `}</style>
    </div>
  );
}
