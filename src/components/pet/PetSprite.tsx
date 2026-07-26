import { useEffect, useRef, useState } from 'react';
import { readFile, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { tick, wakeUp, triggerAnim, updateLastEvent, type PetAnimState } from './PetStateMachine';
import { createStateMachine } from './PetStateMachine';
import { isRemotePet } from '../../types/pet';

const CANVAS_SIZE = 140;
const CACHE_SUBDIR = 'pet-sprites/2d';

interface SpriteMeta { frameWidth: number; frameHeight: number; maxFrames: number; anims: Record<string, number>; animOrder: string[]; durations?: Record<string, number>; }
interface SpriteData { img: HTMLImageElement; meta: SpriteMeta; }

const ANIM_ORDER = ['idle', 'walk', 'sleep', 'celebrate', 'think', 'eat', 'unhappy'];
// Behavior state → sprite row fallbacks. This keeps all existing seven-row
// pets usable while allowing Codex-style nine-row pets to use their richer
// direction and task states without an asset migration.
const ANIM_ALIASES: Record<string, string[]> = {
  walk: ['running', 'running-right', 'running-left'],
  'walk-left': ['running-left', 'walk', 'running', 'running-right'],
  'walk-right': ['running-right', 'walk', 'running', 'running-left'],
  greet: ['waving', 'celebrate'],
  interact: ['jumping', 'celebrate', 'waving'],
  failed: ['failed', 'unhappy'],
  waiting: ['waiting', 'think', 'idle'],
  working: ['running', 'walk', 'think'],
  review: ['review', 'think'],
  celebrate: ['waving'],
  think: ['review'],
  unhappy: ['failed'],
};

// ─── 2D sprite sheet cache ───
const spriteCache = new Map<string, SpriteData>();
const spriteBlobUrls = new Map<string, string>();

// Extract pet ID from modelPath like "/pet-sprites/2d/capi.json"
function getPetId(modelPath: string): string {
  const parts = modelPath.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace('.json', '');
}

// ─── Load bundled/common pet sprites ───
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

// ─── Load cached remote pet sprites from AppData ───
async function loadCachedSprite(petId: string): Promise<{ data: SpriteData; blobUrl: string }> {
  const cacheKey = `cached:${petId}`;
  const cached = spriteCache.get(cacheKey);
  const cachedBlob = spriteBlobUrls.get(cacheKey);
  if (cached && cachedBlob) return { data: cached, blobUrl: cachedBlob };

  const jsonRelPath = `${CACHE_SUBDIR}/${petId}.json`;
  const pngRelPath = `${CACHE_SUBDIR}/${petId}.png`;

  const [jsonText, pngBytes] = await Promise.all([
    readTextFile(jsonRelPath, { baseDir: BaseDirectory.AppData }),
    readFile(pngRelPath, { baseDir: BaseDirectory.AppData }),
  ]);

  const meta = JSON.parse(jsonText) as SpriteMeta;
  const blob = new Blob([new Uint8Array(pngBytes)], { type: 'image/png' });
  const blobUrl = URL.createObjectURL(blob);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(blobUrl); resolve(i); };
    i.onerror = () => reject(new Error(`Failed to load sprite: ${petId}`));
    i.src = blobUrl;
  });

  // Re-create blob for CSS background (first one was revoked after Image load)
  const cssBlob = new Blob([new Uint8Array(pngBytes)], { type: 'image/png' });
  const cssBlobUrl = URL.createObjectURL(cssBlob);

  const data: SpriteData = { img, meta };
  spriteCache.set(cacheKey, data);
  spriteBlobUrls.set(cacheKey, cssBlobUrl);
  return { data, blobUrl: cssBlobUrl };
}

export default function PetSprite({
  renderType: _renderType, modelPath, canvasSize,
}: {
  renderType?: string; modelPath?: string; canvasSize?: number;
}) {
  const sz = canvasSize || CANVAS_SIZE;
  const containerRef = useRef<HTMLDivElement>(null);
  const spriteDivRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<SpriteData | null>(null);
  const currentAnimRef = useRef<PetAnimState>('idle');
  const smRef = useRef(createStateMachine());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [currentAnim, setCurrentAnim] = useState<PetAnimState>('idle');
  const [resolvedPngUrl, setResolvedPngUrl] = useState<string>('');
  const mountCountRef = useRef(0);
  const [, setMetaVersion] = useState(0);
  const frameWidth = spriteRef.current?.meta.frameWidth || 192;
  const frameHeight = spriteRef.current?.meta.frameHeight || 208;
  // Scale to the frame height, not its width: every 192×208 legacy/Codex cell
  // remains fully visible inside the square pet canvas instead of losing feet.
  const renderWidth = Math.round(sz * frameWidth / frameHeight);

  // ─── Inject CSS @keyframes for sprite frame counts (dynamic, depends on cell width) ───
  useEffect(() => {
    const styleId = 'pet-sprite-keyframes';
    const old = document.getElementById(styleId);
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes pet-spr-4 { to { background-position-x: -${renderWidth * 4}px; } }
      @keyframes pet-spr-5 { to { background-position-x: -${renderWidth * 5}px; } }
      @keyframes pet-spr-6 { to { background-position-x: -${renderWidth * 6}px; } }
      @keyframes pet-spr-8 { to { background-position-x: -${renderWidth * 8}px; } }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [renderWidth]);

  // ─── 2D CSS sprite ───
  useEffect(() => {
    if (!modelPath) return;

    mountCountRef.current++;
    const isFirstMount = mountCountRef.current === 1;

    let cancelled = false;

    async function load() {
      const petId = getPetId(modelPath!);

      // Remote pets: read directly from AppData cache
      if (isRemotePet(petId)) {
        try {
          if (isFirstMount) setStatus('loading');
          const { data, blobUrl } = await loadCachedSprite(petId);
          if (cancelled) return;
          spriteRef.current = data;
          setMetaVersion(v => v + 1);
          setResolvedPngUrl(blobUrl);
          setStatus('ready');
          return;
        } catch {
          // Cache miss — fall through to bundled path
        }
      }

      // Common pet or remote pet without cache
      const jsonUrl = modelPath!;
      const pngUrl = modelPath!.replace('.json', '.png');
      if (isFirstMount) setStatus('loading');
      setResolvedPngUrl(pngUrl);

      loadSpriteSheet(jsonUrl, pngUrl).then(data => {
        if (cancelled) return;
        spriteRef.current = data;
        setMetaVersion(v => v + 1);
        setStatus('ready');
      }).catch(() => { if (!cancelled) setStatus('error'); });
    }

    load();

    // CSS animates frames; the state scheduler only needs a modest cadence.
    let lastTick = performance.now();
    const stateTimer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - lastTick, 250);
      lastTick = now;
      const anim = tick(smRef.current, dt);
      if (anim !== currentAnimRef.current) {
        currentAnimRef.current = anim;
        setCurrentAnim(anim);
      }
    }, 100);

    return () => { cancelled = true; window.clearInterval(stateTimer); };
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
  const order = spr?.meta.animOrder || ANIM_ORDER;
  // 解析动画：pet 自有 animOrder 优先；csp 名不在则查别名（Petdex running/waving 等）；都没有回退 idle
  let resolvedAnim = order.indexOf(anim) >= 0 ? anim : '';
  if (!resolvedAnim) {
    for (const alias of (ANIM_ALIASES[anim] || [])) {
      if (order.indexOf(alias) >= 0) { resolvedAnim = alias; break; }
    }
  }
  if (!resolvedAnim) resolvedAnim = order.indexOf('idle') >= 0 ? 'idle' : order[0];
  const frames = spr?.meta.anims[resolvedAnim] || 6;
  const duration = spr?.meta.durations?.[resolvedAnim] || 1100;
  const rowIdx = order.indexOf(resolvedAnim);
  const displayH = sz;

  return (
    <div ref={containerRef} style={{ width: sz, height: sz, borderRadius: 12, position: 'relative' }}>
      <div ref={spriteDivRef} style={{
        width: renderWidth, height: sz, marginLeft: Math.round((sz - renderWidth) / 2),
        backgroundImage: resolvedPngUrl ? `url("${resolvedPngUrl}")` : 'none',
        backgroundSize: `${(spr?.meta.maxFrames || 8) * renderWidth}px auto`,
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
