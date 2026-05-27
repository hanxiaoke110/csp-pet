import { useState } from 'react';
import { escapeHtml } from '../../utils/markdown';

interface Props { hints: [string, string, string]; }

function fixHintsClient(hints: [string, string, string]): [string, string, string] {
  const fixed: [string, string, string] = [...hints];

  const patterns = [
    { regex: /([+\-*/%]?=\s*)(\w+(\[[^\]]+\])?)(?=\s*[;\n])/ },
    { regex: /([<>!=]=?\s*)(\w+(\[[^\]]+\])?)(?=\s*[;)\n])/ },
    { regex: /(\(\s*)(\w+)(\s*[,\n)])/ },
    { regex: /(return\s+)(\w+(\[[^\]]+\])?)(?=\s*[;\n])/ },
    { regex: /(cout\s*(?:<<\s*)*)(\w+)(\s*[;\n])/ },
    { regex: /([+\-*/%]\s*)(\w+(\[[^\]]+\])?)(?=\s*[;\n)])/ },
  ];

  function fixOneHint(code: string, targetBlanks: number): string {
    let s = code;
    let cnt = (s.match(/___/g) || []).length;
    if (cnt >= targetBlanks) return s;

    while (cnt < targetBlanks) {
      let bestIdx = Infinity, bestMatch: RegExpExecArray | null = null, replacement = '';
      for (const { regex } of patterns) {
        const g = new RegExp(regex.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = g.exec(s)) !== null) {
          if (!m[0].includes('___') && m.index < bestIdx) {
            const line = s.substring(Math.max(0, s.lastIndexOf('\n', m.index - 1))).trimStart();
            if (line.startsWith('#include') || line.startsWith('using')) continue;
            bestIdx = m.index;
            bestMatch = m;
            replacement = (m[1] || '') + '___';
            break;
          }
        }
      }
      if (!bestMatch) break;
      s = s.substring(0, bestIdx) + replacement + s.substring(bestIdx + bestMatch[0].length);
      cnt++;
    }
    return s;
  }

  fixed[1] = fixOneHint(fixed[1], 4);
  fixed[2] = fixOneHint(fixed[2], 2);
  return fixed;
}

export default function HintSystem({ hints }: Props) {
  const [level, setLevel] = useState(0);
  const fixed = fixHintsClient(hints);

  const labels = [
    '💡 第1级 · 思路引导',
    '🔍 第2级 · 代码框架',
  ];

  return (
    <div className="hint-system">
      <div className="hint-tabs">
        <button className={`hint-tab ${level === 0 ? 'active' : ''}`} onClick={() => setLevel(0)}>
          第1级 · 思路
        </button>
        <button className={`hint-tab ${level === 1 ? 'active' : ''}`} onClick={() => setLevel(1)}>
          第2级 · 框架
        </button>
      </div>
      <div className="hint-header">
        <span>{labels[level]}</span>
      </div>
      <div className="hint-content">
        {level === 0 ? (
          <div className="hint-text">{fixed[0]}</div>
        ) : (
          <pre><code dangerouslySetInnerHTML={{ __html: escapeHtml(fixed[1]) }} /></pre>
        )}
      </div>
    </div>
  );
}
