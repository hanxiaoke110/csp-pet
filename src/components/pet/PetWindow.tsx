import { useEffect, useState, useCallback, useRef } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, PhysicalPosition, LogicalSize, availableMonitors } from '@tauri-apps/api/window';
import PetSprite from './PetSprite';
import type { PetAnimState } from './PetStateMachine';
import type { OwnedPet } from '../../types/pet';

const SIZE_MAP: Record<string, { canvas: number; win: number }> = {
  small:  { canvas: 110, win: 122 },
  medium: { canvas: 140, win: 154 },
  large:  { canvas: 170, win: 188 },
};

function getPetSize(): string {
  try { return localStorage.getItem('csp_pet_size') || 'medium'; }
  catch { return 'medium'; }
}

function getRoamingEnabled(): boolean {
  try { return localStorage.getItem('csp_pet_roaming') !== 'false'; }
  catch { return true; }
}

const CLICK_LINES = [
  '别点啦，好痒~', '我在认真看你学习呢！', '今天学了什么新知识？', '今天的每周任务做完了吗？',
  '记得喂我吃东西哦~', '你今天的签到别忘了！', '加油，你是最棒的！', '这道题需要我帮你分析吗？',
  '休息一下，劳逸结合~', 'C++ 真的很有趣！', '要不要去商店抽个新智子？', '今天还没去 OJ 刷题呢！',
  '好好学习，天天向上！', '我陪你一起学 C++！', '有什么不懂的可以问 AI 教练', '你的灵犀智子会一直陪着你',
  '冲冲冲！🏆', '这个 bug 一定能找到的！', '你好厉害，已经学了好多题了', '码代码的样子最帅了 ✨',
  '想不想抽个传说智子？', '快去商店看看新伙伴吧', '要不要给我起个新名字？',
  '看看你的成就解锁了多少？', 'CSP 获奖在向你招手', '今天的运势很不错哦 🍀',
  '今天的课程验证做完了吗？📚', '去刷刷编程猫的题单吧！🐱',
  '敢不敢挑战超级模式？5连击！⚡', '洛谷 AC 的感觉太爽了！', '你已经收集了多少只智子伙伴了？',
  '递归、贪心、DP... 今天练了哪个？', '算法虐我千百遍，我待算法如初恋~', '代码写累了就摸摸我放松一下！',
  '你怎么又摸鱼了 😏', '错题本等着你呢，该复习啦！',
];
const HUNGRY_LINES = ['好饿啊... 求投喂 😿', '再不喂我就要饿扁了', '我想吃豪华食物！', '饿得没力气陪你学习了...', '快去看看背包里有什么好吃的！'];
const MOOD_LOW_LINES = ['心情不太好... 陪我玩会儿吧 😢', '你不理我了吗？', '好无聊啊，来刷一道题吧！', '是不是遇到让你头疼的题了？'];
const MORNING_LINES = ['早上好！新的一天开始啦 ☀️', '今天也要元气满满地学 C++！', '早起的鸟儿有虫吃~', '今天打算刷几道题？先定个小目标！'];
const NIGHT_LINES = ['夜深了，早点休息吧 🌙', '不要熬夜太晚哦，明天再学！', '晚安~ 明天见！', '回顾一下今天学到的知识再睡吧~'];
function pickRandom(arr: string[]): string { return arr[Math.floor(Math.random() * arr.length)]; }

export default function PetWindow() {
  const [bubble, setBubble] = useState('');
  const [clickCount, setClickCount] = useState(0);
  const [activePet, setActivePet] = useState<OwnedPet | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDragging = useRef(false);
  const lastDragTime = useRef(0);
  const defaultPos = useRef<{ x: number; y: number } | null>(null);
  const [petSize, setPetSize] = useState(getPetSize);
  const lastClickTime = useRef(0);
  const [showActions, setShowActions] = useState(false);
  const actionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showActionBar = () => {
    if (actionsTimer.current) clearTimeout(actionsTimer.current);
    setShowActions(true);
    actionsTimer.current = setTimeout(() => setShowActions(false), 5000);
  };

  const size = SIZE_MAP[petSize] || SIZE_MAP.medium;
  const winSz = size.win;
  const canvasSz = size.canvas;
  const uiScale = canvasSz / 200; // proportional to original 200px canvas

  // ─── ALL hooks must be called unconditionally ───

  // Window dragging — only start drag when mouse moved > 5px (distinguish from click)
  useEffect(() => {
    let startX = 0, startY = 0;
    const onMD = (e: MouseEvent) => { startX = e.clientX; startY = e.clientY; isDragging.current = false; };
    const onMM = (e: MouseEvent) => {
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
        isDragging.current = true;
        getCurrentWindow().startDragging().catch(() => {});
      }
    };
    const onMU = () => {
      if (isDragging.current) lastDragTime.current = Date.now();
      startX = startY = 0;
    };
    document.addEventListener('mousedown', onMD);
    document.addEventListener('mousemove', onMM);
    document.addEventListener('mouseup', onMU);
    return () => {
      document.removeEventListener('mousedown', onMD);
      document.removeEventListener('mousemove', onMM);
      document.removeEventListener('mouseup', onMU);
    };
  }, []);

  // Data sync & events
  useEffect(() => {
    const load = () => {
      try {
        const d = JSON.parse(localStorage.getItem('csp_pet_data') || '{}');
        if (d.activePetId && d.ownedPets) {
          const p = d.ownedPets.find((x: OwnedPet) => x.petId === d.activePetId);
          if (p) setActivePet(p);
        }
      } catch {}
    };
    load();
    const c: (() => void)[] = [];
    listen('pet-data-sync', (e: any) => {
      const d = e.payload;
      localStorage.setItem('csp_pet_data', JSON.stringify(d));
      if (d.activePetId && d.ownedPets) {
        const p = d.ownedPets.find((x: OwnedPet) => x.petId === d.activePetId);
        if (p) setActivePet(p);
      }
    }).then(fn => c.push(fn));

    // Listen for size/preference changes from main window
    listen('pet-settings-changed', () => {
      setPetSize(getPetSize());
    }).then(fn => c.push(fn));

    // Poll for data until we get a pet
    pollRef.current = setInterval(() => {
      emit('pet-request-sync', {}).catch(() => {});
    }, 2000);

    listen('pet-anim', (e: any) => {
      const p = e.payload as { anim: PetAnimState; duration?: number };
      window.__petTrigger__?.(p.anim, p.duration);
    }).then(fn => c.push(fn));
    listen('pet-bubble', (e: any) => {
      setBubble(e.payload.text);
      setTimeout(() => setBubble(''), 4000);
    }).then(fn => c.push(fn));
    return () => {
      c.forEach(fn => fn());
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── Window size (use LogicalSize — CSS pixels match canvas) ───
  useEffect(() => {
    getCurrentWindow().setSize(new LogicalSize(winSz, winSz)).catch(() => {});
  }, [winSz]);

  // ─── Save default position on mount ───
  useEffect(() => {
    getCurrentWindow().outerPosition().then(p => {
      defaultPos.current = { x: p.x, y: p.y };
    }).catch(() => {});
  }, []);

  // ─── Roaming ───
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const roam = async () => {
      if (!getRoamingEnabled()) { timer = setTimeout(roam, 3000); return; }
      if (Date.now() - lastDragTime.current < 60_000) { timer = setTimeout(roam, 3000); return; }
      try {
        const monitors = await availableMonitors();
        if (!monitors || monitors.length === 0) { timer = setTimeout(roam, 5000); return; }
        const m = monitors[0];
        // monitor.size/position may arrive as { type: 'Physical', data: { width, height } }
        // or as plain { width, height } / { x, y } depending on Tauri version
        const rawSize = (m.size as any).data || m.size;
        const rawPos = (m.position as any).data || m.position;
        const mw = Number(rawSize.width);
        const mh = Number(rawSize.height);
        const mx = Number(rawPos.x);
        const my = Number(rawPos.y);
        const sf = Number(m.scaleFactor) || 1;
        if (!mw || !mh) { timer = setTimeout(roam, 5000); return; }
        // winSz is logical (CSS) pixels; monitor bounds are physical pixels
        const physWinSz = winSz * sf;
        const margin = 40;
        const nx = Math.round(mx + margin + Math.random() * (mw - physWinSz - margin * 2));
        const ny = Math.round(my + margin + Math.random() * (mh - physWinSz - margin * 2));
        const safeX = Math.max(mx + margin, Math.min(mx + mw - physWinSz - margin, nx));
        const safeY = Math.max(my + margin, Math.min(my + mh - physWinSz - margin, ny));
        await getCurrentWindow().setPosition(new PhysicalPosition(safeX, safeY));
      } catch { /* ignore */ }
      // Next roam in 10-30 seconds
      timer = setTimeout(roam, 10_000 + Math.random() * 20_000);
    };
    // First roam after 3 seconds so user sees it working
    timer = setTimeout(roam, 3000);
    return () => clearTimeout(timer);
  }, [winSz]);

  // Stop polling once we have a pet
  useEffect(() => {
    if (activePet && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [activePet]);

  // Auto idle dialogue
  useEffect(() => {
    if (!activePet) return;
    const say = () => {
      const h = new Date().getHours();
      let l: string;
      if (activePet.hunger <= 20) l = pickRandom(HUNGRY_LINES);
      else if (activePet.mood <= 20) l = pickRandom(MOOD_LOW_LINES);
      else if (h >= 6 && h <= 9) l = Math.random() < 0.3 ? pickRandom(MORNING_LINES) : pickRandom(CLICK_LINES);
      else if (h >= 22 || h <= 1) l = Math.random() < 0.4 ? pickRandom(NIGHT_LINES) : pickRandom(CLICK_LINES);
      else l = pickRandom(CLICK_LINES);
      setBubble(l);
      setTimeout(() => setBubble(''), 4000);
    };
    const i = setInterval(() => { if (Math.random() < 0.3) say(); }, 30000);
    return () => clearInterval(i);
  }, [activePet]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging.current) return;

    // Double-click detection — return to default position
    const now = Date.now();
    if (now - lastClickTime.current < 400) {
      lastClickTime.current = 0;
      if (defaultPos.current) {
        getCurrentWindow().setPosition(new PhysicalPosition(defaultPos.current.x, defaultPos.current.y)).catch(() => {});
        setBubble('我回来啦~ 🏠');
        setTimeout(() => setBubble(''), 3000);
      }
      return;
    }
    lastClickTime.current = now;

    window.__petWake__?.(); window.__petUpdate__?.();
    const c = clickCount + 1; setClickCount(c);
    let l: string;
    if (activePet?.hunger && activePet.hunger <= 20) l = pickRandom(HUNGRY_LINES);
    else if (activePet?.mood && activePet.mood <= 20) l = pickRandom(MOOD_LOW_LINES);
    else if (c % 10 === 0) l = `你戳了我 ${c} 次了！🤪`;
    else if (c % 5 === 0) l = pickRandom(['好痒好痒~', '哈哈哈别戳了', '再戳我要生气了 😤', '你是戳戳怪吗']);
    else l = pickRandom(CLICK_LINES);
    setBubble(l); setTimeout(() => setBubble(''), 4000);
    showActionBar();
  }, [clickCount, activePet]);

  // ─── Render ───
  if (!activePet) return null;

  const barH = Math.round(22 * uiScale);

  return (
    <div style={{ width: winSz, height: winSz, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pet-interact" style={{ width: canvasSz, height: canvasSz, position: 'relative' }} onClick={handleClick}>
        <PetSprite key={activePet.modelPath || 'empty'}
          renderType={activePet.renderType} modelPath={activePet.modelPath} canvasSize={canvasSz} />

        {/* Bubble */}
        {bubble && (
          <div style={{ position: 'absolute',
            top: Math.round(2 * uiScale),
            left: '50%', transform: 'translateX(-50%)', background: '#fff',
            borderRadius: Math.round(14 * uiScale), padding: `${Math.round(5 * uiScale)}px ${Math.round(10 * uiScale)}px`,
            fontSize: Math.max(10, Math.round(11 * uiScale)), fontWeight: 600, boxShadow: '0 3px 12px rgba(0,0,0,0.15)',
            maxWidth: Math.round(190 * uiScale), zIndex: 10, whiteSpace: 'nowrap', animation: 'bubbleIn .2s ease',
            border: `${Math.max(1, Math.round(2 * uiScale))}px solid #fde68a`, pointerEvents: 'none' }}>
            {bubble}
            <div style={{ position: 'absolute',
              bottom: Math.round(-6 * uiScale), borderTop: `${Math.round(6 * uiScale)}px solid #fff`,
              left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: `${Math.round(6 * uiScale)}px solid transparent`,
              borderRight: `${Math.round(6 * uiScale)}px solid transparent` }} />
          </div>
        )}

        {/* Action bar — overlaid at bottom of sprite, stays inside window */}
        {showActions && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: barH, zIndex: 10,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.45))',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: Math.round(6 * uiScale),
            paddingBottom: Math.round(3 * uiScale),
            borderRadius: '0 0 12px 12px',
          }}>
            {[
              { icon: '📂', label: '窗口', action: () => emit('pet-action', { action: 'open-window' }).catch(() => {}) },
              { icon: '🛒', label: '商城', action: () => emit('pet-action', { action: 'navigate', target: '/pet?tab=shop' }).catch(() => {}) },
              { icon: '👁️', label: '隐藏', action: () => invoke('toggle_pet_window').catch(() => {}) },
            ].map(btn => (
              <button key={btn.label} onClick={(e) => { e.stopPropagation(); btn.action(); }}
                style={{
                  background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: Math.round(6 * uiScale),
                  padding: `${Math.round(2 * uiScale)}px ${Math.round(5 * uiScale)}px`,
                  fontSize: Math.max(10, Math.round(11 * uiScale)), cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: Math.round(2 * uiScale),
                  color: '#334155', fontWeight: 600,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }}>
                {btn.icon}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
