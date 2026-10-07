import type { CSSProperties } from 'react';
import type { WardrobeItem, WardrobeVisualLayer } from '../../types/profile';

type LayerStyle = CSSProperties & Record<string, string | number | undefined>;

interface Props {
  items: WardrobeItem[];
  placement: 'background' | 'behind-avatar' | 'front';
  resolved: Record<string, string>;
  pointer: { x: number; y: number };
  reacting: boolean;
}

function seed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function layerStyle(layer: WardrobeVisualLayer, pointer: Props['pointer']): LayerStyle {
  const parallax = layer.parallax || 0;
  return {
    '--layer-x': `${layer.x ?? 50}%`,
    '--layer-y': `${layer.y ?? 50}%`,
    '--layer-width': `${layer.width ?? 100}%`,
    '--layer-height': `${layer.height ?? 100}%`,
    '--layer-opacity': layer.opacity ?? 1,
    '--layer-color': layer.color || '#8eeeff',
    '--layer-secondary': layer.secondaryColor || layer.color || '#fff1a8',
    '--layer-rotation': `${layer.rotation || 0}deg`,
    '--layer-duration': `${layer.durationMs || 4_000}ms`,
    '--layer-delay': `${layer.delayMs || 0}ms`,
    '--layer-size': `${layer.size || 8}px`,
    '--layer-blur': `${layer.blur || 0}px`,
    '--parallax-x': `${pointer.x * parallax}px`,
    '--parallax-y': `${pointer.y * parallax}px`,
    mixBlendMode: layer.blendMode === 'normal' ? undefined : layer.blendMode,
  };
}

function LayerContent({ item, layer, resolved, reacting }: {
  item: WardrobeItem;
  layer: WardrobeVisualLayer;
  resolved: Record<string, string>;
  reacting: boolean;
}) {
  const asset = resolved[`${item.id}:${layer.id}`] || layer.asset;
  if (layer.primitive === 'particle') {
    return <>{Array.from({ length: layer.count || 8 }, (_, index) => {
      const value = seed(`${item.id}:${layer.id}:${index}`);
      const particleStyle = {
        '--particle-x': `${6 + (value % 89)}%`,
        '--particle-y': `${5 + (Math.floor(value / 97) % 90)}%`,
        '--particle-delay': `${-1 * (value % (layer.durationMs || 4_000))}ms`,
        '--particle-scale': `${0.55 + (value % 70) / 100}`,
      } as LayerStyle;
      return <i key={index} style={particleStyle} />;
    })}</>;
  }
  if (asset) return <img src={asset} alt="" draggable={false} />;
  if (layer.primitive === 'orbit') return <i className="wardrobe-orbit-core" />;
  if (layer.primitive === 'click-burst' && !reacting) return null;
  return <i />;
}

export default function WardrobeVisualLayers({ items, placement, resolved, pointer, reacting }: Props) {
  const layers = items.flatMap(item => (item.visual?.layers || [])
    .filter(layer => layer.placement === placement)
    .map(layer => ({ item, layer })));
  if (!layers.length) return null;
  return (
    <div className={`wardrobe-visual-layers placement-${placement}`} aria-hidden="true">
      {layers.map(({ item, layer }) => (
        <span
          key={`${item.id}:${layer.id}`}
          className={`wardrobe-visual-layer primitive-${layer.primitive} animation-${layer.animation || 'none'} ${layer.avoidSafeZone ? 'avoid-safe-zone' : ''} ${reacting ? 'is-reacting' : ''}`}
          style={layerStyle(layer, pointer)}
        >
          <LayerContent item={item} layer={layer} resolved={resolved} reacting={reacting} />
        </span>
      ))}
    </div>
  );
}
