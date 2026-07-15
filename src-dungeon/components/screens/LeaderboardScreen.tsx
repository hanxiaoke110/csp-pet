import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { getLeaderboard } from '../../utils/api';
import { getRankName } from '../../utils/gameLogic';
import type { LeaderboardType, LeaderboardScope, LeaderboardEntry } from '../../types/dungeon';

const SCHOOL_ICONS: Record<string, string> = {
  cultivation: '🏯', tactical: '🎯', star: '🌌', minecraft: '⛏️', code: '💻', dream: '✨',
};

function normalizeEntry(entry: any): LeaderboardEntry {
  return {
    rank: Number(entry?.rank || 0),
    displayName: entry?.displayName || entry?.display_name || '匿名修行者',
    school: (entry?.school || 'cultivation') as LeaderboardEntry['school'],
    rankTier: Number(entry?.rankTier ?? entry?.rank_tier ?? 1),
    rankPoints: Number(entry?.rankPoints ?? entry?.rank_points ?? entry?.value ?? 0),
    classCode: entry?.classCode || entry?.class_code || '',
    value: Number(entry?.value ?? entry?.rankPoints ?? entry?.rank_points ?? 0),
  };
}

export default function LeaderboardScreen() {
  const navigate = useNavigate();
  const player = useDungeonStore(s => s.player);
  const [scope, setScope] = useState<LeaderboardScope>('class');
  const [type, setType] = useState<LeaderboardType>('power');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [playerEntry, setPlayerEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // 班级榜需要 class_code，未注册/未绑班时提示而非静默吞错
    if (scope === 'class' && !player.classCode) {
      setError('请先注册并加入班级后查看班级榜');
      setEntries([]);
      setPlayerEntry(null);
      setLoading(false);
      return;
    }
    getLeaderboard(scope, type).then(resp => {
      setEntries((resp.entries || []).map(normalizeEntry));
      setPlayerEntry(resp.playerEntry ? normalizeEntry(resp.playerEntry) : null);
    }).catch((e) => {
      setError(e instanceof Error ? e.message : '排行榜加载失败，请稍后重试');
      setEntries([]);
      setPlayerEntry(null);
    }).finally(() => setLoading(false));
  }, [scope, type, player.classCode]);

  const tabs: { key: LeaderboardType; label: string; icon: string }[] = [
    { key: 'power', label: '战力榜', icon: '🏆' },
    { key: 'streak', label: '连击榜', icon: '⚡' },
    { key: 'progress', label: '通关榜', icon: '🗺️' },
    { key: 'warrior', label: '勇者榜', icon: '🔥' },
    { key: 'wins', label: '近30天胜场', icon: '⚔️' },
    { key: 'ss_count', label: 'SS副本', icon: '🛡️' },
  ];

  const getTypeValue = (entry: LeaderboardEntry, t: LeaderboardType): string => {
    // 后端所有类型都返回 value 作为排序值，这里统一用它显示
    switch (t) {
      case 'power': return `${entry.value || 0} 分`;
      case 'streak': return `${entry.value || 0} 连击`;
      case 'progress': return `${entry.value || 0} 副本`;
      case 'wins': return `${entry.value || 0} 胜`;
      case 'ss_count': return `${entry.value || 0} 个`;
      case 'conquest': return `${entry.value || 0} 分`;
      case 'warrior': return `${entry.value || 0} 分`;
      default: return '';
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0015, #1a0a2e, #0a0a0a)',
      padding: '16px',
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button className="pixel-btn" onClick={() => navigate('/map')} style={{ fontSize: '11px' }}>
            ← 返回
          </button>
          <h2 style={{
            fontFamily: 'var(--pixel-font)', fontSize: '14px', color: 'var(--gold)',
          }}>
            🏆 排行榜
          </h2>
          <div style={{ width: '60px' }} />
        </div>

        {/* Scope toggle */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '12px',
          background: '#111', padding: '4px', border: '2px solid var(--border-pixel)',
        }}>
          <button
            className="pixel-btn"
            onClick={() => setScope('class')}
            style={{
              flex: 1, fontSize: '12px', padding: '6px',
              background: scope === 'class' ? 'var(--bg-card)' : 'transparent',
              borderColor: scope === 'class' ? 'var(--gold)' : 'transparent',
            }}
          >
            🏠 班级榜
          </button>
          <button
            className="pixel-btn"
            onClick={() => setScope('global')}
            style={{
              flex: 1, fontSize: '12px', padding: '6px',
              background: scope === 'global' ? 'var(--bg-card)' : 'transparent',
              borderColor: scope === 'global' ? 'var(--gold)' : 'transparent',
            }}
          >
            🌍 全服榜
          </button>
        </div>

        {/* Type tabs */}
        <div style={{
          display: 'flex', gap: '4px', marginBottom: '16px',
          flexWrap: 'wrap',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              className="pixel-btn"
              onClick={() => setType(tab.key)}
              style={{
                fontSize: '11px', padding: '6px 10px',
                background: type === tab.key ? 'var(--bg-card)' : 'transparent',
                borderColor: type === tab.key ? 'var(--exp-blue)' : 'transparent',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Player's own rank */}
        {playerEntry && (
          <div className="pixel-card pixel-border-gold" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontFamily: 'var(--pixel-font)', fontSize: '16px', color: 'var(--gold)' }}>
              #{playerEntry.rank}
            </span>
            <span>{SCHOOL_ICONS[playerEntry.school] || '🏯'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{playerEntry.displayName}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                {getRankName(playerEntry.school, playerEntry.rankTier)}
              </div>
            </div>
            <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '14px' }}>
              {getTypeValue(playerEntry, type)}
            </span>
          </div>
        )}

        {/* Leaderboard */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>加载中...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {entries.map((entry, i) => {
              const isTop3 = entry.rank <= 3;
              const isPlayer = playerEntry && entry.rank === playerEntry.rank && entry.displayName === playerEntry.displayName;
              return (
                <div
                  key={i}
                  className="pixel-card"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px',
                    borderColor: isPlayer ? 'var(--gold)' :
                                 isTop3 ? 'var(--gold-dark)' : 'var(--border-pixel)',
                    background: isPlayer ? 'rgba(255,215,0,0.05)' : undefined,
                    opacity: entry.rank > 50 ? 0.5 : 1,
                  }}
                >
                  {/* Rank */}
                  <span style={{
                    fontFamily: 'var(--pixel-font)', fontSize: '12px',
                    color: isTop3 ? 'var(--gold)' : 'var(--text-dim)',
                    minWidth: '30px',
                  }}>
                    {isTop3 ? ['🥇','🥈','🥉'][entry.rank - 1] : `#${entry.rank}`}
                  </span>

                  {/* School icon */}
                  <span style={{ fontSize: '16px' }}>
                    {SCHOOL_ICONS[entry.school] || '🏯'}
                  </span>

                  {/* Name + tier */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.displayName}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      {getRankName(entry.school, entry.rankTier)}
                    </div>
                  </div>

                  {/* Value */}
                  <span style={{
                    fontWeight: 700, fontSize: '12px',
                    color: isTop3 ? 'var(--gold)' : 'var(--text-light)',
                    whiteSpace: 'nowrap',
                  }}>
                    {getTypeValue(entry, type)}
                  </span>
                </div>
              );
            })}
            {error && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--hp-red)', fontSize: '13px' }}>
                ⚠️ {error}
              </div>
            )}
            {!error && entries.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                暂无排行数据
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
