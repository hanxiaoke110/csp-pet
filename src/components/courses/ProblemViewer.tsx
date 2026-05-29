import { useState } from 'react';
import type { Problem } from '../../types/course';
import { escapeHtml, renderMarkdown } from '../../utils/markdown';
import HintSystem from './HintSystem';
import AskAIModal from './AskAIModal';
import UnderstandModal from './UnderstandModal';
import { usePetStore } from '../../stores/petStore';
import { emit } from '@tauri-apps/api/event';

export type SectionType = 'review' | 'inClassCodes' | 'inClassQuiz' | 'homework' | 'extended';
export type ProblemStatus = 'not_started' | 'completed' | 'retry' | 'attempted';

interface Props {
  problem: Problem;
  sectionType: SectionType;
}

function loadStatus(problemId: string): ProblemStatus {
  try {
    const saved = localStorage.getItem('csp_problem_status');
    return saved ? (JSON.parse(saved)[problemId] || 'not_started') : 'not_started';
  } catch { return 'not_started'; }
}

function saveStatus(problemId: string, status: ProblemStatus) {
  try {
    const saved = localStorage.getItem('csp_problem_status');
    const all = saved ? JSON.parse(saved) : {};
    all[problemId] = status;
    localStorage.setItem('csp_problem_status', JSON.stringify(all));
  } catch { /* ignore */ }
}

export const STATUS_LABELS: Record<ProblemStatus, string> = {
  not_started: '',
  completed: '✅',
  retry: '🔄',
  attempted: '💡',
};

export const TYPE_CONFIG: Record<SectionType, { label: string; badge: string; required: boolean; hasVerify: boolean; hasExp: boolean }> = {
  homework:     { label: '必做', badge: '📋', required: true,  hasVerify: true,  hasExp: true },
  inClassCodes: { label: '选做', badge: '💻', required: false, hasVerify: true,  hasExp: true },
  extended:     { label: '选做', badge: '📌', required: false, hasVerify: true,  hasExp: true },
  review:       { label: '自由', badge: '📄', required: false, hasVerify: false, hasExp: false },
  inClassQuiz:  { label: '自由', badge: '📝', required: false, hasVerify: false, hasExp: false },
};

export default function ProblemViewer({ problem, sectionType }: Props) {
  const [showDesc, setShowDesc] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [showMistakes, setShowMistakes] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showUnderstand, setShowUnderstand] = useState(false);
  const [status, setStatus] = useState<ProblemStatus>(() => loadStatus(problem.id));

  const cfg = TYPE_CONFIG[sectionType];
  const hasDesc = (problem.description || '').trim().length > 0;
  const hasThinking = (problem.thinking || '').length > 5;
  const hasMistakes = (problem.commonMistakes || []).length > 0;
  const hasHints = (problem.progressiveHints || []).length >= 3;

  const handleUnderstand = () => {
    setStatus('completed');
    saveStatus(problem.id, 'completed');
    // Hold rewards until weekly practice done
    if (cfg.hasExp) {
      const store = usePetStore.getState();
      store.addPendingRewards(15, 5);
      // Track milestone
      trackCompletion();
    }
    // Notify pet: celebrate!
    emit('pet-anim', { anim: 'celebrate', duration: 3000 }).catch(() => {});
    const lines = ['又搞定一道题！🎉', '厉害！继续加油~', '一道接一道，根本停不下来！', '学会了！真棒 👏'];
    emit('pet-bubble', { text: lines[Math.floor(Math.random() * lines.length)] }).catch(() => {});
  };

  const trackCompletion = () => {
    try {
      const count = parseInt(localStorage.getItem('csp_completed_count') || '0') + 1;
      localStorage.setItem('csp_completed_count', String(count));
      // Milestone check
      const milestones = [5, 20, 50, 100];
      if (milestones.includes(count)) {
        usePetStore.getState().addCoins(count === 100 ? 100 : count === 50 ? 50 : count === 20 ? 20 : 10);
        if (usePetStore.getState().activePetId) {
          usePetStore.getState().addExp(usePetStore.getState().activePetId!, count * 2);
        }
        // Show toast
        window.dispatchEvent(new CustomEvent('csp-milestone', { detail: { count } }));
      }
    } catch { /* ignore */ }
  };

  return (
    <div className={`problem-item status-${status}`}>
      <div className="problem-header">
        <span className={`problem-badge badge-${sectionType}`} title={cfg.label}>
          {cfg.badge} {cfg.label}
        </span>
        <span className="problem-status-icon">{STATUS_LABELS[status]}</span>
        <span className="problem-title">{problem.title}</span>
        <span className="problem-platform">
          {problem.platform && problem.pid ? `${problem.platform} ${problem.pid}` : ''}
        </span>
        <div className="problem-actions">
          {hasDesc && <button className="pb-btn" onClick={() => setShowDesc(!showDesc)}>📄 题目</button>}
          {hasThinking && <button className="pb-btn" onClick={() => setShowThinking(!showThinking)}>💡 思路</button>}
          {hasMistakes && <button className="pb-btn" onClick={() => setShowMistakes(!showMistakes)}>⚠️ 易错</button>}
          {hasHints && <button className="pb-btn" onClick={() => setShowHints(!showHints)}>🔍 提示</button>}
          <button className="pb-btn pb-btn-ai" onClick={() => setShowAI(true)}>🤔 问 AI</button>
          {cfg.hasVerify && status !== 'completed' && (
            <button className="pb-btn pb-btn-done" onClick={() => setShowUnderstand(true)}>
              ✅ 我会了
            </button>
          )}
        </div>
      </div>

      {showDesc && (
        <div className="problem-desc">
          <h4>题目描述</h4>
          <div dangerouslySetInnerHTML={{ __html: escapeHtml(problem.description).replace(/\n/g, '<br>') }} />
          {problem.inputFormat && <><h4>输入格式</h4><p>{problem.inputFormat}</p></>}
          {problem.outputFormat && <><h4>输出格式</h4><p>{problem.outputFormat}</p></>}
          {(problem.samples || []).map((s, i) => (
            <div key={i} className="sample-block">
              <div><strong>样例 {i + 1} 输入：</strong><code>{s.in || s.input || ''}</code></div>
              <div><strong>样例 {i + 1} 输出：</strong><code>{s.out || s.output || ''}</code></div>
            </div>
          ))}
        </div>
      )}

      {showThinking && (
        <div className="problem-thinking">
          <h4>💡 解题思路</h4>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(problem.thinking || '') }} />
        </div>
      )}

      {showMistakes && (
        <div className="problem-mistakes">
          <h4>⚠️ 常见错误</h4>
          {(problem.commonMistakes || []).map((m, i) => (
            <div key={i} className="mistake-item">
              <span className="mistake-name">⚠ {m.mistake}</span>
              <span className="mistake-fix">→ {m.fix}</span>
            </div>
          ))}
        </div>
      )}

      {showHints && <HintSystem hints={problem.progressiveHints!} />}

      {showAI && <AskAIModal problem={problem} onClose={() => setShowAI(false)} />}

      {showUnderstand && (
        <UnderstandModal
          sectionType={sectionType}
          problemTitle={problem.title}
          onClose={() => setShowUnderstand(false)}
          onConfirm={handleUnderstand}
        />
      )}
    </div>
  );
}
