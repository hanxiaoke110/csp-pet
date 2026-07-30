import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import { hideDesktopCompanion, showDesktopCompanion } from './desktopCompanions';

describe('独立桌宠窗口', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('第二、第三只智子通过原生命令显示各自槽位', async () => {
    await expect(showDesktopCompanion(2)).resolves.toBe(true);
    await expect(showDesktopCompanion(3)).resolves.toBe(true);

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'show_desktop_companion', { slot: 2 });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'show_desktop_companion', { slot: 3 });
  });

  it('原生窗口创建失败时返回 false', async () => {
    invokeMock.mockRejectedValueOnce(new Error('window creation failed'));
    await expect(showDesktopCompanion(2)).resolves.toBe(false);
  });

  it('收回桌宠时只隐藏对应槽位窗口', async () => {
    await hideDesktopCompanion(3);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('hide_desktop_companion', { slot: 3 });
  });
});
