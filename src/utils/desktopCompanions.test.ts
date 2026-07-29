import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdWindows: Array<{ label: string; options: Record<string, unknown> }> = [];
const existingWindows = new Map<string, { show: ReturnType<typeof vi.fn>; setFocus: ReturnType<typeof vi.fn> }>();

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    static getByLabel = vi.fn(async (label: string) => existingWindows.get(label) || null);

    label: string;
    options: Record<string, unknown>;

    constructor(label: string, options: Record<string, unknown>) {
      this.label = label;
      this.options = options;
      createdWindows.push({ label, options });
    }

    once(event: string, callback: () => void) {
      if (event === 'tauri://created') queueMicrotask(callback);
      return Promise.resolve(() => {});
    }
  },
}));

import { hideDesktopCompanion, showDesktopCompanion } from './desktopCompanions';

describe('独立桌宠窗口', () => {
  beforeEach(() => {
    createdWindows.length = 0;
    existingWindows.clear();
  });

  it('第二、第三只智子创建两个不同窗口并传入各自槽位', async () => {
    await expect(showDesktopCompanion(2)).resolves.toBe(true);
    await expect(showDesktopCompanion(3)).resolves.toBe(true);

    expect(createdWindows).toHaveLength(2);
    expect(createdWindows[0]).toMatchObject({
      label: 'pet-2',
      options: { url: '/pet.html?slot=2', x: 180, y: 160, transparent: true, alwaysOnTop: true },
    });
    expect(createdWindows[1]).toMatchObject({
      label: 'pet-3',
      options: { url: '/pet.html?slot=3', x: 360, y: 160, transparent: true, alwaysOnTop: true },
    });
  });

  it('已有桌宠窗口会直接复用，不会创建重复窗口', async () => {
    const existing = { show: vi.fn(async () => {}), setFocus: vi.fn(async () => {}) };
    existingWindows.set('pet-2', existing);

    await expect(showDesktopCompanion(2)).resolves.toBe(true);

    expect(existing.show).toHaveBeenCalledOnce();
    expect(existing.setFocus).toHaveBeenCalledOnce();
    expect(createdWindows).toHaveLength(0);
  });

  it('收回桌宠时只隐藏对应槽位窗口', async () => {
    const second = { show: vi.fn(), setFocus: vi.fn(), hide: vi.fn(async () => {}) };
    const third = { show: vi.fn(), setFocus: vi.fn(), hide: vi.fn(async () => {}) };
    existingWindows.set('pet-2', second);
    existingWindows.set('pet-3', third);

    await hideDesktopCompanion(3);

    expect(second.hide).not.toHaveBeenCalled();
    expect(third.hide).toHaveBeenCalledOnce();
  });
});
