import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { CollectorCardDefinition, ResolvedCollectorCardAssets } from '../../types/collectorCard';

interface Props {
  card: CollectorCardDefinition;
  assets: ResolvedCollectorCardAssets;
}

type CardStyle = CSSProperties & Record<'--rx' | '--ry' | '--mx' | '--my' | '--px' | '--py' | '--card-accent' | '--card-glow', string>;

const ELEMENT_LABELS = { fire: '火', water: '水', wind: '风', earth: '地', light: '光' } as const;
const ELEMENT_PALETTES = {
  fire: ['#ff8059', 'rgba(255, 91, 49, .5)'],
  water: ['#79e5ff', 'rgba(60, 208, 255, .5)'],
  wind: ['#87f0c7', 'rgba(62, 223, 170, .5)'],
  earth: ['#e8bd71', 'rgba(208, 151, 66, .5)'],
  light: ['#fff0a0', 'rgba(255, 226, 108, .5)'],
} as const;

export default function HoloCardViewer({ card, assets }: Props) {
  const elementLabel = ELEMENT_LABELS[card.element];
  const [flipped, setFlipped] = useState(false);
  const [auto, setAuto] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0, mx: 50, my: 50 });
  const dragging = useRef(false);

  useEffect(() => {
    setFlipped(false);
    setAuto(false);
    setTilt({ x: 0, y: 0, mx: 50, my: 50 });
  }, [card.id]);

  const followPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (auto || (event.pointerType !== 'mouse' && !dragging.current)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setTilt({ x: (y - 0.5) * -15, y: (x - 0.5) * 19, mx: x * 100, my: y * 100 });
  };

  const style: CardStyle = {
    '--rx': `${tilt.x}deg`,
    '--ry': `${tilt.y + (flipped ? 180 : 0)}deg`,
    '--mx': `${tilt.mx}%`,
    '--my': `${tilt.my}%`,
    '--px': `${(tilt.mx - 50) / 18}px`,
    '--py': `${(tilt.my - 50) / 18}px`,
    '--card-accent': ELEMENT_PALETTES[card.element][0],
    '--card-glow': ELEMENT_PALETTES[card.element][1],
  };

  return (
    <div className="collector-viewer">
      <div
        className="collector-card-scene"
        onPointerMove={followPointer}
        onPointerDown={event => {
          dragging.current = true;
          setAuto(false);
          event.currentTarget.setPointerCapture(event.pointerId);
          followPointer(event);
        }}
        onPointerUp={event => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { dragging.current = false; }}
        onPointerLeave={event => {
          if (!dragging.current && event.pointerType === 'mouse' && !auto) {
            setTilt({ x: 0, y: 0, mx: 50, my: 50 });
          }
        }}
      >
        <div className={`holo-collector-card ${auto ? 'auto' : ''}`} style={style}>
          <div className="collector-card-face collector-card-front">
            <img className="collector-layer collector-background" src={assets.background} alt="" draggable={false} />
            {assets.subject && <img className="collector-layer collector-subject" src={assets.subject} alt={card.name} draggable={false} />}
            {assets.text && <img className="collector-layer collector-text" src={assets.text} alt="" draggable={false} />}
            <span className="collector-foil" />
            <span className="collector-glare" />
            <span className="collector-sparkles" />
            <span className="collector-edge" />
          </div>
          <div className="collector-card-face collector-card-back">
            <span className="collector-back-orbits" />
            <strong className="collector-back-sigil">{elementLabel}</strong>
            <h3>{card.name}</h3>
            <p>{elementLabel}属性 · 传说</p>
            <blockquote>{card.quote}</blockquote>
            <small>ASTRAL COLLECTION · FIRST EDITION</small>
            <b>典藏编号 {card.number}</b>
          </div>
        </div>
      </div>
      <div className="collector-viewer-actions">
        <button type="button" className={auto ? 'active' : ''} onClick={() => setAuto(value => !value)}>
          {auto ? 'Ⅱ 暂停赏卡' : '▷ 自动赏卡'}
        </button>
        <button type="button" onClick={() => { setAuto(false); setFlipped(value => !value); }}>
          {flipped ? '回到正面 ↻' : '翻看背面 ↻'}
        </button>
      </div>
      <p className="collector-viewer-hint">鼠标悬停跟随幻光 · 手指按住也能转动</p>
    </div>
  );
}
