// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PartnerAccessoryPanel from './PartnerAccessoryPanel';
import { usePartnerAccessoryStore } from '../../stores/partnerAccessoryStore';
import { usePetStore } from '../../stores/petStore';
import { BUILTIN_ACCESSORY_CATALOG, defaultAccessorySnapshot, supportedAccessory } from '../../data/partnerAccessories';
import type { OwnedPet } from '../../types/pet';
vi.mock('./PetSprite', () => ({ default: () => <div data-testid="pet-sprite" /> }));
vi.mock('../../lib/tauriEvents', () => ({ safeListen: () => () => {} }));
let root: Root;
let host: HTMLDivElement;
let preferenceChanged: (() => void) | undefined;
let preferenceListeners = new Set<() => void>();
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  reduced = false;
  preferenceListeners = new Set();
  preferenceChanged = () => preferenceListeners.forEach(callback => callback());
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, callback: () => void) => preferenceListeners.add(callback), removeEventListener: (_: string, callback: () => void) => preferenceListeners.delete(callback) }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  usePetStore.setState({ ownedPets: [{ petId: 'one', petName: '卡皮', modelPath: '/pet-sprites/2d/capi.json' } as OwnedPet], activePetId: 'one', coins: 1000 });
  usePartnerAccessoryStore.setState({ loaded: true, busy: false, error: '', snapshot: defaultAccessorySnapshot(), catalog: structuredClone(BUILTIN_ACCESSORY_CATALOG), load: vi.fn().mockResolvedValue(undefined) });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const click = (selector: string) => { const button = host.querySelector<HTMLButtonElement>(selector); expect(button).not.toBe(null); act(() => button!.click()); };
it('keeps the complete ground halo behind the actor, including its dashed inner ring', () => {
  act(() => root.render(<PartnerAccessoryPanel />));
  expect(host.querySelectorAll('.partner-accessory-depth.front .partner-accessory-halo')).toHaveLength(0);
  expect(host.querySelector('.partner-accessory-depth.back .partner-accessory-halo ellipse')).not.toBe(null);
});
it('only shows a trail during the explicit timed movement preview and never writes equipment', () => {
  const before = usePartnerAccessoryStore.getState().snapshot;
  act(() => root.render(<PartnerAccessoryPanel />));
  click('[aria-label="预览彗星航迹"]');
  expect(host.querySelector('.partner-accessory-trail')).toBe(null);
  click('.partner-preview-movement');
  expect(host.querySelector('.partner-preview-actor.moving')).not.toBe(null);
  expect(host.querySelector('.partner-accessory-trail')).not.toBe(null);
  act(() => vi.advanceTimersByTime(1800));
  expect(host.querySelector('.partner-preview-actor.moving')).toBe(null);
  expect(host.querySelector('.partner-accessory-trail')).toBe(null);
  expect(usePartnerAccessoryStore.getState().snapshot).toBe(before);
});
it('cancels the preview on selection changes, reduced motion, and unmount', () => {
  act(() => root.render(<PartnerAccessoryPanel />)); click('[aria-label="预览彗星航迹"]'); click('.partner-preview-movement');
  click('[aria-label="预览像素跃迁"]'); expect(host.querySelector('.partner-preview-actor.moving')).toBe(null);
  expect(vi.getTimerCount()).toBe(1); // One bounded animation loop, no movement timer.
  click('.partner-preview-movement');
  act(() => { reduced = true; preferenceChanged?.(); });
  expect(host.querySelector('.partner-accessory-trail')).toBe(null);
  expect(host.querySelector<HTMLButtonElement>('.partner-preview-movement')?.disabled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  act(() => { reduced = false; preferenceChanged?.(); }); click('.partner-preview-movement');
  act(() => root.unmount()); expect(vi.getTimerCount()).toBe(0);
  root = createRoot(host);
});
it('renders neutral unsupported metadata and disables all its actions without guessing artwork', () => {
  const catalog = structuredClone(BUILTIN_ACCESSORY_CATALOG);
  catalog.items.push({ ...catalog.items[0], id: 'future-nebula', name: '未来星云', visual: { ...catalog.items[0].visual, primitive: 'nebula' as any } });
  usePartnerAccessoryStore.setState({ catalog });
  act(() => root.render(<PartnerAccessoryPanel />));
  const article = [...host.querySelectorAll('article')].find(a => a.textContent?.includes('未来星云'))!;
  expect(article.querySelector('svg')).toBe(null);
  expect(article.querySelector('.partner-accessory-unavailable')?.textContent).toBe('需要更新');
  expect([...article.querySelectorAll('button')].every(button => button.disabled)).toBe(true);
});
it('supports new online IDs using known primitives instead of restricting the six founder IDs', () => {
  const catalog = structuredClone(BUILTIN_ACCESSORY_CATALOG);
  const added = { ...catalog.items[0], id: 'halo-new-season', name: '新季星环' };
  catalog.items.push(added); usePartnerAccessoryStore.setState({ catalog });
  expect(supportedAccessory(added)).toBe(true);
  act(() => root.render(<PartnerAccessoryPanel />));
  const preview = host.querySelector<HTMLButtonElement>('[aria-label="预览新季星环"]')!;
  expect(preview.disabled).toBe(false); expect(preview.querySelector('svg')).not.toBe(null);
  act(() => preview.click()); expect(host.querySelector('.partner-preview-caption b')?.textContent).toBe('新季星环');
});
it('filters the expanded collection without changing ownership or its per-pet loadout', () => {
  const before = usePartnerAccessoryStore.getState().snapshot;
  act(() => root.render(<PartnerAccessoryPanel />));
  expect(host.querySelectorAll('.partner-accessory-card')).toHaveLength(18);
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  act(() => tabs.find(t => t.textContent?.startsWith('环绕'))!.click());
  expect(host.querySelectorAll('.partner-accessory-card')).toHaveLength(6);
  click('[aria-label="预览星穹光翼"]');
  expect(host.querySelector('.partner-accessory-depth.front .partner-accessory-orbit > g')).toBe(null);
  expect(host.querySelector('.partner-accessory-depth.back .partner-accessory-orbit polygon')).not.toBe(null);
  act(() => tabs.find(t => t.textContent?.startsWith('已拥有'))!.click());
  expect(host.querySelectorAll('.partner-accessory-card')).toHaveLength(1);
  expect(usePartnerAccessoryStore.getState().snapshot).toBe(before);
});
