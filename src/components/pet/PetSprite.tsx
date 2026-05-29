import { useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { tick, wakeUp, triggerAnim, updateLastEvent, type PetAnimState } from './PetStateMachine';
import { createStateMachine } from './PetStateMachine';
import { isRemotePet } from '../../types/pet';
import { getCachedSpritePath } from '../../utils/spriteDownloader';

const CANVAS_SIZE = 200;

interface SpriteMeta { frameWidth: number; frameHeight: number; maxFrames: number; anims: Record<string, number>; animOrder: string[]; durations?: Record<string, number>; }
interface SpriteData { img: HTMLImageElement; meta: SpriteMeta; }

const ANIM_ORDER = ['idle', 'walk', 'sleep', 'celebrate', 'think', 'eat', 'unhappy'];

// ─── 2D sprite sheet cache ───
const spriteCache = new Map<string, SpriteData>();

// Extract pet ID from modelPath like "/pet-sprites/2d/capi.json"
function getPetId(modelPath: string): string {
  const parts = modelPath.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace('.json', '');
}

async function loadSpriteSheet(jsonPath: string, pngPath: string): Promise<SpriteData> {
  const cacheKey = jsonPath;
  if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey)!;
  const [metaResp, img] = await Promise.all([
    fetch(jsonPath).then(r => r.json()),
    new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Failed to load sprite: ${pngPath}`));
      i.src = pngPath;
    }),
  ]);
  const data: SpriteData = { img, meta: metaResp as SpriteMeta };
  spriteCache.set(cacheKey, data);
  return data;
}

export default function PetSprite({
  renderType: _renderType, modelPath,
}: {
  renderType?: string; modelPath?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spriteDivRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<SpriteData | null>(null);
  const currentAnimRef = useRef<PetAnimState>('idle');
  const smRef = useRef(createStateMachine());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [currentAnim, setCurrentAnim] = useState<PetAnimState>('idle');
  const [resolvedPngUrl, setResolvedPngUrl] = useState<string>('');
  const mountCountRef = useRef(0);

  // ─── Inject CSS @keyframes for sprite frame counts ───
  useEffect(() => {
    if (document.getElementById('pet-sprite-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'pet-sprite-keyframes';
    style.textContent = `
      @keyframes pet-spr-4 { to { background-position-x: -800px; } }
      @keyframes pet-spr-5 { to { background-position-x: -1000px; } }
      @keyframes pet-spr-6 { to { background-position-x: -1200px; } }
      @keyframes pet-spr-8 { to { background-position-x: -1600px; } }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ─── 2D CSS sprite ───
  useEffect(() => {
    if (!modelPath) return;

    mountCountRef.current++;
    const isFirstMount = mountCountRef.current === 1;

    let cancelled = false;

    async function resolvePaths(): Promise<{ jsonUrl: string; pngUrl: string }> {
      const petId = getPetId(modelPath!);
      if (isRemotePet(petId)) {
        // Check local cache for remote pets
        const cachedJson = await getCachedSpritePath(petId, 'json');
        const cachedPng = await getCachedSpritePath(petId, 'png');
        if (cachedJson && cachedPng) {
          return {
            jsonUrl: convertFileSrc(cachedJson),
            pngUrl: convertFileSrc(cachedPng),
          };
        }
        // Not cached — fall back to bundled path (won't work, but won't crash)
        // In normal flow this shouldn't happen as hatching downloads before reveal
        return {
          jsonUrl: modelPath!,
          pngUrl: modelPath!.replace('.json', '.png'),
        };
      }
      // Common/starter pets — use bundled path
      return {
        jsonUrl: modelPath!,
        pngUrl: modelPath!.replace('.json', '.png'),
      };
    }

    resolvePaths().then(({ jsonUrl, pngUrl }) => {
      if (cancelled) return;
      if (isFirstMount) setStatus('loading');
      setResolvedPngUrl(pngUrl);

      loadSpriteSheet(jsonUrl, pngUrl).then(data => {
        if (cancelled) return;
        spriteRef.current = data;
        setStatus('ready');
      }).catch(() => { if (!cancelled) setStatus('error'); });
    });

    // Lightweight rAF — state machine tick only, no rendering
    let raf = 0;
    let lastTick = performance.now();
    function tickSm() {
      raf = requestAnimationFrame(tickSm);
      const now = performance.now();
      const dt = Math.min(now - lastTick, 100);
      lastTick = now;
      const anim = tick(smRef.current, dt);
      if (anim !== currentAnimRef.current) {
        currentAnimRef.current = anim;
        setCurrentAnim(anim);
      }
    }
    raf = requestAnimationFrame(tickSm);

    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [modelPath]);

  // ─── Expose to window ───
  useEffect(() => {
    (window as any).__petSM__ = smRef.current;
    (window as any).__petWake__ = () => wakeUp(smRef.current);
    (window as any).__petUpdate__ = () => updateLastEvent(smRef.current);
    (window as any).__petTrigger__ = (anim: string, duration?: number) => triggerAnim(smRef.current, anim as PetAnimState, duration);
  }, []);

  const anim = currentAnim;
  const spr = spriteRef.current;
  const frames = spr?.meta.anims[anim] || 6;
  const duration = spr?.meta.durations?.[anim] || 1100;
  const rowIdx = ANIM_ORDER.indexOf(anim);
  const displayH = Math.round(CANVAS_SIZE * (spr?.meta.frameHeight || 208) / (spr?.meta.frameWidth || 192));

  return (
    <div ref={containerRef} style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, overflow: 'hidden', borderRadius: 12, position: 'relative' }}>
      <div ref={spriteDivRef} style={{
        width: CANVAS_SIZE, height: CANVAS_SIZE,
        backgroundImage: resolvedPngUrl ? `url("${resolvedPngUrl}")` : 'none',
        backgroundSize: `${(spr?.meta.maxFrames || 8) * CANVAS_SIZE}px auto`,
        backgroundPositionY: `-${rowIdx * displayH}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        animation: `pet-spr-${frames} ${duration}ms steps(${frames}) infinite`,
      }} />
      {status === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.05)', borderRadius: 12 }}>
          <div className="loading-spinner" />
        </div>
      )}
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>❓</div>
      )}
    </div>
  );
}

export { type PetAnimState };
