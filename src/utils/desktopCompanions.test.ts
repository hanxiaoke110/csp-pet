import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

const listenMock = vi.fn();
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => listenMock(...args) }));

const getByLabelMock = vi.fn();
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: { getByLabel: (...args: unknown[]) => getByLabelMock(...args) },
}));

import { hideDesktopCompanion, showDesktopCompanion, waitForCompanionVisible } from './desktopCompanions';

describe('独立桌宠窗口', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockReset();
    getByLabelMock.mockReset();
    vi.useRealTimers();
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

  it('收回桌宠时销毁对应槽位窗口（暂停渲染 + 释放资源）', async () => {
    await hideDesktopCompanion(3);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('hide_desktop_companion', { slot: 3 });
  });

  it('等待窗口可见：收到匹配槽位的 pet-companion-shown 事件即成功', async () => {
    let handler: ((event: { payload?: { slot?: number } }) => void) | undefined;
    listenMock.mockImplementation((_event: string, cb: (e: unknown) => void) => {
      handler = cb as typeof handler;
      return Promise.resolve(() => {});
    });
    getByLabelMock.mockResolvedValue(null);

    const promise = waitForCompanionVisible(2, 5_000);
    handler!({ payload: { slot: 2 } });
    await expect(promise).resolves.toBe(true);
  });

  it('等待窗口可见：其他槽位的事件不误判', async () => {
    vi.useFakeTimers();
    let handler: ((event: { payload?: { slot?: number } }) => void) | undefined;
    listenMock.mockImplementation((_event: string, cb: (e: unknown) => void) => {
      handler = cb as typeof handler;
      return Promise.resolve(() => {});
    });
    getByLabelMock.mockResolvedValue(null);

    const promise = waitForCompanionVisible(2, 5_000);
    handler!({ payload: { slot: 3 } });
    // 事件不匹配，轮询也一直不可见，最终超时返回 false
    vi.advanceTimersByTime(5_000);
    await expect(promise).resolves.toBe(false);
  });

  it('等待窗口可见：轮询到原生窗口可见也成功', async () => {
    vi.useFakeTimers();
    listenMock.mockImplementation(() => Promise.resolve(() => {}));
    getByLabelMock.mockResolvedValue({ isVisible: () => Promise.resolve(true) });
    const promise = waitForCompanionVisible(2, 5_000);
    vi.advanceTimersByTime(400);
    await expect(promise).resolves.toBe(true);
  });

  it('等待窗口可见：超时返回 false', async () => {
    vi.useFakeTimers();
    listenMock.mockImplementation(() => Promise.resolve(() => {}));
    getByLabelMock.mockResolvedValue(null);
    const promise = waitForCompanionVisible(2, 1_000);
    vi.advanceTimersByTime(1_000);
    await expect(promise).resolves.toBe(false);
  });
});
