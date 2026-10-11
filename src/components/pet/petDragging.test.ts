import { describe, expect, it, vi } from 'vitest';
import { bindPetDragging } from './petDragging';

function setup(captureFails = false) {
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = new EventTarget();
  const move = vi.fn();
  const end = vi.fn();
  const captured = new Set<number>();
  const target = {
    setPointerCapture: vi.fn((id: number) => {
      if (captureFails) throw new Error('capture unsupported');
      captured.add(id);
    }),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: vi.fn((id: number) => {
      captured.delete(id);
      send('lostpointercapture', { pointerId: id });
    }),
  };
  const controller = bindPetDragging(doc as unknown as Document, win as unknown as Window, move, end);
  function pointer(data: Partial<PointerEvent> = {}) {
    return { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 200, ...data } as PointerEvent;
  }
  function send(type: string, data: Partial<PointerEvent> = {}) {
    doc.dispatchEvent(Object.assign(new Event(type), pointer(data)));
  }
  const start = (data: Partial<PointerEvent> = {}, slot = 1) => controller.start(pointer(data), slot, 80, 180, target);
  return { doc, win, move, end, target, controller, start, send };
}

describe('desktop pet pointer dragging', () => {
  it('captures the pointer and continues beyond the sprite; persists exact release point', () => {
    const t = setup();
    expect(t.start()).toBe(true);
    expect(t.target.setPointerCapture).toHaveBeenCalledWith(1);
    t.send('pointermove', { clientX: 1000, clientY: 700 });
    expect(t.move).toHaveBeenLastCalledWith(1, 980, 680);
    t.send('pointerup', { clientX: 1100, clientY: 750, buttons: 0 });
    expect(t.move).toHaveBeenLastCalledWith(1, 1080, 730);
    expect(t.end).toHaveBeenCalledExactlyOnceWith(1, true);
    expect(t.target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(t.controller.active).toBe(false);
    t.controller.dispose();
  });
  it('keeps short clicks below the threshold eligible for click/double-click', () => {
    const t = setup();
    t.start();
    t.send('pointermove', { clientX: 104, clientY: 205 });
    t.send('pointerup', { clientX: 104, clientY: 205, buttons: 0 });
    expect(t.move).not.toHaveBeenCalled();
    expect(t.end).toHaveBeenCalledExactlyOnceWith(1, false);
    t.controller.dispose();
  });
  it('ignores right-button starts, other pointers and simultaneous second-pet drags', () => {
    const t = setup();
    expect(t.start({ button: 2 })).toBe(false);
    t.start({}, 2);
    expect(t.start({ pointerId: 2 }, 3)).toBe(false);
    t.send('pointermove', { pointerId: 2, clientX: 500 });
    t.send('pointerup', { pointerId: 2 });
    t.send('pointerup', { button: 2 });
    expect(t.move).not.toHaveBeenCalled();
    expect(t.controller.active).toBe(true);
    t.send('pointermove', { clientX: 150 });
    expect(t.move).toHaveBeenLastCalledWith(2, 130, 180);
    t.controller.dispose();
  });
  it.each(['pointercancel', 'lostpointercapture'])('cleans up %s and allows the next drag', type => {
    const t = setup();
    t.start();
    t.send('pointermove', { clientX: 150 });
    t.send(type);
    expect(t.end).toHaveBeenCalledExactlyOnceWith(1, true);
    expect(t.controller.active).toBe(false);
    expect(t.start({}, 3)).toBe(true);
    t.controller.dispose();
  });
  it('recovers when release was missed and a subsequent move reports no held button', () => {
    const t = setup();
    t.start();
    t.send('pointermove', { clientX: 150 });
    t.send('pointermove', { clientX: 900, buttons: 0 });
    expect(t.move).toHaveBeenCalledTimes(1);
    expect(t.end).toHaveBeenCalledExactlyOnceWith(1, true);
    expect(t.controller.active).toBe(false);
    t.controller.dispose();
  });
  it('clears held interaction on window blur or document hiding', () => {
    const t = setup();
    t.start();
    t.win.dispatchEvent(new Event('blur'));
    expect(t.controller.active).toBe(false);
    t.start();
    t.doc.hidden = true;
    t.doc.dispatchEvent(new Event('visibilitychange'));
    expect(t.controller.active).toBe(false);
    expect(t.end).toHaveBeenCalledTimes(2);
    t.controller.dispose();
  });
  it('falls back to document events if native pointer capture fails', () => {
    const t = setup(true);
    expect(t.start()).toBe(true);
    t.send('pointermove', { clientX: 150 });
    t.send('pointerup', { clientX: 160, buttons: 0 });
    expect(t.move).toHaveBeenLastCalledWith(1, 140, 180);
    expect(t.controller.active).toBe(false);
    t.controller.dispose();
  });
  it('removes listeners and releases capture on disposal', () => {
    const t = setup();
    t.start();
    t.controller.dispose();
    t.send('pointermove', { clientX: 400 });
    t.send('pointerup');
    expect(t.move).not.toHaveBeenCalled();
    expect(t.end).toHaveBeenCalledTimes(1);
    expect(t.controller.active).toBe(false);
  });
});
