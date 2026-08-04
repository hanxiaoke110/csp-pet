import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

/** 手动设置桌面伙伴时，等待窗口真正可见的最长时间 */
export const COMPANION_VISIBLE_TIMEOUT_MS = 10_000;
/** 应用启动恢复桌面伙伴时，等待窗口可见的最长时间（不阻塞启动） */
export const COMPANION_RESTORE_TIMEOUT_MS = 8_000;

export async function showDesktopCompanion(slot: 2 | 3): Promise<boolean> {
  try {
    await invoke('show_desktop_companion', { slot });
    return true;
  } catch {
    return false;
  }
}

export async function hideDesktopCompanion(slot: 2 | 3): Promise<void> {
  try { await invoke('hide_desktop_companion', { slot }); } catch {}
}

/**
 * 等待某个独立桌宠窗口“真正可见”。
 * 双通道确认：
 *  1. pet-{slot} 页面精灵就绪或超时强制显示时广播 pet-companion-shown 事件；
 *  2. 轮询原生窗口 isVisible，避免事件注册竞态导致漏判。
 * 超时返回 false，调用方应回滚 desktopCompanionIds 并销毁窗口。
 */
export function waitForCompanionVisible(
  slot: 2 | 3,
  timeoutMs: number = COMPANION_VISIBLE_TIMEOUT_MS,
): Promise<boolean> {
  const label = `pet-${slot}`;
  return new Promise<boolean>(resolve => {
    let settled = false;
    let unlisten: (() => void) | null = null;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      unlisten?.();
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    const poll = setInterval(() => {
      void (async () => {
        try {
          const win = await WebviewWindow.getByLabel(label);
          if (win && await win.isVisible()) finish(true);
        } catch { /* 窗口可能在轮询间隙被销毁 */ }
      })();
    }, 400);

    listen<{ slot?: number }>('pet-companion-shown', event => {
      if (event.payload?.slot === slot) finish(true);
    }).then(fn => {
      if (settled) { try { fn(); } catch { /* 忽略注销失败 */ } }
      else unlisten = fn;
    }).catch(() => { /* listen 失败由轮询兜底 */ });
  });
}
