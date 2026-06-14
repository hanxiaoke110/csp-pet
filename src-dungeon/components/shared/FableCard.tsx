import { useState } from 'react';

interface Fable {
  id: string;
  knowledgePoints: string[];
  title: string;
  npc: string;
  story: string;
  reveal: string;
  oneLiner: string;
}

interface Props {
  fable: Fable;
  onClose?: () => void;
}

export default function FableCard({ fable, onClose }: Props) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="pixel-card" style={{
      borderColor: 'var(--gold-dark)',
      background: 'linear-gradient(135deg, #1a0a00, #1a1a0a)',
      animation: 'fadeIn 0.4s ease',
      marginTop: '16px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '12px', paddingBottom: '8px',
        borderBottom: '2px solid var(--gold-dark)',
      }}>
        <span style={{ fontSize: '20px' }}>📖</span>
        <div>
          <div style={{ fontFamily: 'var(--pixel-font)', fontSize: '10px', color: 'var(--gold)' }}>
            {fable.npc} 讲了一个故事
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-light)' }}>
            {fable.title}
          </div>
        </div>
      </div>

      {/* Story */}
      <div style={{
        fontSize: '13px', lineHeight: 2,
        color: '#d0d0d0',
        whiteSpace: 'pre-line',
        maxHeight: revealed ? 'none' : '200px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {fable.story}
        {!revealed && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '60px',
            background: 'linear-gradient(transparent, #1a1a0a)',
          }} />
        )}
      </div>

      {/* Reveal button */}
      {!revealed ? (
        <button
          className="pixel-btn primary"
          onClick={() => setRevealed(true)}
          style={{ width: '100%', marginTop: '12px', fontSize: '13px' }}
        >
          🔍 揭秘：这讲的是什么？
        </button>
      ) : (
        <div style={{
          marginTop: '12px', padding: '14px',
          background: 'rgba(255,215,0,0.08)',
          border: '2px solid var(--gold-dark)',
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{
            fontFamily: 'var(--pixel-font)', fontSize: '10px',
            color: 'var(--gold)', marginBottom: '8px',
          }}>
            🔍 揭秘
          </div>
          <div style={{
            fontSize: '13px', lineHeight: 1.8,
            color: '#d0d0d0', whiteSpace: 'pre-line',
          }}>
            {fable.reveal}
          </div>
          <div style={{
            marginTop: '10px', padding: '8px 12px',
            background: 'rgba(255,215,0,0.1)',
            borderLeft: '3px solid var(--gold)',
            fontSize: '12px', fontStyle: 'italic',
            color: 'var(--gold)',
          }}>
            💡 {fable.oneLiner}
          </div>
        </div>
      )}

      {/* Close */}
      {onClose && (
        <button
          className="pixel-btn"
          onClick={onClose}
          style={{ width: '100%', marginTop: '8px', fontSize: '11px' }}
        >
          继续修炼 →
        </button>
      )}
    </div>
  );
}
