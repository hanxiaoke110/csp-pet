// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import PetSprite from './PetSprite';
import { writePerformanceMode } from '../../lib/performanceMode';
it('different-sized companions keep independent animation rules after one unmounts', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  const selector = 'style[id^="pet-spr-"][id$="-keyframes"]';
  try {
    await act(async () => root.render(<><PetSprite key="large" canvasSize={220} exposeGlobals={false} /><PetSprite key="small" canvasSize={140} exposeGlobals={false} /></>));
    const rules = [...document.querySelectorAll(selector)];
    expect(rules).toHaveLength(2);
    expect(rules.map(s => s.id)[0]).not.toBe(rules[1].id);
    const largeDistance = Math.round(220 * 192 / 208) * 6;
    expect(rules[0].textContent).toContain(`translateX(-${largeDistance}px)`);
    await act(async () => root.render(<PetSprite key="large" canvasSize={220} exposeGlobals={false} />));
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)?.textContent).toContain(`translateX(-${largeDistance}px)`);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it('economy pauses idle artwork and restores standard animation without remounting', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    writePerformanceMode('standard');
    await act(async () => root.render(<PetSprite exposeGlobals={false} />));
    const artwork = host.querySelector('[style*="animation:"]') as HTMLElement;
    expect(artwork.style.animationPlayState).toBe('running');
    await act(async () => writePerformanceMode('economy'));
    expect(artwork.style.animationPlayState).toBe('paused');
    await act(async () => writePerformanceMode('standard'));
    expect(artwork.style.animationPlayState).toBe('running');
    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(artwork.style.animationPlayState).toBe('paused');
  } finally {
    await act(async () => root.unmount()); host.remove();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    writePerformanceMode('standard'); vi.unstubAllGlobals();
  }
});
