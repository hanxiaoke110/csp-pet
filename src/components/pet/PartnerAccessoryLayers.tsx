import { useEffect, useState, type CSSProperties } from 'react';
import { safeListen } from '../../lib/tauriEvents';
import { usePartnerAccessoryStore } from '../../stores/partnerAccessoryStore';
import { supportedAccessory } from '../../data/partnerAccessories';
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
export function AccessoryMark({ item }: { item: PartnerAccessory }) {
  if (!supportedAccessory(item)) return <span className="partner-accessory-unavailable">需要更新</span>;
  const p = item.visual.primitive;
  return <svg viewBox="0 0 100 100" aria-hidden="true">
    {p === 'ring' || p === 'prism' ? <><ellipse cx="50" cy="50" rx="39" ry="15" fill="none" stroke="currentColor" strokeWidth="2" />{p === 'prism' && <><path d="M50 10 86 50 50 90 14 50Z" fill="none" stroke="currentColor" /><path d="m50 27 19 23-19 23-19-23Z" fill="none" stroke="currentColor" /></>}</> : p === 'lantern' ? <><path d="M50 18V8M40 82h20M50 82v10" stroke="currentColor" strokeWidth="3" /><rect x="27" y="20" width="46" height="60" rx="22" fill="currentColor" opacity=".75" /><path d="M44 24q-12 28 0 52M56 24q12 28 0 52" fill="none" stroke="#fff0b0" /></> : p === 'star' ? <path d="m50 8 11 28 30 3-23 20 7 31-25-16-25 16 7-31L9 39l30-3Z" fill="currentColor" /> : p === 'comet' ? <><path d="m10 80 55-52M22 88l49-49M12 61l44-42" stroke="currentColor" strokeWidth="4" /><circle cx="72" cy="27" r="14" fill="currentColor" /></> : <><path d="M45 13h18v18H45zM68 38h18v18H68zM35 47h18v18H35zM12 70h18v18H12z" fill="currentColor" /></>}
  </svg>;
}
export default function PartnerAccessoryLayers({ petId, preview, moving = false, sleeping = false, paused = false }: {
  petId: string; preview?: PartnerAccessoryLoadout; moving?: boolean; sleeping?: boolean; paused?: boolean;
}) {
  usePartnerAccessories();
  const snapshot = usePartnerAccessoryStore(s => s.snapshot);
  const catalog = usePartnerAccessoryStore(s => s.catalog);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => { const update = () => setHidden(document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  const loadout = preview || snapshot.equippedByPet[petId] || {};
  if (hidden || paused) return null;
  return <div className={`partner-accessory-layers ${sleeping ? 'sleeping' : ''}`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
    {Object.entries(loadout).map(([slot, id]) => {
      const item = catalog.items.find(i => i.id === id && i.slot === slot);
      if (!item || !supportedAccessory(item) || (slot === 'trail' && (!moving || sleeping))) return null;
      const style = { '--accessory-color': item.visual.color, '--accessory-accent': item.visual.accent, '--accessory-duration': `${item.visual.durationMs}ms` } as CSSProperties;
      return <div key={slot} className={`partner-accessory-${slot} primitive-${item.visual.primitive}`} style={style}>
        {Array.from({ length: slot === 'halo' ? 1 : item.visual.count }, (_, i) => <span key={i} style={{ '--accessory-index': i, '--accessory-count': item.visual.count, ...(slot === 'orbit' ? { left: `${6 + 76 * i / Math.max(1, item.visual.count - 1)}%`, top: `${25 + (i % 2) * 25}%` } : {}) } as CSSProperties}><AccessoryMark item={item} /></span>)}
      </div>;
    })}
  </div>;
}
