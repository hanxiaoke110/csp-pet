// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FOCUS_SETTINGS, useFocusStore } from '../../stores/focusStore';
import { deriveFocusTiming } from '../../utils/focusTimer';
import FocusPage from './FocusPage';

let root: Root;
let container: HTMLDivElement;

async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
  expect(button, `button ${text}`).toBeTruthy();
  await act(async () => button!.click());
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Desktop injected confirm is asynchronous, unlike browser confirm.
  vi.spyOn(window, 'confirm').mockImplementation(() => Promise.resolve(false) as unknown as boolean);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
  localStorage.clear();
  useFocusStore.setState({
    settings: { ...DEFAULT_FOCUS_SETTINGS }, activeSession: null, records: [],
    archivedDaily: [], recentGoals: [], loaded: true, storageWarning: '',
  });
  useFocusStore.getState().start('阅读课外书', 25);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<FocusPage />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('专注提前结束真实点击回归', () => {
  it('点击提前结束只显示应用内确认，不调用桌面原生 confirm、不立即结束', async () => {
    await click('提前结束');
    expect(useFocusStore.getState().activeSession?.status).toBe('running');
    expect(document.body.textContent).toContain('要提前结束这次专注吗');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('取消保留同一场专注、已用时间和历史记录', async () => {
    const id = useFocusStore.getState().activeSession!.id;
    await act(async () => vi.advanceTimersByTime(120_000));
    await click('提前结束');
    await click('取消');
    expect(useFocusStore.getState().activeSession).toMatchObject({ id, status: 'running' });
    expect(document.body.textContent).toContain('23:00');
    expect(useFocusStore.getState().records).toHaveLength(0);
    expect(document.body.textContent).not.toContain('结束并复盘');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('确认只进入一次复盘，保留已专注时间而不直接写入记录', async () => {
    const id = useFocusStore.getState().activeSession!.id;
    await act(async () => vi.advanceTimersByTime(120_000));
    await click('提前结束');
    await click('结束并复盘');
    const session = useFocusStore.getState().activeSession!;
    expect(session).toMatchObject({ id, status: 'review', endedEarly: true });
    expect(deriveFocusTiming(session).elapsedSeconds).toBe(120);
    expect(useFocusStore.getState().records).toHaveLength(0);
    expect(document.body.textContent).not.toContain('结束并复盘');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('暂停时取消确认不会恢复或结束计时', async () => {
    await click('暂停');
    await click('提前结束');
    await click('取消');
    expect(useFocusStore.getState().activeSession?.status).toBe('paused');
    expect(document.body.textContent).toContain('继续');
  });

  it('弹窗打开期间自然结束会关闭弹窗，不会误结束下一场专注', async () => {
    await click('提前结束');
    await act(async () => {
      vi.advanceTimersByTime(25 * 60_000);
      useFocusStore.getState().completeNaturally();
    });
    expect(useFocusStore.getState().activeSession).toMatchObject({ status: 'review', endedEarly: false });
    expect(document.body.textContent).not.toContain('结束并复盘');
    await act(async () => {
      useFocusStore.getState().discardReview();
      useFocusStore.getState().start('写作业', 15);
    });
    expect(useFocusStore.getState().activeSession).toMatchObject({ goal: '写作业', status: 'running' });
    expect(document.body.textContent).not.toContain('结束并复盘');
  });

  it('桌面 confirm 即使抛出 ACL 错误，取消和确认仍不依赖它', async () => {
    vi.mocked(window.confirm).mockImplementation(() => { throw new Error('Command plugin:dialog|confirm not allowed by ACL'); });
    await click('提前结束');
    await click('取消');
    await click('提前结束');
    await click('结束并复盘');
    expect(useFocusStore.getState().activeSession?.status).toBe('review');
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
