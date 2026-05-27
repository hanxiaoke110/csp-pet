import { useEffect, useState, useCallback, useRef } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import PetSprite from './PetSprite';
import type { PetAnimState } from './PetStateMachine';
import type { OwnedPet } from '../../types/pet';

const CLICK_LINES = [
  '别点啦，好痒~', '我在认真看你学习呢！', '今天学了什么新知识？', '要不要做几道选择题？',
  '记得喂我吃东西哦~', '你今天的签到别忘了！', '加油，你是最棒的！', '这道题需要我帮你分析吗？',
  '休息一下，劳逸结合~', 'C++ 真的很有趣！', '要不要来一发抽卡？', '今天还没去看 OJ 题目呢',
  '我饿了... 快喂我！', '你怎么又摸鱼了 😏', '好好学习，天天向上！', '今天的选择题做完了吗？',
  '我陪你一起学 C++！', '有什么不懂的可以问 AI 教练', '你的灵犀智子会一直陪着你',
  '冲冲冲！🏆', '这个 bug 一定能找到的！', '你好厉害，已经学了好多题了', '码代码的样子最帅了 ✨',
  '想不想抽个传说智子？', '快去商店看看新伙伴吧', '要不要给我起个新名字？',
  '看看你的成就解锁了多少？', '该复习错题了！', 'CSP 获奖在向你招手', '今天的运势很不错哦 🍀',
];
const HUNGRY_LINES = ['好饿啊... 求投喂 😿', '再不喂我就要饿扁了', '我想吃豪华食物！', '饿得没力气陪你学习了...'];
const MORNING_LINES = ['早上好！新的一天开始啦 ☀️', '今天也要元气满满地学 C++！', '早起的鸟儿有虫吃~'];
const NIGHT_LINES = ['夜深了，早点休息吧 🌙', '不要熬夜太晚哦，明天再学！', '晚安~ 明天见！'];
function pickRandom(arr: string[]): string { return arr[Math.floor(Math.random() * arr.length)]; }

type QuickAction = 'window' | 'challenge' | 'care' | 'shop' | 'checkin';
const ACTIONS: { key: QuickAction; icon: string; label: string }[] = [
  { key: 'window', icon: '📂', label: '窗口' }, { key: 'challenge', icon: '⚡', label: '挑战' },
  { key: 'care', icon: '🍖', label: '养成' }, { key: 'shop', icon: '🛒', label: '商城' },
  { key: 'checkin', icon: '✅', label: '签到' },
];

function ringPos(i: number, total: number, r: number) {
  const start = -Math.PI, end = 0;
  const a = start + (i / (total - 1)) * (end - start);
  return { left: 86 + r * Math.cos(a), top: 110 + r * Math.sin(a) };
}

export default function PetWindow() {
  const [animOverride, setAnimOverride] = useState<PetAnimState | undefined>();
  const [bubble, setBubble] = useState('');
  const [clickCount, setClickCount] = useState(0);
  const [activePet, setActivePet] = useState<OwnedPet | null>(null);
  const [showRing, setShowRing] = useState(false);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── ALL hooks must be called unconditionally ───

  // Window dragging
  useEffect(() => {
    const onMD = () => getCurrentWindow().startDragging().catch(() => {});
    document.addEventListener('mousedown', onMD);
    return () => document.removeEventListener('mousedown', onMD);
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

    // Poll for data until we get a pet
    pollRef.current = setInterval(() => {
      emit('pet-request-sync', {}).catch(() => {});
    }, 2000);

    listen('pet-anim', (e: any) => {
      const p = e.payload as { anim: PetAnimState; duration?: number };
      setAnimOverride(p.anim);
      setTimeout(() => setAnimOverride(undefined), p.duration || 3000);
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
      else if (h >= 6 && h <= 9) l = Math.random() < 0.3 ? pickRandom(MORNING_LINES) : pickRandom(CLICK_LINES);
      else if (h >= 22 || h <= 1) l = Math.random() < 0.4 ? pickRandom(NIGHT_LINES) : pickRandom(CLICK_LINES);
      else l = pickRandom(CLICK_LINES);
      setBubble(l);
      setTimeout(() => setBubble(''), 4000);
    };
    const i = setInterval(() => { if (Math.random() < 0.3) say(); }, 30000);
    return () => clearInterval(i);
  }, [activePet]);

  const showRingMenu = () => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    setShowRing(true);
    ringTimer.current = setTimeout(() => setShowRing(false), 5000);
  };

  const doAction = useCallback((a: QuickAction) => {
    setShowRing(false);
    switch (a) {
      case 'window': emit('pet-action', { action: 'open-window' }).catch(() => {}); break;
      case 'challenge': emit('pet-action', { action: 'navigate', target: '/quiz' }).catch(() => {}); break;
      case 'care': emit('pet-action', { action: 'navigate', target: '/pet' }).catch(() => {}); break;
      case 'shop': emit('pet-action', { action: 'navigate', target: '/pet?tab=shop' }).catch(() => {}); break;
      case 'checkin': emit('pet-action', { action: 'checkin' }).catch(() => {}); break;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.__petWake__?.(); window.__petUpdate__?.();
    const c = clickCount + 1; setClickCount(c);
    let l: string;
    if (activePet?.hunger && activePet.hunger <= 20) l = pickRandom(HUNGRY_LINES);
    else if (c % 10 === 0) l = `你戳了我 ${c} 次了！🤪`;
    else if (c % 5 === 0) l = pickRandom(['好痒好痒~', '哈哈哈别戳了', '再戳我要生气了 😤', '你是戳戳怪吗']);
    else l = pickRandom(CLICK_LINES);
    setBubble(l); setTimeout(() => setBubble(''), 4000);
    showRingMenu();
    if (activePet) emit('pet-click', { petId: activePet.petId, count: c }).catch(() => {});
  }, [clickCount, activePet]);

  // ─── Render ───
  if (!activePet) return null;

  return (
    <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pet-interact" style={{ width: 200, height: 200, position: 'relative' }} onClick={handleClick}>
        <PetSprite key={activePet.modelPath || 'empty'} animOverride={animOverride}
          renderType={activePet.renderType} modelPath={activePet.modelPath} />
      </div>
      {bubble && (
        <div style={{ position: 'absolute',
          ...(showRing ? { bottom: 2 } : { top: 2 }),
          left: '50%', transform: 'translateX(-50%)', background: '#fff',
          borderRadius: 14, padding: '5px 10px', fontSize: 11, fontWeight: 600, boxShadow: '0 3px 12px rgba(0,0,0,0.15)',
          maxWidth: 190, zIndex: 10, whiteSpace: 'nowrap', animation: 'bubbleIn .2s ease', border: '2px solid #fde68a' }}>
          {bubble}
          <div style={{ position: 'absolute',
            ...(showRing ? { top: -6, borderBottom: '6px solid #fff' } : { bottom: -6, borderTop: '6px solid #fff' }),
            left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent' }} />
        </div>
      )}
      {showRing && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
          {ACTIONS.map((a, i) => {
            const p = ringPos(i, ACTIONS.length, 80);
            return (
              <button key={a.key} onClick={(e) => { e.stopPropagation(); doAction(a.key); }}
                style={{ position: 'absolute', ...p, padding: '3px 6px', fontSize: 10, fontWeight: 600,
                  whiteSpace: 'nowrap', border: '1.5px solid #fde68a', borderRadius: 8, background: '#fff',
                  cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)', color: '#92400e',
                  lineHeight: 1.2, pointerEvents: 'auto', animation: `fanIn .2s ease ${i * 0.04}s both` }}
                onMouseEnter={e2 => { (e2.target as HTMLElement).style.background = '#fffbeb'; }}
                onMouseLeave={e2 => { (e2.target as HTMLElement).style.background = '#fff'; }}>
                {a.icon} {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
