interface CaptureTarget {
  setPointerCapture(id: number): void;
  hasPointerCapture(id: number): boolean;
  releasePointerCapture(id: number): void;
}

interface Drag {
  slot: number; pointerId: number; target: CaptureTarget;
  startCX: number; startCY: number; startX: number; startY: number; moved: boolean;
}

/** Captures one pointer; never moves the full-screen transparent OS window. */
export function bindPetDragging(
  doc: Document,
  win: Window,
  onMove: (slot: number, x: number, y: number) => void,
  onEnd: (slot: number, moved: boolean) => void,
) {
  let active: Drag | null = null;
  const finish = () => {
    const drag = active;
    if (!drag) return;
    active = null; // release can synchronously dispatch lostpointercapture
    try {
      if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    } catch { /* window/element may already be gone */ }
    onEnd(drag.slot, drag.moved);
  };
  const update = (event: PointerEvent) => {
    const drag = active;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startCX;
    const dy = event.clientY - drag.startCY;
    if (!drag.moved && Math.abs(dx) <= 5 && Math.abs(dy) <= 5) return;
    drag.moved = true;
    onMove(drag.slot, drag.startX + dx, drag.startY + dy);
  };
  const move = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    if ((event.buttons & 1) === 0) { finish(); return; }
    update(event);
  };
  const up = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId || event.button !== 0) return;
    update(event); // persist the release point, not the preceding rendered frame
    finish();
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId === active?.pointerId) finish();
  };
  const hidden = () => { if (doc.hidden) finish(); };
  doc.addEventListener('pointermove', move, true);
  doc.addEventListener('pointerup', up, true);
  doc.addEventListener('pointercancel', cancel, true);
  doc.addEventListener('lostpointercapture', cancel, true);
  doc.addEventListener('visibilitychange', hidden);
  win.addEventListener('blur', finish);
  return {
    get active() { return active !== null; },
    start(event: PointerEvent, slot: number, x: number, y: number, target: CaptureTarget) {
      if (event.button !== 0 || active) return false;
      active = { slot, pointerId: event.pointerId, target, startCX: event.clientX, startCY: event.clientY, startX: x, startY: y, moved: false };
      try { target.setPointerCapture(event.pointerId); } catch { /* document listeners remain a fallback */ }
      return true;
    },
    dispose() {
      finish();
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', cancel, true);
      doc.removeEventListener('lostpointercapture', cancel, true);
      doc.removeEventListener('visibilitychange', hidden);
      win.removeEventListener('blur', finish);
    },
  };
}
