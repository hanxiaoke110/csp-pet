import { useState } from 'react';
import { escapeHtml } from '../../utils/markdown';

interface Props { hints: [string, string, string]; }

export default function HintSystem({ hints }: Props) {
  const [level, setLevel] = useState(0);

  const tabs = [
    { label: '① 思路引导', desc: '纯文字提示，引导思考方向' },
    { label: '② 代码框架', desc: '带注释代码，关键位置挖空' },
  ];

  return (
    <div className="hint-system">
      <div className="hint-tabs">
        {tabs.map((t, i) => (
          <button key={i} className={`hint-tab ${level === i ? 'active' : ''}`} onClick={() => setLevel(i)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="hint-header">
        <span style={{ fontWeight: 700 }}>{tabs[level].label}</span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8, fontWeight: 400 }}>{tabs[level].desc}</span>
      </div>
      <div className="hint-content">
        {level === 0 ? (
          <div className="hint-text">{hints[0]}</div>
        ) : (
          <pre><code dangerouslySetInnerHTML={{ __html: escapeHtml(hints[1]) }} /></pre>
        )}
      </div>
    </div>
  );
}