import { useEffect, useState, useCallback, useRef } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, PhysicalPosition, LogicalPosition, LogicalSize, currentMonitor, availableMonitors, cursorPosition } from '@tauri-apps/api/window';
import PetSprite, { type PetSpriteApi } from './PetSprite';
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

const getPetSize = () => {
  try { return localStorage.getItem('csp_pet_size') || 'medium'; } catch { return 'medium'; }
};
const getRoamingEnabled = () => {
  try { return localStorage.getItem('csp_pet_roaming') === 'true'; } catch { return false; }
};

// ── 单窗多宠架构（v1.7.31）──
// 所有桌面智子（主伙伴 + 桌面伙伴 2/3）都在同一个全屏透明置顶窗口里渲染。
// 历史上「每个伙伴一个独立 WebView2 窗口」的方案在部分 Windows 机器上会整窗
// 卡死（Tauri #8196），独立数据目录 workaround 又引入 localStorage 不通、
// 跨窗数据同步、孤儿进程等一连串故障。单窗后第二智子与第一只走完全相同的
// 代码路径，以上整类问题不复存在。

interface PetOnStage {
  slot: 1 | 2 | 3;
  pet: OwnedPet;
}

// 舞台坐标：逻辑像素，相对窗口左上角（窗口覆盖整个工作区）
interface StagePos { x: number; y: number; animMs: number }

interface StageInfo {
  physX: number; physY: number; scale: number; w: number; h: number;
}

const positionKeyFor = (slot: number) => (slot === 1 ? 'csp_pet_pos' : `csp_pet_pos_${slot}`);
const MONITOR_PREF_KEY = 'csp_pet_monitor';

interface MonitorPref { index: number; name: string | null }

function readMonitorPref(): MonitorPref | null {
  try {
    const raw = localStorage.getItem(MONITOR_PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.index === 'number') return { index: parsed.index, name: parsed.name ?? null };
  } catch { /* ignore */ }
  return null;
}

function collectPets(data: any): PetOnStage[] {
  const owned: OwnedPet[] = Array.isArray(data?.ownedPets) ? data.ownedPets : [];
  const list: PetOnStage[] = [];
  const active = owned.find(p => p.petId === data?.activePetId);
  if (active) list.push({ slot: 1, pet: active });
  ([2, 3] as const).forEach(slot => {
    const id = data?.desktopCompanionIds?.[slot - 2];
    const pet = id ? owned.find(p => p.petId === id) : undefined;
    if (pet) list.push({ slot, pet });
  });
  return list;
}

export default function PetWindow() {
  const [pets, setPets] = useState<PetOnStage[]>([]);
  const [positions, setPositions] = useState<Record<number, StagePos>>({});
  const [bubbles, setBubbles] = useState<Record<number, string>>({});
  const [showActions, setShowActions] = useState(false);
  const [petSize, setPetSize] = useState(getPetSize);
  const [roamingEnabled, setRoamingEnabled] = useState(getRoamingEnabled);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  // 多于一块屏时，智子操作条和设置页提供「换屏」入口
  const [monitorCount, setMonitorCount] = useState(1);

  const size = SIZE_MAP[petSize] || SIZE_MAP.medium;
  const canvasSz = size.canvas;
  const uiScale = canvasSz / 200;

  const stageInfoRef = useRef<StageInfo | null>(null);
  // 主屏（虚拟桌面原点 0,0 那块）的 scale：macOS 上 tao 的 cursorPosition
  // 统一按「逻辑点 × 主屏 scale」返回，命中换算要用它
  const mainScaleRef = useRef(1);
  const petRefs = useRef(new Map<number, HTMLDivElement>());
  const apiRefs = useRef(new Map<number, PetSpriteApi>());
  const petsRef = useRef<PetOnStage[]>([]);
  const positionsRef = useRef<Record<number, StagePos>>({});
  const bubbleTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const actionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roamPausedUntil = useRef<Record<number, number>>({});
  const clampPosRef = useRef<(x: number, y: number) => { x: number; y: number }>((x, y) => ({ x, y }));
  const dialogue = useRef(new PetDialogueDirector());
  const autoShownRef = useRef(false);
  const dragRef = useRef<{ slot: number; startCX: number; startCY: number; startX: number; startY: number; moved: boolean } | null>(null);
  const lastDragEndAt = useRef(0);
  const lastClickTime = useRef<Record<number, number>>({});
  const clickCounts = useRef<Record<number, number>>({});

  petsRef.current = pets;
  positionsRef.current = positions;

  // ── 窗口初始化：覆盖某块显示器的工作区；整窗默认点击穿透（失败安全），
  // 只有光标悬停在精灵本体上时轮询才放开交互。
  // 多屏策略（方案 D）：窗口永远完整待在单独一块屏内（CrossOver 式整体搬屏），
  // 绝不横跨两块屏——WebView2 横跨混 DPI 显示器有多个已知 bug（内容错位/缩小消失），
  // 这样从原理上就不会触发，Windows 混 DPI 环境与单屏走完全相同的代码路径。 ──
  const applyMonitor = useCallback(async (monitor: import('@tauri-apps/api/window').Monitor) => {
    const scale = Number(monitor.scaleFactor) || 1;
    const areaPos = (monitor.workArea.position as any).data || monitor.workArea.position;
    const areaSize = (monitor.workArea.size as any).data || monitor.workArea.size;
    const physX = Number(areaPos.x);
    const physY = Number(areaPos.y);
    const w = Math.round(Number(areaSize.width) / scale);
    const h = Math.round(Number(areaSize.height) / scale);
    const win = getCurrentWindow();
    // 两阶段落定：macOS 的 tao 用窗口【当前】backingScale 换算坐标
    // （set_outer_position 内部 position.to_logical(currentScale)），
    // 跨屏到不同 scale 的显示器时直接设物理坐标会算错（实测偏移正好一半）。
    // ① 先按逻辑坐标近似落位（LogicalPosition 不做缩放换算，一定落对）；
    // ② 等 backingScale 切换完成；③ 再用物理坐标精确校正（此刻窗口 scale 已等于
    // 目标屏 scale，换算正确）。Windows 上第 ③ 步是无害的幂等确认。
    await win.setSize(new LogicalSize(w, h));
    await win.setPosition(new LogicalPosition(physX / scale, physY / scale));
    await new Promise(resolve => setTimeout(resolve, 350));
    const settled = Number(await win.scaleFactor().catch(() => scale)) || scale;
    const finalW = Math.round(Number(areaSize.width) / settled);
    const finalH = Math.round(Number(areaSize.height) / settled);
    if (finalW !== w || finalH !== h) await win.setSize(new LogicalSize(finalW, finalH));
    await win.setPosition(new PhysicalPosition(physX, physY));
    stageInfoRef.current = { physX, physY, scale: settled, w: finalW, h: finalH };
    setStage({ w: finalW, h: finalH });
  }, []);

  const hopToNextMonitor = useCallback(async () => {
    try {
      const monitors = await availableMonitors();
      if (monitors.length < 2) return;
      const info = stageInfoRef.current;
      let idx = monitors.findIndex(m => {
        const p = (m.workArea.position as any).data || m.workArea.position;
        return info && Number(p.x) === info.physX && Number(p.y) === info.physY;
      });
      if (idx < 0) idx = 0;
      const nextIdx = (idx + 1) % monitors.length;
      await applyMonitor(monitors[nextIdx]);
      try {
        localStorage.setItem(MONITOR_PREF_KEY, JSON.stringify({ index: nextIdx, name: monitors[nextIdx].name ?? null } satisfies MonitorPref));
      } catch { /* 偏好存不上不影响本次搬屏 */ }
      // 所有智子收进新舞台边界（保留相对位置，平滑过渡过去）
      setPositions(prev => {
        const next: Record<number, StagePos> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[Number(k)] = { ...clampPosRef.current(v.x, v.y), animMs: 400 };
        }
        return next;
      });
    } catch { /* 显示器枚举失败则保持当前屏 */ }
  }, [applyMonitor]);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setIgnoreCursorEvents(true).catch(() => {});
    let disposed = false;
    (async () => {
      try {
        const monitors = await availableMonitors();
        if (disposed) return;
        setMonitorCount(monitors.length);
        // 主屏 = 虚拟桌面原点 (0,0) 那块；cached 给命中轮询做坐标归一
        const primary = monitors.find(m => {
          const p = (m.position as any)?.data || m.position;
          return p && Number(p.x) === 0 && Number(p.y) === 0;
        });
        if (primary) mainScaleRef.current = Number(primary.scaleFactor) || 1;
        // 启动选屏：上次记住的屏（按名字优先、序号兜底）→ 当前屏 → 第一块
        const pref = readMonitorPref();
        const current = await currentMonitor();
        const target = (pref && monitors.find(m => m.name && m.name === pref.name))
          || (pref && monitors[pref.index])
          || current
          || monitors[0];
        if (!target || disposed) return;
        await applyMonitor(target);
      } catch {
        // 显示器枚举失败时也不能让智子整窗消失：退回当前窗口尺寸
        try {
          const win2 = getCurrentWindow();
          const [pos, scale] = await Promise.all([win2.outerPosition(), win2.scaleFactor()]);
          stageInfoRef.current = { physX: pos.x, physY: pos.y, scale: Number(scale) || 1, w: window.innerWidth, h: window.innerHeight };
        } catch {
          stageInfoRef.current = { physX: 0, physY: 0, scale: 1, w: window.innerWidth, h: window.innerHeight };
        }
        if (!disposed) setStage({ w: window.innerWidth, h: window.innerHeight });
      }
    })();
    return () => { disposed = true; };
  }, [applyMonitor]);

  // 设置页「换到下一块屏幕」按钮 → 搬屏
  useEffect(() => safeListen('pet-hop-monitor', () => { hopToNextMonitor(); }), [hopToNextMonitor]);

  // ── 指针级点击穿透：只有光标悬停在某个精灵上，窗口才接收鼠标事件 ──
  // 穿透状态由光标位置轮询驱动，即使当前正在穿透，光标移入精灵也立即恢复
  // 交互——不存在“压在主窗口上永远点不到”的死锁。
  //
  // 坐标系注意（Mac 双屏实测标定）：tao 的 cursorPosition 在 macOS 上对所有
  // 显示器统一返回「逻辑点 × 主屏 scale」，而窗口 outerPosition / workArea 是
  // 「逻辑 × 各自屏 scale」——两个约定在异 scale 多屏下不一致。所以：
  //   macOS  → 统一换算到逻辑点比较（光标 ÷ 主屏 scale，窗口原点 ÷ 自身 scale）；
  //   Windows → 混 DPI 没有全局逻辑空间，物理像素是唯一一致约定，维持物理比较。
  useEffect(() => {
    const win = getCurrentWindow();
    const isMac = /Mac/i.test(navigator.userAgent);
    let ignoring = true;
    let disposed = false;
    const apply = async () => {
      const info = stageInfoRef.current;
      if (!info) return;
      // 顺带刷新缩放：运行途中系统 DPI 变更（插拔外接显示器等）时命中数学仍保持正确
      const [cursor, scale] = await Promise.all([cursorPosition(), win.scaleFactor()]);
      info.scale = Number(scale) || info.scale;
      if (disposed) return;
      const s = info.scale;
      const mainScale = mainScaleRef.current || s;
      const winOx = isMac ? info.physX / s : info.physX;
      const winOy = isMac ? info.physY / s : info.physY;
      const cx = isMac ? cursor.x / mainScale : cursor.x;
      const cy = isMac ? cursor.y / mainScale : cursor.y;
      const k = isMac ? 1 : s;
      const over = petsRef.current.some(({ slot }) => {
        const el = petRefs.current.get(slot);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return cx >= winOx + rect.left * k
          && cx <= winOx + rect.right * k
          && cy >= winOy + rect.top * k
          && cy <= winOy + rect.bottom * k;
      });
      // 拖拽途中光标可能短暂移出精灵（窗口跟随有延迟），此时不能切穿透
      const shouldIgnore = !over && !dragRef.current;
      if (shouldIgnore !== ignoring) {
        ignoring = shouldIgnore;
        await win.setIgnoreCursorEvents(shouldIgnore);
      }
    };
    const timer = window.setInterval(() => { apply().catch(() => {}); }, 150);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  // ── 显示窗口：第一只精灵就绪即显示；2.5s 兜底防闪白等待卡死 ──
  const showStage = useCallback(() => {
    if (autoShownRef.current) return;
    autoShownRef.current = true;
    getCurrentWindow().show().catch(() => {});
  }, []);
  useEffect(() => {
    const timer = setTimeout(showStage, 2500);
    return () => clearTimeout(timer);
  }, [showStage]);

  // ── 数据加载：与主窗口同一 WebView2 环境，localStorage 直接共享 ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let raw = localStorage.getItem('csp_pet_data') || localStorage.getItem('csp_pet_data_tmp');
        if (!raw) raw = await sqliteGet('pet_data');
        if (cancelled) return;
        const list = collectPets(JSON.parse(raw || '{}'));
        if (list.length) setPets(list);
      } catch { /* 等 pet-data-sync 事件 */ }
    };
    load();
    const listeners: (() => void)[] = [];
    listeners.push(safeListen('pet-data-sync', (event: any) => {
      setPets(collectPets(event.payload));
    }));
    listeners.push(safeListen('pet-settings-changed', () => {
      setPetSize(getPetSize());
      setRoamingEnabled(getRoamingEnabled());
    }));
    listeners.push(safeListen('pet-anim', (event: any) => {
      const payload = event.payload as { anim: PetAnimState; duration?: number };
      apiRefs.current.get(1)?.trigger(payload.anim, payload.duration);
    }));
    listeners.push(safeListen('pet-bubble', (event: any) => {
      showBubbleRef.current?.(1, event.payload.text, Boolean(event.payload.urgent));
    }));
    const syncTimer = window.setTimeout(() => emit('pet-request-sync', {}).catch(() => {}), 250);
    return () => {
      cancelled = true;
      listeners.forEach(unlisten => unlisten());
      window.clearTimeout(syncTimer);
    };
  }, []);

  // ── 位置：初始化 / 迁移 / 拖拽持久化 ──
  const defaultPosFor = useCallback((slot: number): StagePos => {
    const info = stageInfoRef.current;
    const w = info?.w ?? 1280;
    const h = info?.h ?? 720;
    return {
      x: Math.max(18, w - canvasSz - 40 - (slot - 1) * (canvasSz + 60)),
      y: Math.max(18, h - canvasSz - 60),
      animMs: 0,
    };
  }, [canvasSz]);

  const clampPos = useCallback((x: number, y: number): { x: number; y: number } => {
    const info = stageInfoRef.current;
    if (!info) return { x, y };
    return {
      x: Math.max(0, Math.min(info.w - canvasSz, x)),
      y: Math.max(0, Math.min(info.h - canvasSz, y)),
    };
  }, [canvasSz]);
  clampPosRef.current = clampPos;

  const loadSlotPosition = useCallback((slot: number): StagePos | null => {
    try {
      const raw = localStorage.getItem(positionKeyFor(slot));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.v === 3 && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        const c = clampPos(Number(parsed.x), Number(parsed.y));
        return { ...c, animMs: 0 };
      }
      // v2 迁移：旧版存的是小窗口左上角的屏幕物理坐标，精灵在窗口底部居中
      if (parsed.v === 2 && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        const info = stageInfoRef.current;
        if (!info) return null;
        const oldWinW = Math.max(260, size.win + 96);
        const oldWinH = size.win + 76;
        const screenX = Number(parsed.x) + ((oldWinW - canvasSz) / 2) * info.scale;
        const screenY = Number(parsed.y) + (oldWinH - canvasSz) * info.scale;
        const c = clampPos((screenX - info.physX) / info.scale, (screenY - info.physY) / info.scale);
        return { ...c, animMs: 0 };
      }
    } catch { /* 用默认位置 */ }
    return null;
  }, [canvasSz, clampPos, size.win]);

  const slotsKey = pets.map(p => p.slot).join(',');
  useEffect(() => {
    if (!stage) return;
    setPositions(prev => {
      const next = { ...prev };
      pets.forEach(({ slot }) => {
        if (!next[slot]) next[slot] = loadSlotPosition(slot) || defaultPosFor(slot);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsKey, stage, canvasSz]);

  const savePosition = useCallback((slot: number) => {
    const pos = positionsRef.current[slot];
    if (!pos) return;
    try { localStorage.setItem(positionKeyFor(slot), JSON.stringify({ x: pos.x, y: pos.y, v: 3 })); } catch {}
  }, []);

  // ── 拖拽：DOM 位移（窗口本身不动），超 5px 阈值才算拖拽，保留单击 ──
  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startCX;
      const dy = event.clientY - drag.startCY;
      if (!drag.moved && Math.abs(dx) <= 5 && Math.abs(dy) <= 5) return;
      drag.moved = true;
      roamPausedUntil.current[drag.slot] = Date.now() + 5 * 60_000;
      const c = clampPos(drag.startX + dx, drag.startY + dy);
      setPositions(prev => ({ ...prev, [drag.slot]: { ...c, animMs: 0 } }));
    };
    const onMouseUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.moved) {
        lastDragEndAt.current = Date.now();
        savePosition(drag.slot);
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [clampPos, savePosition]);

  const handleMouseDown = useCallback((slot: number) => (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const pos = positionsRef.current[slot];
    if (!pos) return;
    dragRef.current = { slot, startCX: event.clientX, startCY: event.clientY, startX: pos.x, startY: pos.y, moved: false };
  }, []);

  // ── 气泡 / 操作条 ──
  const pauseRoaming = useCallback((slot: number, ms: number) => {
    roamPausedUntil.current[slot] = Math.max(roamPausedUntil.current[slot] || 0, Date.now() + ms);
    apiRefs.current.get(slot)?.trigger('idle');
  }, []);

  const showBubble = useCallback((slot: number, text: string, urgent = false) => {
    if (!text) return;
    const timers = bubbleTimers.current;
    const old = timers.get(slot);
    if (old) clearTimeout(old);
    setBubbles(prev => ({ ...prev, [slot]: text }));
    // Reading time is proportional to text length, bounded to avoid a sticky overlay.
    const duration = urgent ? 6500 : Math.max(2800, Math.min(6500, 1500 + text.length * 180));
    timers.set(slot, setTimeout(() => setBubbles(prev => ({ ...prev, [slot]: '' })), duration));
    pauseRoaming(slot, urgent ? 120_000 : 45_000);
  }, [pauseRoaming]);
  const showBubbleRef = useRef(showBubble);
  showBubbleRef.current = showBubble;

  const showActionBar = useCallback(() => {
    if (actionsTimer.current) clearTimeout(actionsTimer.current);
    setShowActions(true);
    actionsTimer.current = setTimeout(() => setShowActions(false), 5000);
  }, []);

  // ── 点击 / 双击回位 ──
  const handleClick = useCallback((slot: number, pet: OwnedPet) => (event: React.MouseEvent) => {
    event.stopPropagation();
    // 拖拽结束的 mouseup 之后会紧跟一个 click 事件，要吞掉，否则拖完会误触发冒泡/回位
    if (Date.now() - lastDragEndAt.current < 100) return;
    pauseRoaming(slot, 3 * 60_000);
    const now = Date.now();
    if (now - (lastClickTime.current[slot] || 0) < 400) {
      lastClickTime.current[slot] = 0;
      const home = defaultPosFor(slot);
      setPositions(prev => ({ ...prev, [slot]: { ...home, animMs: 500 } }));
      window.setTimeout(() => savePosition(slot), 520);
      showBubble(slot, '我回到原来的位置啦。');
      return;
    }
    lastClickTime.current[slot] = now;
    const api = apiRefs.current.get(slot);
    api?.wake();
    api?.update();
    api?.trigger('interact');
    const nextCount = (clickCounts.current[slot] || 0) + 1;
    clickCounts.current[slot] = nextCount;
    // 点击反馈对所有桌面位置开放：第二/第三伙伴被点击时也会冒泡回应，
    // 否则孩子得不到反馈会连续点击，误触发双击回位（窗口跳动像闪烁）。
    const line = dialogue.current.nextClick({
      hunger: pet.hunger, mood: pet.mood, hour: new Date().getHours(), clickCount: nextCount,
    });
    showBubble(slot, line.text, line.priority === 'urgent');
    if (slot === 1) showActionBar();
  }, [defaultPosFor, pauseRoaming, savePosition, showActionBar, showBubble]);

  // ── 漫游：窗口不动，只移动各只智子的 DOM 位置（transform 过渡，合成器渲染） ──
  useEffect(() => {
    if (!roamingEnabled || !stage) return;
    let disposed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)); };

    const roamOnce = (slot: number) => {
      if (disposed) return;
      const paused = roamPausedUntil.current[slot] || 0;
      if (Date.now() < paused) { later(() => roamOnce(slot), Math.max(30_000, paused - Date.now())); return; }
      const info = stageInfoRef.current;
      const pos = positionsRef.current[slot];
      if (!info || !pos) { later(() => roamOnce(slot), 45_000); return; }
      const margin = 18;
      const minX = margin;
      const maxX = info.w - canvasSz - margin;
      // Keep the roaming lane in the lower half so code and reading stay visible.
      const minY = Math.max(margin, info.h * 0.52);
      const maxY = info.h - canvasSz - margin;
      if (maxX <= minX || maxY <= minY) return;
      const maxStep = Math.min(340, (maxX - minX) * 0.35);
      const targetX = Math.max(minX, Math.min(maxX, pos.x + (Math.random() * 2 - 1) * maxStep));
      const targetY = Math.max(minY, Math.min(maxY, pos.y + (Math.random() * 2 - 1) * maxStep * 0.45));
      const dx = targetX - pos.x;
      const dy = targetY - pos.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 24) { later(() => roamOnce(slot), 45_000 + Math.random() * 45_000); return; }
      const duration = Math.max(900, Math.min(4200, distance / 78 * 1000));
      const api = apiRefs.current.get(slot);
      api?.trigger(dx < 0 ? 'walk-left' : 'walk-right', duration + 250);
      setPositions(prev => ({ ...prev, [slot]: { x: targetX, y: targetY, animMs: Math.round(duration) } }));
      later(() => api?.trigger('idle'), duration + 300);
      later(() => roamOnce(slot), 45_000 + Math.random() * 45_000);
    };

    petsRef.current.forEach(({ slot }) => later(() => roamOnce(slot), 30_000 + Math.random() * 30_000));
    return () => { disposed = true; timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roamingEnabled, stage, slotsKey, canvasSz]);

  // Ambient messages are intentionally sparse. Context-rich result messages
  // continue to arrive from quiz/course screens through the pet-bubble event.
  useEffect(() => {
    const first = pets.find(p => p.slot === 1)?.pet;
    if (!first) return;
    const timer = setInterval(() => {
      const next = dialogue.current.nextAmbient({
        hunger: first.hunger,
        mood: first.mood,
        hour: new Date().getHours(),
      });
      if (next) showBubble(1, next.text, next.priority === 'urgent');
    }, 60_000);
    return () => clearInterval(timer);
  }, [pets, showBubble]);

  if (!stage) return null;
  const barH = Math.round(22 * uiScale);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {pets.map(({ slot, pet }) => {
        const pos = positions[slot] || defaultPosFor(slot);
        const bubble = bubbles[slot];
        return (
          <div
            key={`${slot}-${pet.petId}`}
            ref={el => { if (el) petRefs.current.set(slot, el); else petRefs.current.delete(slot); }}
            className="pet-interact"
            onMouseDown={handleMouseDown(slot)}
            onClick={handleClick(slot, pet)}
            style={{
              position: 'absolute', left: 0, top: 0,
              width: canvasSz, height: canvasSz,
              transform: `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`,
              transition: pos.animMs ? `transform ${pos.animMs}ms cubic-bezier(0.33, 0, 0.67, 1)` : 'none',
              willChange: pos.animMs ? 'transform' : undefined,
            }}
          >
            {bubble && (
              <div style={{
                position: 'absolute', bottom: canvasSz + 10, left: '50%', transform: 'translateX(-50%)',
                width: Math.max(200, canvasSz + 60), maxWidth: 244,
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

            <PetSprite
              key={pet.modelPath || 'empty'}
              renderType={pet.renderType}
              modelPath={pet.modelPath}
              canvasSize={canvasSz}
              onReady={showStage}
              exposeGlobals={slot === 1}
              apiRef={api => { if (api) apiRefs.current.set(slot, api); else apiRefs.current.delete(slot); }}
            />

            {slot === 1 && showActions && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: barH, zIndex: 10,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.45))', display: 'flex', alignItems: 'flex-end',
                justifyContent: 'center', gap: Math.round(6 * uiScale), paddingBottom: Math.round(3 * uiScale), borderRadius: '0 0 12px 12px',
              }}>
                {[
                  { icon: '📂', label: '窗口', action: () => emit('pet-action', { action: 'open-window' }).catch(() => {}) },
                  { icon: '🛒', label: '商城', action: () => emit('pet-action', { action: 'navigate', target: '/pet?tab=shop' }).catch(() => {}) },
                  // 多于一块屏时才出现：智子整体搬到下一块屏
                  ...(monitorCount > 1 ? [{ icon: '🖥️', label: '换屏', action: () => { hopToNextMonitor(); } }] : []),
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
        );
      })}
    </div>
  );
}
