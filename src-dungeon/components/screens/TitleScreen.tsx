import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { readDesktopBinding, isBindingComplete } from '../../utils/autoRegister';
import { navigateToMainApp } from '../../utils/routeBridge';
import { CURRENT_DUNGEON_SEASON_NAME } from '../../data/season';

// 智子试炼场标题页：复用桌面端「班级绑定」身份，不再有独立注册/登录流程。
// - 已建档（本地 dungeon_player 有昵称+班级码）→ 继续修炼，进地图
// - 桌面已绑班级码且信息完整、首次进入 → 进流派选择（唯一需要学生做的事）
// - 未绑班级码或信息不全 → 提示去主菜单设置页绑定
export default function TitleScreen() {
  const navigate = useNavigate();
  const player = useDungeonStore(s => s.player);
  const setView = useDungeonStore(s => s.setView);

  const hasRegistered = !!(player.displayName && player.classCode);
  const binding = readDesktopBinding();
  const canAutoRegister = isBindingComplete(binding);

  const handleEnter = () => {
    if (hasRegistered) {
      navigate('/map');
      setView('map');
    } else if (canAutoRegister) {
      // 桌面信息齐全，只需选一次流派即可建档
      navigate('/register');
      setView('register');
    }
    // 未绑定：按钮不响应，由下方提示引导
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh',
      background: "linear-gradient(180deg, rgba(5,12,20,0.12) 0%, rgba(4,10,16,0.45) 48%, rgba(2,5,8,0.92) 100%), url('/dungeon-art-v3/season-2-key-art.webp') center/cover no-repeat",
      padding: '20px', textAlign: 'center', gap: '24px',
    }}>
      <div>
        <h1 style={{
          fontFamily: 'var(--pixel-font)', fontSize: 'clamp(16px, 4vw, 28px)',
          color: 'var(--gold)', textShadow: '0 0 20px rgba(255,215,0,0.4), 0 2px 4px rgba(0,0,0,0.8)',
          letterSpacing: '4px', lineHeight: 1.8,
        }}>
          智 子 试 炼 场
        </h1>
        <h2 style={{
          fontFamily: 'var(--pixel-font)', fontSize: 'clamp(10px, 2.5vw, 16px)',
          color: '#cc9933', marginTop: '8px',
          textShadow: '0 0 10px rgba(204,153,51,0.3)',
          letterSpacing: '3px',
        }}>
          第二赛季 · {CURRENT_DUNGEON_SEASON_NAME}
        </h2>
      </div>

      <p style={{
        color: 'var(--text-dim)', fontSize: '13px', maxWidth: '400px',
        lineHeight: 1.8,
      }}>
        八大知识副本重新开启，关卡与排行榜从零出发<br />
        桌宠智子及其等级经验、通用金币、商城购买与皮肤均会保留
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
      ) : canAutoRegister ? (
        <>
          <button className="pixel-btn primary" onClick={handleEnter}
            style={{ marginTop: '16px', fontSize: '16px', padding: '16px 48px', animation: 'popIn 0.5s ease' }}>
            🐉 进入秘境
          </button>
          <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
            {binding?.displayName}，选择修行流派即可开始
          </p>
        </>
      ) : (
        <>
          <div style={{
            marginTop: '16px', padding: '16px 20px',
            background: 'rgba(255,51,51,0.1)', border: '2px solid var(--hp-red)',
            color: 'var(--hp-red)', fontSize: '13px', lineHeight: 1.8, maxWidth: 360,
          }}>
            ⚠️ 进入秘境前需先绑定班级码<br />
            请在主菜单「设置 → 班级绑定」中完成绑定
          </div>
          <button className="pixel-btn" onClick={() => navigateToMainApp('/settings')}
            style={{ marginTop: '8px', fontSize: '13px', padding: '10px 32px' }}>
            ← 返回主菜单绑定
          </button>
        </>
      )}

      <p style={{ color: 'rgba(238,245,233,.62)', fontSize: '11px', position: 'absolute', bottom: '20px' }}>
        赛季资产保护：智子与通用金币不重置
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
