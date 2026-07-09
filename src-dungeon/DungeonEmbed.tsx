// 桌面 App 集成入口：把 src-dungeon 地牢作为全屏页面挂载到桌面端。
// - 顶层 App 根据当前 URL 在 BrowserRouter 与 MemoryRouter 之间二选一（不嵌套，避免 React Router 报错）
// - 本组件由 MemoryRouter 包裹渲染（见 src/App.tsx），地牢内部用内存路由，导航不污染桌面 URL
// - 动态注入/移除地牢 CSS，避免全局样式污染桌面侧边栏
// - 全屏覆盖（脱离 AppShell 侧边栏），提供沉浸式游戏体验
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppContent } from './App';
import { useDungeonStore } from './stores/dungeonStore';
import { navigateToMainApp } from './utils/routeBridge';
import { useClassAccess, ClassAccessRequired } from '../src/components/access/ClassAccessGate';
// 以原始文本导入地牢 CSS，运行时动态注入，卸载时移除，避免污染桌面全局样式
import dungeonCss from './App.css?raw';

export default function DungeonEmbed() {
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isBattleRoute = location.pathname.startsWith('/battle');
  // 智子试炼场班级码门禁：进入页面即自动校验（6h 缓存），未通过则不渲染 AppContent
  const classAccess = useClassAccess(true);

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

  const abandonBattle = () => {
    setPauseOpen(false);
    useDungeonStore.getState().setView('map');
    navigate('/map');
  };

  const returnToMainApp = () => {
    setPauseOpen(false);
    navigateToMainApp('/courses');
  };

  // 班级码门禁未通过：不进入 AppContent（保留下方主返回逻辑仅对已通过门禁的玩家生效）
  if (!classAccess.isAllowed) {
    const overlay: React.CSSProperties = {
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#0a0a0a',
      overflow: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    };
    if (classAccess.status === 'idle' || classAccess.status === 'checking') {
      return (
        <div data-dungeon-root style={{ ...overlay, color: '#f8fafc', fontFamily: 'system-ui, sans-serif', fontSize: 15 }}>
          正在校验班级权限...
        </div>
      );
    }
    return (
      <div data-dungeon-root style={overlay}>
        <div style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: '40px 44px',
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 16px 50px rgba(0,0,0,0.55)',
        }}>
          <ClassAccessRequired
            title="智子试炼场需要班级码"
            description="试炼场属于班级挑战内容，绑定班级码后即可进入。"
            message={classAccess.message}
            onBind={() => navigateToMainApp('/settings')}
            onBack={() => navigateToMainApp('/courses')}
          />
        </div>
      </div>
    );
  }

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
      {isBattleRoute ? (
        <button
          onClick={() => { window.dispatchEvent(new CustomEvent('dungeon-pause')); setPauseOpen(true); }}
          style={{
            position: 'fixed',
            top: 12,
            right: 12,
            zIndex: 100000,
            padding: '8px 16px',
            background: 'rgba(0,0,0,0.62)',
            color: '#ffd700',
            border: '2px solid #ffd700',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          暂停
        </button>
      ) : (
        <button
          onClick={returnToMainApp}
          style={{
            position: 'fixed',
            left: 12,
            bottom: 12,
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
          ← 返回学习助手
        </button>
      )}

      {pauseOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(0,0,0,0.72)',
          }}
        >
          <div
            style={{
              width: 'min(360px, calc(100vw - 40px))',
              background: '#121224',
              border: '3px solid #ffd700',
              boxShadow: '0 16px 50px rgba(0,0,0,0.55)',
              padding: 20,
              color: '#f8fafc',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            <div style={{ color: '#ffd700', fontWeight: 900, fontSize: 18, marginBottom: 8 }}>
              战斗已暂停
            </div>
            <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
              放弃挑战会结束当前战斗，本场不会进入结算。
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button style={pauseButtonStyle('primary')} onClick={() => { setPauseOpen(false); window.dispatchEvent(new CustomEvent('dungeon-resume')); }}>
                继续战斗
              </button>
              <button style={pauseButtonStyle('normal')} onClick={abandonBattle}>
                放弃挑战，返回试炼地图
              </button>
              <button style={pauseButtonStyle('normal')} onClick={returnToMainApp}>
                返回学习助手首页
              </button>
            </div>
          </div>
        </div>
      )}
      <AppContent />
    </div>
  );
}

function pauseButtonStyle(kind: 'primary' | 'normal'): React.CSSProperties {
  return {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 6,
    border: kind === 'primary' ? '2px solid #ffd700' : '2px solid #4a4a6a',
    background: kind === 'primary' ? '#2f2600' : '#18223d',
    color: kind === 'primary' ? '#ffd700' : '#e2e8f0',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    textAlign: 'center',
  };
}
