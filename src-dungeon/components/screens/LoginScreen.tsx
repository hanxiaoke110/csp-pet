import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { loginPlayer } from '../../utils/api';
import { expToNextLevel } from '../../utils/gameLogic';
import type { DungeonProgress } from '../../types/dungeon';

export default function LoginScreen() {
  const navigate = useNavigate();
  const store = useDungeonStore();

  const [realName, setRealName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!realName.trim()) { setError('请输入姓名'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) { setError('手机号格式不正确'); return; }
    setLoading(true); setError('');

    try {
      const resp = await loginPlayer(realName.trim(), phone.trim());
      if (!resp.success) throw new Error(resp.error || '登录失败');

      // Normalize server data and restore to store
      const p = resp.player as any;
      store.initPlayer({
        deviceHash: p.device_hash || p.deviceHash,
        classCode: p.class_code || p.classCode,
        displayName: p.display_name || p.displayName,
        realName: p.real_name || p.realName,
        phone: p.phone,
        status: p.status,
        school: p.school,
        rankTier: p.rank_tier || p.rankTier,
        rankPoints: p.rank_points || p.rankPoints,
        playerLevel: p.player_level || p.playerLevel,
        exp: p.exp,
        gold: p.gold,
        totalAnswered: p.total_answered || p.totalAnswered,
        totalCorrect: p.total_correct || p.totalCorrect,
        currentStreak: p.current_streak || p.currentStreak,
        maxStreak: p.max_streak || p.maxStreak,
        loginStreak: p.login_streak || p.loginStreak,
        lastLoginDate: p.last_login_date || p.lastLoginDate,
        season: p.season,
        expToNext: expToNextLevel(p.player_level || p.playerLevel || 1),
      });

      // Restore dungeon progress（与服务端合并取较优，防 reportBattle 失败导致进度缩水）
      if (resp.dungeons && resp.dungeons.length > 0) {
        const ratingOrder: Record<string, number> = { 'SS':5, 'S':4, 'A':3, 'B':2, 'C':1, 'D':0 };
        const statusRank: Record<string, number> = { 'locked':0, 'unlocked':1, 'in_progress':2, 'cleared':3 };
        const serverProgress: DungeonProgress[] = (resp.dungeons as any[]).map((d: any) => ({
          dungeonId: d.dungeon_id || d.dungeonId,
          status: d.status || 'locked',
          completedStages: d.completed_stages || d.completedStages || 0,
          totalStages: d.total_stages || d.totalStages || 5,
          currentStageId: d.current_stage_id || d.currentStageId || null,
          bossDefeated: !!(d.boss_defeated || d.bossDefeated),
          bestScore: d.best_score || d.bestScore || 0,
          bestRating: d.best_rating || d.bestRating || 'D',
        }));
        const localProgress = useDungeonStore.getState().dungeonProgress;
        // 合并：每个副本取服务端与本地较优者
        const merged = serverProgress.map(sp => {
          const lp = localProgress.find(p => p.dungeonId === sp.dungeonId);
          if (!lp) return sp;
          const pickStatus = (statusRank[lp.status]||0) >= (statusRank[sp.status]||0) ? lp.status : sp.status;
          return {
            ...sp,
            status: pickStatus as DungeonProgress['status'],
            completedStages: Math.max(sp.completedStages, lp.completedStages),
            bossDefeated: sp.bossDefeated || lp.bossDefeated,
            bestScore: Math.max(sp.bestScore, lp.bestScore),
            bestRating: (ratingOrder[lp.bestRating]||0) >= (ratingOrder[sp.bestRating]||0) ? lp.bestRating : sp.bestRating,
          };
        });
        useDungeonStore.setState({ dungeonProgress: merged });
      }

      // Restore badges
      if (resp.badges && resp.badges.length > 0) {
        useDungeonStore.setState({ earnedBadges: resp.badges });
      }

      // Save class code
      if (p.class_code) localStorage.setItem('csp_class_code', p.class_code);
      store.saveToLocalStorage();

      store.setView('map');
      navigate('/map');
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请检查网络');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', background: "linear-gradient(180deg, rgba(5,12,20,0.30), rgba(3,7,12,0.82)), url('/dungeon-art-v3/home.webp') center/cover no-repeat",
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div className="pixel-card pixel-border-gold" style={{ maxWidth: '400px', width: '100%' }}>
        <h2 style={{
          fontFamily: 'var(--pixel-font)', fontSize: '14px', color: 'var(--gold)',
          textAlign: 'center', marginBottom: '20px',
        }}>
          🔑 重返潜龙秘境
        </h2>

        <div style={{ marginBottom: '14px' }}>
          <label className="status-label" style={{ display: 'block', marginBottom: '4px' }}>真实姓名</label>
          <input className="pixel-input" value={realName} onChange={e => setRealName(e.target.value)}
            placeholder="注册时填写的姓名" style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label className="status-label" style={{ display: 'block', marginBottom: '4px' }}>手机号</label>
          <input className="pixel-input" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="注册时填写的手机号" maxLength={11} style={{ width: '100%' }} />
        </div>

        {error && (
          <div style={{
            color: 'var(--hp-red)', fontSize: '12px', marginBottom: '12px',
            padding: '8px', background: 'rgba(255,51,51,0.1)', border: '1px solid var(--hp-red)',
          }}>
            ⚠️ {error}
          </div>
        )}

        <button className="pixel-btn primary" onClick={handleLogin} disabled={loading}
          style={{ width: '100%', fontSize: '14px', padding: '12px' }}>
          {loading ? '🔑 验证中...' : '🔑 登录'}
        </button>

        <button className="pixel-btn" onClick={() => navigate('/register')}
          style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}>
          📝 还没有账号？注册
        </button>

        <button className="pixel-btn" onClick={() => navigate('/')}
          style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}>
          ← 返回首页
        </button>

        <style>{`
          .pixel-input {
            padding: 10px 14px; background: #111; border: 2px solid var(--border-pixel);
            color: var(--text-light); font-family: var(--body-font); font-size: 14px; outline: none;
          }
          .pixel-input:focus { border-color: var(--gold); }
        `}</style>
      </div>
    </div>
  );
}
