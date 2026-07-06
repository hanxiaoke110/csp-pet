// 桌面 App 集成入口：把 src-dungeon 地牢作为全屏页面挂载到桌面端。
// - 顶层 App 根据当前 URL 在 BrowserRouter 与 MemoryRouter 之间二选一（不嵌套，避免 React Router 报错）
// - 本组件由 MemoryRouter 包裹渲染（见 src/App.tsx），地牢内部用内存路由，导航不污染桌面 URL
// - 动态注入/移除地牢 CSS，避免全局样式污染桌面侧边栏
// - 全屏覆盖（脱离 AppShell 侧边栏），提供沉浸式游戏体验
import { useEffect, useRef } from 'react';
import { AppContent } from './App';
// 以原始文本导入地牢 CSS，运行时动态注入，卸载时移除，避免污染桌面全局样式
import dungeonCss from './App.css?raw';

// 顶层路由切换事件名：进入/退出地牢时通过 pushState + dispatchEvent 触发顶层 App 重渲染
export const APP_ROUTE_CHANGE_EVENT = 'csp-app-route-change';

export function navigateToMainApp(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(APP_ROUTE_CHANGE_EVENT));
}

export default function DungeonEmbed() {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-dungeon-css', 'true');
    style.textContent = dungeonCss;
    document.head.appendChild(style);
    styleRef.current = style;
    return () => {
      style.remove();
      styleRef.current = null;
    };
  }, []);

  return (
    <div
      data-dungeon-root
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        overflow: 'auto',
      }}
    >
      <button
        onClick={() => navigateToMainApp('/courses')}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 100000,
          padding: '8px 14px',
          background: 'rgba(0,0,0,0.6)',
          color: '#ffd700',
          border: '2px solid #ffd700',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        ← 返回主菜单
      </button>
      <AppContent />
    </div>
  );
}
