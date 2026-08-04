import { useEffect, useState, useCallback, useRef } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, PhysicalPosition, LogicalSize, currentMonitor } from '@tauri-apps/api/window';
import PetSprite from './PetSprite';
import type { PetAnimState } from './PetStateMachine';
import { PetDialogueDirector } from './PetDialogueDirector';
import type { OwnedPet } from '../../types/pet';
import { safeListen } from '../../lib/tauriEvents';
import { sqliteGet } from '../../lib/sqlite-storage';

const SIZE_MAP: Record<string, { canvas: number; win: number }> = {
  small: { canvas: 110, win: 122 },
  medium: { canvas: 140, win: 154 },
  large: { canvas: 170, win: 188 },
};
const BUBBLE_SPACE = 76;

const getPetSize = () => {
  try { return localStorage.getItem('csp_pet_size') || 'medium'; } catch { return 'medium'; }
};
const getRoamingEnabled = () => {
  try { return localStorage.getItem('csp_pet_roaming') === 'true'; } catch { return false; }
};
const sleep = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
// Slot detection: prefer the native window label ('pet' / 'pet-2' / 'pet-3').
// URL query strings (?slot=N) can be dropped by the production asset protocol,
// which previously made a companion window fall back to slot 1 (or render nothing).
const labelSlot = (() => {
  try {
    const match = /^pet-(\d+)$/.exec(getCurrentWindow().label);
    return match ? Number(match[1]) : null;
  } catch { return null; }
})();
const querySlot = Number(new URLSearchParams(window.location.search).get('slot')) || null;
const desktopSlot = Math.max(1, Math.min(3, labelSlot ?? querySlot ?? 1));
const positionKey = desktopSlot === 1 ? 'csp_pet_pos' : `csp_pet_pos_${desktopSlot}`;

function selectWindowPet(data: any): OwnedPet | null {
  const pets = Array.isArray(data?.ownedPets) ? data.ownedPets as OwnedPet[] : [];
  const petId = desktopSlot === 1 ? data?.activePetId : data?.desktopCompanionIds?.[desktopSlot - 2];
  return pets.find(item => item.petId === petId) || null;
}

export default function PetWindow() {
  const [bubble, setBubble] = useState('');
  const [clickCount, setClickCount] = useState(0);
  const [activePet, setActivePet] = useState<OwnedPet | null>(null);
  const [petSize, setPetSize] = useState(getPetSize);
  const [roamingEnabled, setRoamingEnabled] = useState(getRoamingEnabled);
  const [showActions, setShowActions] = useState(false);

  // Windows 独立 WebView2 环境下 localStorage 不再共享，窗口偏好从 SQLite 读取
  const applyStoredSettings = async () => {
    try {
      const [size, roaming] = await Promise.all([
        sqliteGet('csp_pet_size'),
        sqliteGet('csp_pet_roaming'),
      ]);
      if (size && SIZE_MAP[size]) setPetSize(size);
      if (roaming !== null) setRoamingEnabled(roaming === 'true');
    } catch { /* 保持 localStorage 默认值 */ }
  };

  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragStarted = useRef(false);
  const lastClickTime = useRef(0);
  const defaultPos = useRef<{ x: number; y: number } | null>(null);
  const roamingPausedUntil = useRef(0);
  const dialogue = useRef(new PetDialogueDirector());
  const currentWindowSize = useRef({
    width: Math.max(260, (SIZE_MAP[getPetSize()] || SIZE_MAP.medium).win + 96),
    height: (SIZE_MAP[getPetSize()] || SIZE_MAP.medium).win + BUBBLE_SPACE,
  });
  const autoShownRef = useRef(false);

  const size = SIZE_MAP[petSize] || SIZE_MAP.medium;
  const winSz = size.win;
  const canvasSz = size.canvas;
  const uiScale = canvasSz / 200;
  // 气泡固定画在窗口内部：窗口尺寸不再随气泡显示/消失而变化，
  // 避免透明置顶窗口反复 resize 造成闪烁。
  const windowWidth = Math.max(260, winSz + 96);
  const windowHeight = winSz + BUBBLE_SPACE;

  // 窗口创建时保持隐藏，等精灵真正渲染出来再 show，
  // 消除第二/第三智子窗口创建瞬间的闪白/闪黑。
  const handleSpriteReady = useCallback(() => {
    if (autoShownRef.current) return;
    autoShownRef.current = true;
    getCurrentWindow().show().catch(() => {});
    // 通知主窗口“独立桌宠窗口已真正可见”，供“设为桌面伙伴”按钮确认/回滚
    emit('pet-companion-shown', { slot: desktopSlot }).catch(() => {});
  }, []);

  // 兜底：远程素材下载慢/失败时也要让窗口先出现（loading 状态），
  // 避免出现“按钮显示已设置，但桌面一直没有第二只智子”的假成功。
  useEffect(() => {
    const timer = setTimeout(() => {
      if (autoShownRef.current) return;
      autoShownRef.current = true;
      getCurrentWindow().show().catch(() => {});
      emit('pet-companion-shown', { slot: desktopSlot }).catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const pauseRoaming = useCallback((ms: number) => {
    roamingPausedUntil.current = Math.max(roamingPausedUntil.current, Date.now() + ms);
    window.__petTrigger__?.('idle');
  }, []);

  const showBubble = useCallback((text: string, urgent = false) => {
    if (!text) return;
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble(text);
    // Reading time is proportional to text length, bounded to avoid a sticky overlay.
    const duration = urgent ? 6500 : Math.max(2800, Math.min(6500, 1500 + text.length * 180));
    bubbleTimer.current = setTimeout(() => setBubble(''), duration);
    pauseRoaming(urgent ? 120_000 : 45_000);
  }, [pauseRoaming]);

  const showActionBar = useCallback(() => {
    if (actionsTimer.current) clearTimeout(actionsTimer.current);
    setShowActions(true);
    actionsTimer.current = setTimeout(() => setShowActions(false), 5000);
  }, []);

  const savePosition = useCallback(() => {
    getCurrentWindow().outerPosition().then(position => {
      localStorage.setItem(positionKey, JSON.stringify({ x: position.x, y: position.y, v: 2 }));
    }).catch(() => {});
  }, []);

  // Drag only begins after a small movement threshold so ordinary clicks stay responsive.
  useEffect(() => {
    let startX: number | null = null;
    let startY: number | null = null;
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      isDragging.current = false;
      dragStarted.current = false;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (dragStarted.current || startX === null || startY === null) return;
      if (Math.abs(event.clientX - startX) > 5 || Math.abs(event.clientY - startY) > 5) {
        isDragging.current = true;
        dragStarted.current = true;
        pauseRoaming(5 * 60_000);
        getCurrentWindow().startDragging().catch(() => {});
      }
    };
    const onMouseUp = () => {
      if (isDragging.current) savePosition();
      dragStarted.current = false;
      startX = startY = null;
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [pauseRoaming, savePosition]);

  // Data sync and product events.
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<boolean> => {
      try {
        let raw: string | null = null;
        try { raw = await invoke('get_setting', { key: 'pet_data' }) as string | null; } catch { /* SQLite unavailable */ }
        if (!raw) raw = localStorage.getItem('csp_pet_data') || localStorage.getItem('csp_pet_data_tmp');
        const data = JSON.parse(raw || '{}');
        const pet = selectWindowPet(data);
        if (pet && !cancelled) { setActivePet(pet); return true; }
      } catch { /* keep window empty until a pet becomes available */ }
      return false;
    };
    // 独立 WebView2 环境下 localStorage 为空，SQLite 写入是异步的：
    // 初次读取可能拿不到刚设置的桌面伙伴，轮询重试直到拿到宠物（最长约 4.5s）。
    const loadWithRetry = async (attempt = 0) => {
      const ok = await load();
      if (!ok && attempt < 15 && !cancelled) {
        window.setTimeout(() => { if (!cancelled) loadWithRetry(attempt + 1); }, 300);
      }
    };
    loadWithRetry();
    applyStoredSettings();
    const listeners: (() => void)[] = [];
    listeners.push(safeListen('pet-data-sync', (event: any) => {
      const data = event.payload;
      const pet = selectWindowPet(data);
      setActivePet(pet);
    }));
    listeners.push(safeListen('pet-settings-changed', () => { applyStoredSettings(); }));
    listeners.push(safeListen('pet-anim', (event: any) => {
      const payload = event.payload as { anim: PetAnimState; duration?: number };
      window.__petTrigger__?.(payload.anim, payload.duration);
    }));
    if (desktopSlot === 1) listeners.push(safeListen('pet-bubble', (event: any) => {
      showBubble(event.payload.text, Boolean(event.payload.urgent));
    }));
    // The initial SQLite read normally has everything. Request one live snapshot
    // to cover the small race where the companion assignment is still saving.
    const syncTimer = window.setTimeout(() => emit('pet-request-sync', {}).catch(() => {}), 250);
    return () => {
      cancelled = true;
      listeners.forEach(unlisten => unlisten());
      window.clearTimeout(syncTimer);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (actionsTimer.current) clearTimeout(actionsTimer.current);
    };
  }, [showBubble]);

  useEffect(() => {
    let cancelled = false;
    const resizeWindow = async () => {
      const windowRef = getCurrentWindow();
      const previous = currentWindowSize.current;
      const [position, monitor] = await Promise.all([windowRef.outerPosition(), currentMonitor()]);
      if (cancelled) return;
      const scale = Number(monitor?.scaleFactor) || 1;
      let nextX = position.x + ((previous.width - windowWidth) * scale) / 2;
      let nextY = position.y + (previous.height - windowHeight) * scale;

      if (monitor) {
        const workPosition = (monitor.workArea.position as any).data || monitor.workArea.position;
        const workSize = (monitor.workArea.size as any).data || monitor.workArea.size;
        const minX = Number(workPosition.x);
        const minY = Number(workPosition.y);
        const maxX = minX + Number(workSize.width) - windowWidth * scale;
        const maxY = minY + Number(workSize.height) - windowHeight * scale;
        nextX = Math.max(minX, Math.min(maxX, nextX));
        nextY = Math.max(minY, Math.min(maxY, nextY));
      }

      await windowRef.setSize(new LogicalSize(windowWidth, windowHeight));
      await windowRef.setPosition(new PhysicalPosition(Math.round(nextX), Math.round(nextY)));
      currentWindowSize.current = { width: windowWidth, height: windowHeight };
    };
    resizeWindow().catch(() => {});
    return () => { cancelled = true; };
  }, [windowHeight, windowWidth]);

  useEffect(() => {
    getCurrentWindow().outerPosition().then(position => {
      const saved = localStorage.getItem(positionKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          let x = Number(parsed.x);
          let y = Number(parsed.y);
          if (parsed.v !== 2) {
            // 旧版窗口是正方形且与精灵同尺寸；新版固定为带气泡空间的窗口。
            // 换算到新的左上角，让精灵在屏幕上的位置保持不变。
            const prevW = (SIZE_MAP[petSize] || SIZE_MAP.medium).win;
            x = Math.round(x + (prevW - windowWidth) / 2);
            y = Math.round(y + (prevW - windowHeight));
            localStorage.setItem(positionKey, JSON.stringify({ x, y, v: 2 }));
          }
          if (Number.isFinite(x) && Number.isFinite(y)) {
            getCurrentWindow().setPosition(new PhysicalPosition(x, y)).catch(() => {});
            defaultPos.current = { x, y };
            return;
          }
        } catch { /* use app-selected location */ }
      }
      defaultPos.current = { x: position.x, y: position.y };
    }).catch(() => {});
    // 仅在挂载时恢复/迁移保存的位置；尺寸切换时由 resize effect 负责保持精灵视觉位置。
  }, []);

  // Low-disturbance roaming: remain on the current monitor, use its work area,
  // travel short distances, and synchronize position with a left/right run.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (!cancelled) timer = setTimeout(run, delay);
    };

    const moveOnce = async () => {
      const windowRef = getCurrentWindow();
      const [position, monitor] = await Promise.all([windowRef.outerPosition(), currentMonitor()]);
      if (!monitor || cancelled) return;
      const area = monitor.workArea;
      const areaPos = (area.position as any).data || area.position;
      const areaSize = (area.size as any).data || area.size;
      const scale = Number(monitor.scaleFactor) || 1;
      const windowW = windowWidth * scale;
      const windowH = windowHeight * scale;
      const margin = Math.round(18 * scale);
      const minX = Number(areaPos.x) + margin;
      const maxX = Number(areaPos.x) + Number(areaSize.width) - windowW - margin;
      // Keep the default roaming lane in the lower half so code and reading stay visible.
      const minY = Number(areaPos.y) + Math.max(margin, Number(areaSize.height) * 0.52);
      const maxY = Number(areaPos.y) + Number(areaSize.height) - windowH - margin;
      if (maxX <= minX || maxY <= minY) return;

      const maxStep = Math.min(340 * scale, (maxX - minX) * 0.35);
      const targetX = Math.max(minX, Math.min(maxX, position.x + (Math.random() * 2 - 1) * maxStep));
      const targetY = Math.max(minY, Math.min(maxY, position.y + (Math.random() * 2 - 1) * maxStep * 0.45));
      const dx = targetX - position.x;
      const dy = targetY - position.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 24 * scale) return;

      const duration = Math.max(900, Math.min(4200, distance / (78 * scale) * 1000));
      window.__petTrigger__?.(dx < 0 ? 'walk-left' : 'walk-right', duration + 250);
      const startedAt = performance.now();
      while (!cancelled && Date.now() >= roamingPausedUntil.current) {
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        // A short ease avoids an abrupt start/stop without making the walk look like teleporting.
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        await windowRef.setPosition(new PhysicalPosition(
          Math.round(position.x + dx * eased),
          Math.round(position.y + dy * eased),
        ));
        if (progress >= 1) break;
        // 100ms 一步：透明置顶窗口移动频率过高会在 Windows/macOS 上闪，
        // 降频后观感几乎不变。
        await sleep(100);
      }
      window.__petTrigger__?.('idle');
    };

    const run = async () => {
      if (!roamingEnabled || Date.now() < roamingPausedUntil.current) {
        schedule(Math.max(30_000, roamingPausedUntil.current - Date.now()));
        return;
      }
      try { await moveOnce(); } catch { /* a monitor can disappear while moving */ }
      schedule(45_000 + Math.random() * 45_000);
    };

    schedule(30_000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [roamingEnabled, windowHeight, windowWidth]);

  // Ambient messages are intentionally sparse. Context-rich result messages
  // continue to arrive from quiz/course screens through the pet-bubble event.
  useEffect(() => {
    if (!activePet || desktopSlot !== 1) return;
    const timer = setInterval(() => {
      const next = dialogue.current.nextAmbient({
        hunger: activePet.hunger,
        mood: activePet.mood,
        hour: new Date().getHours(),
      });
      if (next) showBubble(next.text, next.priority === 'urgent');
    }, 60_000);
    return () => clearInterval(timer);
  }, [activePet, showBubble]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (isDragging.current) return;
    pauseRoaming(3 * 60_000);
    const now = Date.now();
    if (now - lastClickTime.current < 400) {
      lastClickTime.current = 0;
      if (defaultPos.current) {
        getCurrentWindow().setPosition(new PhysicalPosition(defaultPos.current.x, defaultPos.current.y)).catch(() => {});
        showBubble('我回到原来的位置啦。');
      }
      return;
    }
    lastClickTime.current = now;
    window.__petWake__?.();
    window.__petUpdate__?.();
    window.__petTrigger__?.('interact');
    const nextCount = clickCount + 1;
    setClickCount(nextCount);
    // 点击反馈对所有桌面位置开放：第二/第三伙伴被点击时也会冒泡回应，
    // 否则孩子得不到反馈会连续点击，误触发双击回位（窗口跳动像闪烁）。
    if (activePet) {
      const line = dialogue.current.nextClick({
        hunger: activePet.hunger, mood: activePet.mood, hour: new Date().getHours(), clickCount: nextCount,
      });
      showBubble(line.text, line.priority === 'urgent');
    }
    if (desktopSlot === 1) showActionBar();
  }, [activePet, clickCount, pauseRoaming, showActionBar, showBubble]);

  if (!activePet) return null;
  const barH = Math.round(22 * uiScale);

  return (
    <div style={{ width: windowWidth, height: windowHeight, position: 'relative' }}>
      {bubble && (
        <div style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
          width: windowWidth - 16, maxWidth: 244,
          background: 'rgba(255,255,255,.98)', borderRadius: 12, padding: '9px 12px',
          fontSize: Math.max(12, Math.round(13 * uiScale)), lineHeight: 1.5, fontWeight: 600,
          boxShadow: '0 5px 18px rgba(15,23,42,.2)', zIndex: 20,
          whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'left', animation: 'bubbleIn .2s ease',
          border: '1.5px solid #f6c453', pointerEvents: 'none', color: '#1e293b',
        }}>
          {bubble}
          <div style={{
            position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderTop: '8px solid #fff',
            borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
          }} />
        </div>
      )}

      <div
        className="pet-interact"
        style={{
          width: canvasSz,
          height: canvasSz,
          position: 'absolute',
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
        }}
        onClick={handleClick}
      >
        <PetSprite key={activePet.modelPath || 'empty'} renderType={activePet.renderType} modelPath={activePet.modelPath} canvasSize={canvasSz} onReady={handleSpriteReady} />

        {desktopSlot === 1 && showActions && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: barH, zIndex: 10,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.45))', display: 'flex', alignItems: 'flex-end',
            justifyContent: 'center', gap: Math.round(6 * uiScale), paddingBottom: Math.round(3 * uiScale), borderRadius: '0 0 12px 12px',
          }}>
            {[
              { icon: '📂', label: '窗口', action: () => emit('pet-action', { action: 'open-window' }).catch(() => {}) },
              { icon: '🛒', label: '商城', action: () => emit('pet-action', { action: 'navigate', target: '/pet?tab=shop' }).catch(() => {}) },
              { icon: '👁️', label: '隐藏', action: () => invoke('toggle_pet_window').then(result => {
                emit('pet-visibility-toggled', { visible: result === 'shown' }).catch(() => {});
              }).catch(() => {}) },
            ].map(button => (
              <button key={button.label} onClick={event => { event.stopPropagation(); button.action(); }} style={{
                background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: Math.round(6 * uiScale),
                padding: `${Math.round(2 * uiScale)}px ${Math.round(5 * uiScale)}px`, fontSize: Math.max(10, Math.round(11 * uiScale)),
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: Math.round(2 * uiScale), color: '#334155', fontWeight: 600,
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }}>{button.icon}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
