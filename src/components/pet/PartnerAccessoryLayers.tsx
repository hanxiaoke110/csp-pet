import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { safeListen } from '../../lib/tauriEvents';
import { usePartnerAccessoryStore } from '../../stores/partnerAccessoryStore';
import { supportedAccessory } from '../../data/partnerAccessories';
import { advanceAccessoryTrail, orbitPoint, type AccessoryTrailPoint } from '../../utils/partnerAccessoryMotion';
import type { PartnerAccessory, PartnerAccessoryLoadout } from '../../types/partnerAccessory';
import './PartnerAccessories.css';

export function usePartnerAccessories() {
  useEffect(() => {
    const store = usePartnerAccessoryStore.getState(); void store.load();
    const refresh = () => store.refresh();
    const stop = safeListen('partner-accessories-sync', refresh);
    window.addEventListener('storage', refresh);
    return () => { stop(); window.removeEventListener('storage', refresh); };
  }, []);
}
function Glyph({ item }: { item: PartnerAccessory }) {
  const p = item.visual.primitive;
  const accent = item.visual.accent;
  return <g strokeLinejoin="round" strokeLinecap="round">
    {p === 'ring' || p === 'prism' ? <><ellipse cx="50" cy="50" rx="43" ry="24" fill="none" stroke="currentColor" strokeWidth="4" />{p === 'prism' && <path d="M50 8 91 50 50 92 9 50Z M50 24 77 50 50 76 23 50Z" fill="none" stroke={accent} strokeWidth="2.5" />}</> : p === 'lantern' ? <><path d="M50 18V6M40 82h20M50 82v12" stroke={accent} strokeWidth="5" /><rect x="25" y="19" width="50" height="63" rx="21" fill="currentColor" stroke="#82452c" strokeWidth="3" /><path d="M43 25q-13 26 0 50M57 25q13 26 0 50" fill="none" stroke={accent} strokeWidth="4" /><path d="M32 24h36M32 77h36" stroke={accent} strokeWidth="4" /></> : p === 'star' ? <><path d="m50 7 12 28 30 4-23 21 6 31-25-16-25 16 6-31L8 39l30-4Z" fill="currentColor" stroke="#97692b" strokeWidth="3" /><path d="m50 23 5 18 20 3-21 6Z" fill={accent} /></> : p === 'comet' ? <><path d="m9 84 56-56M24 91l46-47M8 65l44-43" stroke={accent} strokeWidth="6" /><circle cx="72" cy="27" r="17" fill="currentColor" /><circle cx="75" cy="24" r="7" fill="#fff" /></> : <><path d="M45 13h19v19H45zM69 39h19v19H69zM35 48h19v19H35zM11 71h19v19H11z" fill="currentColor" stroke={accent} strokeWidth="2" /></>}
  </g>;
}
export function AccessoryMark({ item }: { item: PartnerAccessory }) {
  if (!supportedAccessory(item)) return <span className="partner-accessory-unavailable">需要更新</span>;
  return <svg viewBox="0 0 100 100" aria-hidden="true"><Glyph item={item} /></svg>;
}

export default function PartnerAccessoryLayers({ petId, preview, moving = false, sleeping = false, paused = false }: {
  petId: string; preview?: PartnerAccessoryLoadout; moving?: boolean; sleeping?: boolean; paused?: boolean;
}) {
  usePartnerAccessories();
  const snapshot = usePartnerAccessoryStore(s => s.snapshot);
  const catalog = usePartnerAccessoryStore(s => s.catalog);
  const root = useRef<HTMLDivElement>(null);
  const history = useRef<AccessoryTrailPoint[]>([]);
  const movingRef = useRef(moving); movingRef.current = moving;
  const [frame, setFrame] = useState({ time: 0, x: 0, y: 0, scale: 1 });
  const [hidden, setHidden] = useState(document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  const loadout = preview || snapshot.equippedByPet[petId] || {};
  const items = Object.entries(loadout).flatMap(([slot, id]) => {
    const item = catalog.items.find(i => i.id === id && i.slot === slot);
    return item && supportedAccessory(item) ? [item] : [];
  });
  const trail = items.find(i => i.slot === 'trail');
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => { setHidden(document.hidden); setReduced(preference?.matches || false); };
    document.addEventListener('visibilitychange', update); preference?.addEventListener('change', update);
    return () => { document.removeEventListener('visibilitychange', update); preference?.removeEventListener('change', update); };
  }, []);
  const active = items.length > 0 && !hidden && !paused;
  useEffect(() => {
    history.current = [];
    if (!active || sleeping || reduced) return;
    let request = 0, last = -100;
    let previous: { x: number; y: number } | undefined;
    const tick = (time: number) => {
      if (time - last >= 32) {
        last = time;
        const rect = root.current?.getBoundingClientRect();
        if (rect && rect.width) {
          const position = { x: rect.x, y: rect.y };
          history.current = trail ? advanceAccessoryTrail(history.current, position, previous || position, time, movingRef.current, Math.min(1200, trail.visual.durationMs), Math.min(24, trail.visual.count * 3)) : [];
          if (!previous || !movingRef.current || Math.hypot(position.x - previous.x, position.y - previous.y) >= 2) previous = position;
          setFrame({ time, ...position, scale: rect.width / 200 });
        }
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(request); history.current = []; };
  }, [active, sleeping, reduced, trail?.id, trail?.visual.durationMs, trail?.visual.count]);
  if (!active) return null;
  const time = reduced || sleeping ? 0 : frame.time;
  const render = (front: boolean) => items.map(item => {
    const style = { color: item.visual.color, '--accessory-color': item.visual.color } as CSSProperties;
    if (item.slot === 'halo') {
      // Full stage coordinates: never fit a square glyph into a flattened box.
      const start = front ? 'M17 174 A83 19 0 0 0 183 174' : 'M17 174 A83 19 0 0 1 183 174';
      return <g key={item.id} className="partner-accessory-halo" style={style} transform={`translate(100 174) scale(${item.visual.size || 1}) translate(-100 -174)`}>
        <path d={start} stroke={item.visual.color} strokeWidth="9" opacity={.16 + Math.sin(time / item.visual.durationMs * Math.PI * 2) * .05} fill="none" />
        <path d={start} stroke="#163e56" strokeWidth="4.5" opacity=".8" fill="none" />
        <path d={start} stroke={item.visual.color} strokeWidth="2.5" fill="none" />
        {item.visual.primitive === 'prism' && !front && <g transform={`translate(100 174) scale(1 .23) rotate(${time / item.visual.durationMs * 360})`} fill="none" stroke={item.visual.accent} strokeWidth="3">
          <path d="M0-76 76 0 0 76-76 0Z M-53-53 53-53 53 53-53 53Z" />
          {Array.from({ length: 8 }, (_, i) => <path key={i} transform={`rotate(${i * 45})`} d="M0-87V-98" strokeWidth="5" />)}
          <g transform={`rotate(${-time / item.visual.durationMs * 720})`}><path d="M-53-53 53-53 53 53-53 53Z" stroke={item.visual.color} strokeWidth="2" /></g>
        </g>}
        {front && <ellipse cx="100" cy="174" rx="70" ry="14" fill="none" stroke={item.visual.accent} strokeWidth="1.5" strokeDasharray="10 19" strokeDashoffset={-time / 80} />}
        {front && item.visual.primitive === 'prism' && <g fill={item.visual.accent} stroke="#795d24" strokeWidth=".8">
          <path d="m14 167 6 8-6 8-6-8Z M186 167l6 8-6 8-6-8Z" />
          <path d="m100 185 4 6-4 6-4-6Z" fill={item.visual.color} />
          <path d="M24 182Q100 210 176 182" fill="none" stroke={item.visual.accent} strokeWidth="2" strokeDasharray="9 7" />
        </g>}
      </g>;
    }
    if (item.slot === 'orbit' && !sleeping) return <g key={item.id} className="partner-accessory-orbit" style={style}>
      {Array.from({ length: item.visual.count }, (_, i) => {
        const point = orbitPoint(time, i, item.visual.count, item.visual.durationMs);
        if (point.front !== front) return null;
        const size = (item.visual.primitive === 'lantern' ? 42 : 38) * point.scale * (item.visual.size || 1);
        return <g key={i} transform={`translate(${point.x} ${point.y}) rotate(${Math.sin(time / 900 + i) * 9})`} opacity={front ? 1 : .7}>
          <circle r={size * .68} fill={item.visual.color} opacity=".14" />
          <svg x={-size / 2} y={-size / 2} width={size} height={size} viewBox="0 0 100 100"><Glyph item={item} /></svg>
        </g>;
      })}
    </g>;
    if (item.slot === 'trail' && !front && !sleeping && !reduced && (moving || history.current.length)) return <g key={item.id} className={`partner-accessory-trail primitive-${item.visual.primitive}`} style={style}>
      {history.current.map((p, i) => {
        const life = Math.max(0, 1 - (frame.time - p.born) / Math.min(1200, item.visual.durationMs));
        const x = (p.x - frame.x) / frame.scale + 100 - (p.direction || 0) * 60, y = (p.y - frame.y) / frame.scale + 187;
        const color = i % 2 ? item.visual.accent : item.visual.color;
        return <g key={`${p.born}-${i}`} opacity={life} transform={`translate(${x} ${y}) scale(${item.visual.size || 1}) translate(${-x} ${-y})`}>
          {item.visual.primitive === 'pixel' ? <rect x={x} y={y - i % 3 * 5} width={7 * life + 2} height={7 * life + 2} fill={color} stroke="#235668" strokeWidth=".7" /> : <><circle cx={x} cy={y} r={life * 5 + 1} fill={color} /><path d={`M${x} ${y}l${7 * life} -3`} stroke={item.visual.accent} strokeWidth="2" /></>}
        </g>;
      })}
    </g>;
    return null;
  });
  return <div ref={root} className={`partner-accessory-layers ${sleeping ? 'sleeping' : ''}`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
    <svg className="partner-accessory-depth back" viewBox="0 0 200 200">{render(false)}</svg>
    <svg className="partner-accessory-depth front" viewBox="0 0 200 200">{render(true)}</svg>
  </div>;
}
