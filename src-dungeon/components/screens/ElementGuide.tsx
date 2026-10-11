export function ElementGuide({ onClose }: { onClose: () => void }) {
  const traits = [
    ['🟫', '地', '答对后获得最大生命 3% 的护盾'],
    ['🔴', '火', '答对时造成的技能伤害提高 8%'],
    ['🟢', '风', '每达成 3 连击，额外缩短技能冷却 1 回合'],
    ['🔵', '水', '每达成 3 连击，额外恢复 1 点能量'],
    ['🌟', '光', '每达成 3 连击，恢复最大生命 4%'],
  ];
  return (
    <div className="element-guide-modal" role="dialog" aria-modal="true" aria-label="元素克制说明" onClick={onClose}>
      <div className="element-guide-card" onClick={(event) => event.stopPropagation()}>
        <h3>元素克制与特性</h3>
        <div className="element-chain">
          <p>🔴 火 → 🟢 风 → 🟫 地 → 🔵 水 → 🌟 光 → 🔴 火</p>
        </div>
        <p className="element-guide-summary">武器决定攻击属性：基础增伤5%，强化每阶增加5%；克制敌人时再乘120%。防具决定防御属性：克制敌人时减伤10%，强化每阶增加4%减伤。装备最多强化到+5；无克制不增加额外减伤，也不因被克制再乘旧的伤害倍率。</p>
        <p className="element-guide-summary">伙伴属性仅触发以下特性，不再叠加第二套基础克制倍率。未装备武器或防具时，不享受对应装备加成。</p>
        <div className="element-trait-list">
          {traits.map(([icon, name, description]) => (
            <div className="element-trait-row" key={name}>
              <span className="element-trait-name">{icon} {name}</span>
              <span>{description}</span>
            </div>
          ))}
        </div>
        <p className="element-guide-tip">战斗顶部会提示武器攻击与防具防御关系；伙伴特性触发时会在智子旁显示效果。装备特殊效果的触发次数在下一场重置。</p>
        <button className="pixel-btn primary" onClick={onClose}>知道了</button>
      </div>

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
        .element-guide-card {
          width: min(560px, 100%);
          max-height: calc(100vh - 40px);
          overflow: auto;
          padding: 22px;
          background: var(--bg-card);
          border: 4px solid var(--border-pixel);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
          text-align: center;
        }
        .element-guide-modal h3 {
          font-family: var(--pixel-font);
          font-size: 12px;
          color: var(--gold);
          margin-bottom: 16px;
          text-align: center;
        }
        .element-chain {
          background: rgba(255, 255, 255, 0.04);
          border: 2px solid var(--gold-dark);
          padding: 14px 16px;
          margin-bottom: 16px;
          font-size: 18px;
          text-align: center;
        }
        .element-guide-summary, .element-guide-tip {
          color: var(--text-dim);
          font-size: 12px;
          line-height: 1.7;
          margin: 0 0 14px;
        }
        .element-trait-list {
          display: grid;
          gap: 8px;
          margin-bottom: 14px;
          text-align: left;
        }
        .element-trait-row {
          display: grid;
          grid-template-columns: 72px 1fr;
          gap: 10px;
          align-items: center;
          padding: 9px 10px;
          border: 1px solid rgba(255,255,255,0.12);
          font-size: 12px;
          color: var(--text-light);
        }
        .element-trait-name {
          color: var(--gold);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
