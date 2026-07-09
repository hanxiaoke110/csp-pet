import { listen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * 把任意 unlisten 调用包成「绝不抛未捕获拒绝」的同步清理函数。
 *
 * Tauri 2 事件系统在 webview 注入的 unregisterListener 内部访问
 * listeners[eventId].handlerId；当 eventId 已不在 map 里（webview 重载 /
 * 路由整体切换 / StrictMode 双调用导致重复 unregister）时，会抛
 * "undefined is not an object (evaluating 'listeners[eventId].handlerId')"，
 * 若不 catch 会冒泡成 unhandledrejection，被 index.html 画成红条。
 */
function safeUnlisten(fn: UnlistenFn): () => void {
  return () => {
    try {
      const ret = (fn as () => unknown | Promise<unknown>)();
      if (ret && typeof (ret as Promise<unknown>).then === 'function') {
        (ret as Promise<unknown>).catch(() => {});
      }
    } catch {
      /* swallow — unlisten failures are non-fatal */
    }
  };
}

/**
 * 安全订阅 Tauri 事件，返回同步清理函数。
 *
 * 解决 listen() 是 Promise 带来的两类竞态：
 *  1. 组件在 listen Promise resolve 前就卸载 → 取消标记置位，resolve 后立即注销并吞错；
 *  2. 组件在 listen Promise resolve 后卸载 → 正常注销，注销失败被吞。
 *
 * 用法：
 *   useEffect(() => safeListen('pet-action', (e) => {...}), []);
 */
export function safeListen<T = unknown>(
  event: string,
  handler: EventCallback<T>,
): () => void {
  let cancelled = false;
  let unlisten: UnlistenFn | null = null;

  listen<T>(event, handler).then(fn => {
    if (cancelled) {
      // 已卸载，立即注销避免泄漏
      safeUnlisten(fn)();
    } else {
      unlisten = fn;
    }
  }).catch(() => {
    /* listen 注册失败（如 webview 正在销毁）— 忽略 */
  });

  return () => {
    cancelled = true;
    if (unlisten) {
      safeUnlisten(unlisten)();
      unlisten = null;
    }
  };
}

/**
 * 把「返回 Promise<UnlistenFn> 的窗口监听器」（如 onResized / onFocusChanged）
 * 包成与 safeListen 同样安全的 useEffect 清理函数。
 */
export function safeWindowListen(
  unlistenPromise: Promise<UnlistenFn>,
): () => void {
  let cancelled = false;
  let unlisten: UnlistenFn | null = null;

  unlistenPromise.then(fn => {
    if (cancelled) {
      safeUnlisten(fn)();
    } else {
      unlisten = fn;
    }
  }).catch(() => {});

  return () => {
    cancelled = true;
    if (unlisten) {
      safeUnlisten(unlisten)();
      unlisten = null;
    }
  };
}
