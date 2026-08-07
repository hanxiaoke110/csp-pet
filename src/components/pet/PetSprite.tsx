import { useEffect, useRef, useState } from 'react';
import { readFile, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { tick, wakeUp, triggerAnim, updateLastEvent, type PetAnimState } from './PetStateMachine';
import { createStateMachine } from './PetStateMachine';
import { isRemotePet } from '../../types/pet';
import { downloadPetSprites } from '../../utils/spriteDownloader';
import { repairWorkshopSprite } from '../../utils/workshopSpriteRepair';

const CANVAS_SIZE = 140;
const CACHE_SUBDIR = 'pet-sprites/2d';

interface SpriteMeta {
  frameWidth: number;
  frameHeight: number;
  maxFrames?: number;
  // 工坊素材有两种写法：标准 7 行是 number；部分早期生成器写成 [行号, 帧数]
  anims: Record<string, number | [number, number]>;
  animOrder?: string[];
  animsOrder?: string[]; // 早期工坊生成器的错别字键
  durations?: Record<string, number>;
}
interface SpriteData { img: HTMLImageElement; meta: SpriteMeta; }

const ANIM_ORDER = ['idle', 'walk', 'sleep', 'celebrate', 'think', 'eat', 'unhappy'];
// Codex/Petdex 风格 9 行布局（与 ws-NK728B1914 等正确声明的素材一致）
const CODEX9_ORDER = ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'];
const CODEX9_FRAMES: Record<string, number> = { idle: 6, 'running-right': 8, 'running-left': 8, waving: 4, jumping: 5, failed: 8, waiting: 6, running: 6, review: 6 };
const SEVEN_FRAMES: Record<string, number> = { idle: 6, walk: 6, sleep: 4, celebrate: 4, think: 6, eat: 6, unhappy: 6 };

interface NormalizedSheet {
  order: string[];
  frames: Record<string, number>;
  durations: Record<string, number>;
  cols: number;
}

// 工坊/远程素材的 meta 与真实 PNG 经常不一致（声明行数≠实际行数、animsOrder 错别字、
// [行号,帧数] 数组写法）。一切以图片真实几何为准：行数决定布局，声明仅在同名同数时采信。
// 否则「点击切到不存在的行 → 精灵闪一下消失/跳姿」——豆包闪烁问题的根因。
function normalizeSheet(meta: SpriteMeta, img: HTMLImageElement): NormalizedSheet {
  const fw = meta.frameWidth || 192;
  const fh = meta.frameHeight || 208;
  const cols = Math.max(1, Math.round(img.naturalWidth / fw));
  const rows = Math.max(1, Math.round(img.naturalHeight / fh));
  const declared = meta.animOrder || meta.animsOrder;
  let order: string[];
  let canonicalFrames: Record<string, number> = {};
  if (declared && declared.length === rows) {
    order = declared;
  } else if (rows === 9) {
    order = CODEX9_ORDER;
    canonicalFrames = CODEX9_FRAMES;
  } else if (rows === 7) {
    order = ANIM_ORDER;
    canonicalFrames = SEVEN_FRAMES;
  } else {
    order = (declared && declared.length ? declared : ['idle']).slice(0, rows);
    while (order.length < rows) order.push(order[0]);
  }
  const frames: Record<string, number> = {};
  const durations: Record<string, number> = {};
  for (const name of order) {
    const raw = meta.anims?.[name];
    const n = Array.isArray(raw) ? Number(raw[1]) : Number(raw);
    frames[name] = Math.max(1, Math.min(cols, Number.isFinite(n) && n > 0 ? Math.round(n) : (canonicalFrames[name] || cols)));
    durations[name] = meta.durations?.[name] || 1100;
  }
  return { order, frames, durations, cols };
}
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

// 单窗多宠后一个窗口里有多个 PetSprite 实例，window.__petTrigger__ 全局会被互相覆盖；
// 改为通过 apiRef 暴露每实例的控制句柄。
export interface PetSpriteApi {
  trigger: (anim: PetAnimState, duration?: number) => void;
  wake: () => void;
  update: () => void;
}

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
  onReady, apiRef, exposeGlobals = true,
}: {
  renderType?: string; modelPath?: string; canvasSize?: number;
  onReady?: () => void;
  apiRef?: (api: PetSpriteApi | null) => void;
  exposeGlobals?: boolean;
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
  // 用 transform: translateX 驱动逐帧动画（合成器处理，不触发整窗重绘），
  // 全屏透明窗口下必须避免 background-position 动画导致的每帧全表面重排。
  // 帧数 1..12 全覆盖：工坊素材帧数不规范（[行,帧数] 写法、9列图），不能只列 4/5/6/8。
  useEffect(() => {
    const styleId = 'pet-sprite-keyframes';
    const old = document.getElementById(styleId);
    if (old) old.remove();
    const rules: string[] = [];
    for (let n = 1; n <= 12; n++) {
      rules.push(`@keyframes pet-spr-${n} { to { transform: translateX(-${renderWidth * n}px); } }`);
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = rules.join('\n');
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
          // Repair owned remote pets whose AppData sprites were lost during an
          // older update or manual cleanup, then retry the normal cache loader.
          const repaired = petId.startsWith('ws-')
            ? await repairWorkshopSprite(petId)
            : (await downloadPetSprites(petId)).errors.length === 0;
          if (cancelled) return;
          if (repaired) {
            try {
              const { data, blobUrl } = await loadCachedSprite(petId);
              if (cancelled) return;
              spriteRef.current = data;
              setMetaVersion(v => v + 1);
              setResolvedPngUrl(blobUrl);
              setStatus('ready');
              return;
            } catch { /* show the normal sprite error below */ }
          }
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
    }, 250);

    return () => { cancelled = true; window.clearInterval(stateTimer); };
  }, [modelPath]);

  // ─── Expose control API ───
  // 单窗多宠后一个窗口有多个实例：window 全局只在 exposeGlobals 时注册（兼容旧调用），
  // 每个实例始终通过 apiRef 暴露自己的控制句柄。
  useEffect(() => {
    const api: PetSpriteApi = {
      trigger: (anim, duration) => triggerAnim(smRef.current, anim, duration),
      wake: () => wakeUp(smRef.current),
      update: () => updateLastEvent(smRef.current),
    };
    apiRef?.(api);
    if (exposeGlobals) {
      (window as any).__petSM__ = smRef.current;
      (window as any).__petWake__ = api.wake;
      (window as any).__petUpdate__ = api.update;
      (window as any).__petTrigger__ = api.trigger;
    }
    return () => { apiRef?.(null); };
  }, []);

  // Notify the host window once the sprite is actually rendered, so a
  // freshly created transparent pet window can be shown instead of flashing
  // an empty/white frame during webview startup.
  useEffect(() => {
    if (status === 'ready' || status === 'error') onReady?.();
  }, [status, onReady]);

  const anim = currentAnim;
  const spr = spriteRef.current;
  // meta 与真实 PNG 可能不一致：以图片真实几何为准做归一化（行数定布局）
  const sheet = spr ? normalizeSheet(spr.meta, spr.img) : null;
  const order = sheet?.order || ANIM_ORDER;
  // 解析动画：pet 自有布局优先；csp 名不在则查别名（Petdex running/waving 等）；都没有回退 idle
  let resolvedAnim = order.indexOf(anim) >= 0 ? anim : '';
  if (!resolvedAnim) {
    for (const alias of (ANIM_ALIASES[anim] || [])) {
      if (order.indexOf(alias) >= 0) { resolvedAnim = alias; break; }
    }
  }
  if (!resolvedAnim) resolvedAnim = order.indexOf('idle') >= 0 ? 'idle' : order[0];
  const frames = sheet?.frames[resolvedAnim] || 6;
  const duration = sheet?.durations[resolvedAnim] || 1100;
  const rowIdx = order.indexOf(resolvedAnim);
  const displayH = sz;
  const stripCols = sheet?.cols || 8;

  return (
    <div ref={containerRef} style={{ width: sz, height: sz, borderRadius: 12, position: 'relative' }}>
      {/* 外层裁剪窗口固定一帧宽，内层整张精灵图用 transform 平移逐帧播放 */}
      <div style={{ width: renderWidth, height: sz, marginLeft: Math.round((sz - renderWidth) / 2), overflow: 'hidden' }}>
        <div ref={spriteDivRef} style={{
          width: stripCols * renderWidth,
          height: sz,
          backgroundImage: resolvedPngUrl ? `url("${resolvedPngUrl}")` : 'none',
          backgroundSize: `${stripCols * renderWidth}px auto`,
          backgroundPositionY: `-${rowIdx * displayH}px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          willChange: 'transform',
          animation: `pet-spr-${frames} ${duration}ms steps(${frames}) infinite`,
        }} />
      </div>
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
