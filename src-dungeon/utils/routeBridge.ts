// 桌面 App 与地牢之间的路由切换桥（独立模块，打破 App.tsx ↔ DungeonEmbed ↔ TitleScreen 的循环 import）。
// 进入/退出地牢时，通过 pushState + 自定义事件触发顶层 App 在 BrowserRouter/MemoryRouter 间切换。
export const APP_ROUTE_CHANGE_EVENT = 'csp-app-route-change';

export function navigateToMainApp(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(APP_ROUTE_CHANGE_EVENT));
}
