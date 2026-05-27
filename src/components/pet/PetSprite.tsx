import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createStateMachine, tick, wakeUp, updateLastEvent, type PetAnimState } from './PetStateMachine';
import type { RenderType } from '../../types/pet';

const CANVAS_SIZE = 200;

interface SpriteMeta { frameWidth: number; frameHeight: number; maxFrames: number; anims: Record<string, number>; animOrder: string[]; }
interface SpriteData { img: HTMLImageElement; meta: SpriteMeta; }

const STARTER_MODELS: Record<string, { model: string; name: string; element: string }> = {
  xuanzai:  { model: 'animal-fox.glb',     name: '小玄仔', element: 'earth' },
  zhuque:   { model: 'animal-chick.glb',   name: '小朱雀', element: 'fire' },
  qingluan: { model: 'animal-parrot.glb',  name: '小青鸾', element: 'wind' },
  kunbao:   { model: 'animal-penguin.glb', name: '小鲲宝', element: 'water' },
};

export const ALL_MODELS = [
  'animal-bee.glb', 'animal-bunny.glb', 'animal-cat.glb', 'animal-caterpillar.glb',
  'animal-cow.glb', 'animal-crab.glb', 'animal-deer.glb', 'animal-dog.glb',
  'animal-elephant.glb', 'animal-fish.glb', 'animal-giraffe.glb', 'animal-hog.glb',
  'animal-koala.glb', 'animal-lion.glb', 'animal-monkey.glb', 'animal-panda.glb',
  'animal-pig.glb', 'animal-polar.glb', 'animal-tiger.glb', 'animal-beaver.glb',
];

function getModelPath(petId: string): string {
  const starter = STARTER_MODELS[petId];
  const modelName = starter ? starter.model : `animal-${petId}.glb`;
  return `/pet-sprites/3d/${modelName}`;
}

export function getStarterInfo(petId: string) { return STARTER_MODELS[petId] || null; }
export { getModelPath, STARTER_MODELS };

const ANIM_CONFIG: Record<PetAnimState, { bounceAmp: number; bounceSpeed: number; spinSpeed: number; swayAmp: number; swaySpeed: number; breatheAmp: number; breatheSpeed: number }> = {
  idle:      { bounceAmp: 0.3, bounceSpeed: 1.0, spinSpeed: 0.15, swayAmp: 0.05, swaySpeed: 0.4, breatheAmp: 0.03, breatheSpeed: 0.6 },
  walk:      { bounceAmp: 1.0, bounceSpeed: 3.0, spinSpeed: 0.10, swayAmp: 0.15, swaySpeed: 2.5, breatheAmp: 0.02, breatheSpeed: 1.5 },
  sleep:     { bounceAmp: 0.05, bounceSpeed: 0.2, spinSpeed: 0.0, swayAmp: 0.02, swaySpeed: 0.15, breatheAmp: 0.04, breatheSpeed: 0.3 },
  celebrate: { bounceAmp: 2.0, bounceSpeed: 5.0, spinSpeed: 3.0, swayAmp: 0.3, swaySpeed: 4.0, breatheAmp: 0.05, breatheSpeed: 2.0 },
  think:     { bounceAmp: 0.2, bounceSpeed: 0.5, spinSpeed: 0.05, swayAmp: 0.12, swaySpeed: 0.8, breatheAmp: 0.02, breatheSpeed: 0.5 },
  eat:       { bounceAmp: 0.5, bounceSpeed: 2.0, spinSpeed: 0.1, swayAmp: 0.08, swaySpeed: 1.5, breatheAmp: 0.03, breatheSpeed: 1.0 },
  unhappy:   { bounceAmp: 0.2, bounceSpeed: 0.8, spinSpeed: 0.05, swayAmp: 0.03, swaySpeed: 0.3, breatheAmp: 0.01, breatheSpeed: 0.4 },
};

const ANIM_ORDER = ['idle', 'walk', 'sleep', 'celebrate', 'think', 'eat', 'unhappy'];

// ─── 2D sprite sheet cache ───
const spriteCache = new Map<string, SpriteData>();

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
  animOverride, renderType, modelPath,
}: {
  animOverride?: PetAnimState; renderType?: RenderType; modelPath?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 3D refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const currentModelRef = useRef<string>('');
  // 2D refs
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const spriteRef = useRef<SpriteData | null>(null);
  const frameIdxRef = useRef(0);
  const frameTimerRef = useRef(0);
  // Shared
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const smRef = useRef(createStateMachine());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const loadModel = useCallback(async (path: string): Promise<THREE.Group> => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(path);
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = 2.5 / maxDim;
    model.position.set(-center.x * s, -center.y * s, 0);
    model.scale.setScalar(s);
    // Store base Y for animation
    (model as any).__baseY = -center.y * s;
    (model as any).__baseScale = s;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.6; mat.metalness = 0.05;
      }
    });
    return model;
  }, []);

  // ─── 3D scene init ───
  useEffect(() => {
    if (renderType === '2d') return; // skip 3D setup for 2D
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setSize(CANVAS_SIZE, CANVAS_SIZE);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    camera.position.set(0, 0, 7);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight('#ffffff', 1.8));
    const key = new THREE.DirectionalLight('#ffffff', 2.5); key.position.set(3, 4, 5); scene.add(key);
    const fill = new THREE.DirectionalLight('#aaccff', 0.8); fill.position.set(-2, 0, -2); scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 1.0); rim.position.set(0, -0.5, 3); scene.add(rim);

    let raf = 0;
    function loop() {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clockRef.current.getDelta(), 0.1);
      const elapsed = performance.now() * 0.001;
      const anim = animOverride || tick(smRef.current, dt * 1000);
      const cfg = ANIM_CONFIG[anim] || ANIM_CONFIG.idle;
      const model = modelRef.current;
      if (model) {
        const baseY = (model as any).__baseY || 0;
        const baseScale = (model as any).__baseScale || 1.0;
        // Bounce (Y-axis)
        model.position.y = baseY + Math.sin(elapsed * cfg.bounceSpeed * Math.PI * 2) * cfg.bounceAmp * 0.15;
        // Spin (Y-axis rotation)
        model.rotation.y += cfg.spinSpeed * dt;
        // Sway (Z-axis rotation — tilt left/right)
        model.rotation.z = Math.sin(elapsed * cfg.swaySpeed * Math.PI * 2) * cfg.swayAmp;
        // Breathe (scale pulse)
        model.scale.setScalar(baseScale + Math.sin(elapsed * cfg.breatheSpeed * Math.PI * 2) * cfg.breatheAmp);
        // Click squish — brief scale-down on recent interaction
        const sinceEvent = (Date.now() - smRef.current.lastEvent) / 1000;
        if (sinceEvent < 0.3) {
          const squish = 1.0 - (0.3 - sinceEvent) * 0.3; // 0.7 → 1.0 over 0.3s
          model.scale.setScalar((model.scale as any).x * squish);
        }
      }
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [renderType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 2D canvas init ───
  useEffect(() => {
    if (renderType !== '2d' || !modelPath) return;
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE; canvas.height = CANVAS_SIZE;
    canvas.style.display = 'block';
    canvas2dRef.current = canvas;
    const ctx = canvas.getContext('2d')!;

    const jsonPath = modelPath;
    const pngPath = modelPath.replace('.json', '.png');
    setStatus('loading');

    let cancelled = false;
    loadSpriteSheet(jsonPath, pngPath).then(data => {
      if (cancelled) return;
      spriteRef.current = data;
      // Append canvas only after sprite is ready — avoid white flash
      if (!container.contains(canvas)) {
        container.appendChild(canvas);
      }
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('error'); });

    let raf = 0;
    function loop() {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clockRef.current.getDelta(), 0.1);
      frameTimerRef.current += dt;
      const spr = spriteRef.current;
      if (!spr) return;

      const anim = animOverride || tick(smRef.current, dt * 1000);
      const rowIdx = ANIM_ORDER.indexOf(anim);
      const count = spr.meta.anims[anim] || 1;
      const fps = 8;

      if (frameTimerRef.current >= 1 / fps) {
        frameTimerRef.current = 0;
        frameIdxRef.current = (frameIdxRef.current + 1) % count;
      }

      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const fw = spr.meta.frameWidth, fh = spr.meta.frameHeight;
      const sx = (frameIdxRef.current % (spr.meta.maxFrames || 12)) * fw;
      const sy = rowIdx >= 0 ? rowIdx * fh : 0;
      ctx.drawImage(spr.img, sx, sy, fw, fh, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [renderType, modelPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load 3D model ───
  useEffect(() => {
    if (renderType === '2d' || !modelPath) return;
    if (currentModelRef.current === modelPath) return;
    currentModelRef.current = modelPath;
    setStatus('loading');
    if (modelRef.current && sceneRef.current) { sceneRef.current.remove(modelRef.current); modelRef.current = null; }
    loadModel(modelPath).then(m => {
      modelRef.current = m; sceneRef.current?.add(m); setStatus('ready');
    }).catch(() => setStatus('error'));
  }, [renderType, modelPath, loadModel]);

  // ─── Expose to window ───
  useEffect(() => {
    (window as any).__petSM__ = smRef.current;
    (window as any).__petWake__ = () => wakeUp(smRef.current);
    (window as any).__petUpdate__ = () => updateLastEvent(smRef.current);
  }, []);

  return (
    <div ref={containerRef} style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, overflow: 'hidden', borderRadius: 12, position: 'relative' }}>
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
