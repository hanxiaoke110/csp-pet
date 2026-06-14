import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { getStoredClassCode } from '../../utils/api';

export default function TitleScreen() {
  const navigate = useNavigate();
  const player = useDungeonStore(s => s.player);
  const setView = useDungeonStore(s => s.setView);

  const hasRegistered = !!(player.displayName && player.classCode);
  const hasClassCode = !!getStoredClassCode();

  const handleEnter = () => {
    if (hasRegistered) {
      navigate('/map');
      setView('map');
    } else {
      navigate('/register');
      setView('register');
    }
  };

  const handleLogin = () => {
    navigate('/login');
    setView('register');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0015 0%, #1a0030 30%, #0a0a0a 100%)',
      padding: '20px', textAlign: 'center', gap: '24px',
    }}>
      {/* Decorative dragons */}
      <div style={{ fontSize: '48px', opacity: 0.6 }}>🐉</div>

      {/* Title */}
      <div>
        <h1 style={{
          fontFamily: 'var(--pixel-font)', fontSize: 'clamp(16px, 4vw, 28px)',
          color: 'var(--gold)', textShadow: '0 0 20px rgba(255,215,0,0.4), 0 2px 4px rgba(0,0,0,0.8)',
          letterSpacing: '4px', lineHeight: 1.8,
        }}>
          潜 龙 闭 关
        </h1>
        <h2 style={{
          fontFamily: 'var(--pixel-font)', fontSize: 'clamp(10px, 2.5vw, 16px)',
          color: '#cc9933', marginTop: '8px',
          textShadow: '0 0 10px rgba(204,153,51,0.3)',
          letterSpacing: '3px',
        }}>
          学 霸 副 本 攻 略
        </h2>
      </div>

      {/* Subtitle */}
      <p style={{
        color: 'var(--text-dim)', fontSize: '13px', maxWidth: '400px',
        lineHeight: 1.8,
      }}>
        CSP-J 初赛备战 · 沉浸式闯关修炼<br />
        将枯燥的知识点背诵，化为斩妖除魔的修行
      </p>

      {hasRegistered ? (
        <>
          <button className="pixel-btn primary" onClick={handleEnter}
            style={{ marginTop: '16px', fontSize: '16px', padding: '16px 48px', animation: 'popIn 0.5s ease' }}>
            🏰 继续修炼
          </button>
          <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
            欢迎回来，{player.displayName} · {getSchoolName(player.school)}
          </p>
        </>
      ) : (
        <>
          <button className="pixel-btn primary" onClick={handleEnter}
            style={{ marginTop: '16px', fontSize: '16px', padding: '16px 48px', animation: 'popIn 0.5s ease' }}>
            🐉 进入秘境
          </button>
          <button className="pixel-btn" onClick={handleLogin}
            style={{ marginTop: '8px', fontSize: '13px', padding: '10px 32px' }}>
            🔑 已有账号？登录
          </button>
        </>
      )}

      {/* Bottom decoration */}
      <div style={{ fontSize: '24px', opacity: 0.3, marginTop: '20px' }}>
        ⚔️ 🛡️ 🏰 📜 🔮
      </div>

      <p style={{ color: '#444', fontSize: '10px', position: 'absolute', bottom: '20px' }}>
        v1.0 · 潜龙秘境 · 韩老师出品
      </p>
    </div>
  );
}

function getSchoolName(school: string): string {
  const names: Record<string, string> = {
    cultivation: '修仙正宗',
    tactical: '战术特勤',
    star: '星轨学会',
    minecraft: '方块世界',
    code: '代码神殿',
    dream: '星之舞台',
  };
  return names[school] || '';
}
