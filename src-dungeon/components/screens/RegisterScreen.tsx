import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { registerPlayer } from '../../utils/api';
import { readDesktopBinding, isBindingComplete, buildPlayerIdentity } from '../../utils/autoRegister';
import { navigateToMainApp } from '../../utils/routeBridge';
import schoolsData from '../../data/schools.json';
import type { School, SchoolDefinition } from '../../types/dungeon';
import { getSchoolPassive } from '../../utils/gameLogic';

const schools = schoolsData as SchoolDefinition[];

// 智子试炼场注册页（简化版）：复用桌面端绑定信息，学生只需选一次修行流派。
// 班级码/昵称/真实姓名/手机号均来自桌面「班级绑定」，不在此重复填写。
// 宠物直接用桌面端灵犀智子（地牢战斗读 csp_pet_data），不再赠送 web 宠物。
export default function RegisterScreen() {
  const navigate = useNavigate();
  const store = useDungeonStore();

  const [selectedSchool, setSelectedSchool] = useState<School>('cultivation');
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);

  const binding = readDesktopBinding();

  // 桌面绑定信息不全：不应到达此页，兜底引导回设置页
  if (!isBindingComplete(binding)) {
    return (
      <div style={{
        minHeight: '100vh', background: "linear-gradient(180deg, rgba(5,12,20,0.30), rgba(3,7,12,0.82)), url('/dungeon-art-v3/home.webp') center/cover no-repeat",
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}>
        <div className="pixel-card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontFamily: 'var(--pixel-font)', fontSize: 14, color: 'var(--hp-red)', marginBottom: 12 }}>
            班级信息不完整
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.8, marginBottom: 20 }}>
            请先在主菜单「设置 → 班级绑定」<br />完成班级码、昵称、姓名、手机号填写
          </p>
          <button className="pixel-btn" onClick={() => navigateToMainApp('/settings')} style={{ width: '100%' }}>
            ← 返回主菜单绑定
          </button>
        </div>
      </div>
    );
  }

  const handleRegister = async () => {
    setRegistering(true); setError('');
    try {
      const identity = buildPlayerIdentity(binding!, selectedSchool);
      const resp = await registerPlayer(
        identity.classCode,
        identity.displayName,
        identity.realName,
        identity.phone,
        identity.school,
      );
      if (resp.success) {
        store.initPlayer(resp.player);
        store.recordDailyLogin();
        // 同步初始进度到服务端（fire and forget）
        import('../../utils/api').then(({ syncProgress }) => {
          syncProgress({
            player_level: resp.player.playerLevel || 1, exp: 0, gold: 0,
            rank_tier: 1, rank_points: 0,
            total_answered: 0, total_correct: 0,
            current_streak: 0, max_streak: 0,
            login_streak: 0, school: selectedSchool,
            dungeon_progress: [],
            badges: [],
          }).catch(() => {});
        });
        store.setView('map');
        navigate('/map');
      } else {
        setError(resp.error || '注册失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '注册失败');
    }
    setRegistering(false);
  };

  return (
    <div style={{
      minHeight: '100vh', background: "linear-gradient(180deg, rgba(5,12,20,0.30), rgba(3,7,12,0.82)), url('/dungeon-art-v3/home.webp') center/cover no-repeat",
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{ maxWidth: '550px', width: '100%' }}>
        <h2 style={{
          fontFamily: 'var(--pixel-font)', fontSize: 14, color: 'var(--gold)',
          textAlign: 'center', marginBottom: 8,
        }}>
          🏯 选择你的修行流派
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
          {binding!.displayName}，选定流派后即可进入秘境
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {schools.map(school => (
            <div
              key={school.id}
              onClick={() => setSelectedSchool(school.id)}
              style={{
                cursor: 'pointer',
                borderColor: selectedSchool === school.id ? school.themeColor : 'var(--border-pixel)',
                borderWidth: selectedSchool === school.id ? 3 : 'var(--pixel-border)',
                transition: 'all 0.15s',
                background: selectedSchool === school.id ? school.bgGradient : 'var(--bg-card)',
              }}
              className="pixel-card"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{school.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: school.themeColor }}>
                    {school.name} · {school.subtitle}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.6 }}>
                    {school.description.slice(0, 80)}...
                  </div>
                  <div style={{ fontSize: 11, color: school.themeColor, marginTop: 6, lineHeight: 1.6 }}>
                    被动：{getSchoolPassive(school.id).name} · {getSchoolPassive(school.id).description}
                  </div>
                </div>
                {selectedSchool === school.id && (
                  <span style={{ color: school.themeColor, fontSize: 20 }}>✅</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ color: 'var(--hp-red)', fontSize: 12, marginBottom: 12, padding: 8, background: 'rgba(255,51,51,0.1)', border: '1px solid var(--hp-red)' }}>
            ⚠️ {error}
          </div>
        )}

        <button
          className="pixel-btn primary"
          onClick={handleRegister}
          disabled={registering}
          style={{ width: '100%', fontSize: 16, padding: 14 }}
        >
          {registering ? '🏰 正在进入秘境...' : '🏰 进入秘境'}
        </button>

        <button
          className="pixel-btn"
          onClick={() => navigate('/')}
          style={{ width: '100%', marginTop: 8, fontSize: 12 }}
        >
          ← 返回标题
        </button>

        <p style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', marginTop: 16 }}>
          ⚠️ 选定后每赛季可更换1次 · 不同流派同榜竞技
        </p>
      </div>
    </div>
  );
}
