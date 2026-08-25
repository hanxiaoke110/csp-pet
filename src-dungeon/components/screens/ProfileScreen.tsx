import { useNavigate } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useDungeonStore } from '../../stores/dungeonStore';
import { usePetStore } from '../../../src/stores/petStore';
import { getRankName, getSchoolPassive } from '../../utils/gameLogic';
import schoolsData from '../../data/schools.json';
import type { School, SchoolDefinition } from '../../types/dungeon';
import DungeonConfirmModal from '../shared/DungeonConfirmModal';

const SCHOOL_CHANGE_COST = 300;

const BADGE_RARITY_STARS: Record<string, { stars: string; color: string; label: string }> = {
  common:    { stars: '⭐',        color: '#999',     label: '普通' },
  rare:      { stars: '⭐⭐',       color: '#44cc44',  label: '稀有' },
  epic:      { stars: '⭐⭐⭐',      color: '#4488ff',  label: '史诗' },
  legendary: { stars: '⭐⭐⭐⭐',     color: '#aa44ff',  label: '传说' },
  mythic:    { stars: '🌟🌟🌟🌟🌟', color: '#ffaa00',  label: '神话' },
};

const BADGE_DEFS: Record<string, { name: string; desc: string; rarity: string; icon: string; category: string }> = {
  first_blood: { name: '初出茅庐', desc: '累计答题1道', rarity: 'common', icon: '⚔️', category: 'answer' },
  apprentice: { name: '修行学徒', desc: '累计答题10道', rarity: 'common', icon: '📜', category: 'answer' },
  marathon: { name: '马拉松', desc: '累计答题100道', rarity: 'rare', icon: '🏃', category: 'answer' },
  sharpshooter: { name: '神射手', desc: '最高连击达到10', rarity: 'rare', icon: '🎯', category: 'combo' },
  combo_master: { name: '连击大师', desc: '最高连击达到30', rarity: 'epic', icon: '⚡', category: 'combo' },
  unstoppable: { name: '势不可挡', desc: '最高连击达到50', rarity: 'legendary', icon: '🔥', category: 'combo' },
  perfectionist: { name: '完美主义者', desc: '累计答题≥50道且正确率≥95%', rarity: 'epic', icon: '💎', category: 'answer' },
  speed_demon: { name: '速度之魂', desc: '1个副本获得SS评价', rarity: 'epic', icon: '💨', category: 'dungeon' },
  time_lord: { name: '时间领主', desc: '3个不同副本获得SS评价', rarity: 'legendary', icon: '⏰', category: 'dungeon' },
  first_clear: { name: '首通勇士', desc: '通关1个副本', rarity: 'common', icon: '🏰', category: 'dungeon' },
  dungeon_crawler: { name: '副本探索者', desc: '通关3个副本', rarity: 'rare', icon: '🗺️', category: 'dungeon' },
  dungeon_master: { name: '副本大师', desc: '通关6个副本', rarity: 'epic', icon: '👑', category: 'dungeon' },
  all_clear: { name: '全境守护者', desc: '通关全部8个副本', rarity: 'legendary', icon: '🌟', category: 'dungeon' },
  flawless: { name: '无伤通关', desc: '1个副本达到S或SS', rarity: 'epic', icon: '🛡️', category: 'dungeon' },
  immortal_dragon: { name: '不灭之龙', desc: '3个副本达到S或SS', rarity: 'legendary', icon: '🐉', category: 'dungeon' },
  supreme_dragon: { name: '至尊龙神', desc: '全部8个副本达到S或SS', rarity: 'mythic', icon: '🔮', category: 'dungeon' },
  rising_star: { name: '冉冉升起', desc: '段位达到第3段', rarity: 'common', icon: '⭐', category: 'rank' },
  dragon_warrior: { name: '龙之战将', desc: '段位达到第5段', rarity: 'rare', icon: '⚔️', category: 'rank' },
  dragon_lord: { name: '龙之君主', desc: '段位达到第7段', rarity: 'epic', icon: '👑', category: 'rank' },
  dragon_god: { name: '龙神', desc: '段位达到第8段', rarity: 'legendary', icon: '🐲', category: 'rank' },
  dedicated: { name: '坚持不懈', desc: '连续登录3天', rarity: 'common', icon: '📅', category: 'login' },
  devoted: { name: '忠心耿耿', desc: '连续登录7天', rarity: 'rare', icon: '💪', category: 'login' },
  immortal_dedication: { name: '永恒之志', desc: '连续登录30天', rarity: 'legendary', icon: '♾️', category: 'login' },
};

const BADGE_CATEGORIES = [
  { id: 'answer', label: '答题历练' },
  { id: 'combo', label: '连击挑战' },
  { id: 'dungeon', label: '副本征服' },
  { id: 'rank', label: '段位成长' },
  { id: 'login', label: '坚持修炼' },
];

export default function ProfileScreen() {
  const coins = usePetStore(s => s.coins);
  const spendCoins = usePetStore(s => s.spendCoins);
  const navigate = useNavigate();
  const [changingSchool, setChangingSchool] = useState(false);
  const [pendingSchool, setPendingSchool] = useState<School | null>(null);
  const [schoolChangeError, setSchoolChangeError] = useState('');
  const schoolChangeBusyRef = useRef(false);
  const player = useDungeonStore(s => s.player);
  const earnedBadges = useDungeonStore(s => s.earnedBadges);
  const progress = useDungeonStore(s => s.dungeonProgress);
  const weakPoints = useDungeonStore(s => s.weakPoints);
  const mistakeNotebook = useDungeonStore(s => s.mistakeNotebook);
  const startHealing = useDungeonStore(s => s.startHealing);
  const setSchool = useDungeonStore(s => s.setSchool);
  const saveToLocalStorage = useDungeonStore(s => s.saveToLocalStorage);

  const rankName = getRankName(player.school, player.rankTier);
  const schools = schoolsData as SchoolDefinition[];
  const school = schools.find(s => s.id === player.school);
  const passive = getSchoolPassive(player.school);
  const schoolChangeKey = `dungeon_school_changed_${player.season || 'default'}`;
  const hasChangedSchool = localStorage.getItem(schoolChangeKey) === 'true';
  const accuracy = player.totalAnswered > 0
    ? Math.round((player.totalCorrect / player.totalAnswered) * 100)
    : 0;
  const clearedCount = progress.filter(p => p.status === 'cleared').length;
  const earnedBadgeSet = new Set(earnedBadges);
  const ssDungeonCount = progress.filter(p => p.bossDefeated && p.bestRating === 'SS').length;
  const highRatingDungeonCount = progress.filter(p => p.bestRating === 'SS' || p.bestRating === 'S').length;

  const getBadgeProgress = (badgeId: string) => {
    const targets: Record<string, { current: number; target: number; unit: string }> = {
      first_blood: { current: player.totalAnswered, target: 1, unit: '道' },
      apprentice: { current: player.totalAnswered, target: 10, unit: '道' },
      marathon: { current: player.totalAnswered, target: 100, unit: '道' },
      sharpshooter: { current: player.maxStreak, target: 10, unit: '连击' },
      combo_master: { current: player.maxStreak, target: 30, unit: '连击' },
      unstoppable: { current: player.maxStreak, target: 50, unit: '连击' },
      speed_demon: { current: ssDungeonCount, target: 1, unit: '个副本' },
      time_lord: { current: ssDungeonCount, target: 3, unit: '个副本' },
      first_clear: { current: clearedCount, target: 1, unit: '个副本' },
      dungeon_crawler: { current: clearedCount, target: 3, unit: '个副本' },
      dungeon_master: { current: clearedCount, target: 6, unit: '个副本' },
      all_clear: { current: clearedCount, target: 8, unit: '个副本' },
      flawless: { current: highRatingDungeonCount, target: 1, unit: '个副本' },
      immortal_dragon: { current: highRatingDungeonCount, target: 3, unit: '个副本' },
      supreme_dragon: { current: highRatingDungeonCount, target: 8, unit: '个副本' },
      rising_star: { current: player.rankTier, target: 3, unit: '段' },
      dragon_warrior: { current: player.rankTier, target: 5, unit: '段' },
      dragon_lord: { current: player.rankTier, target: 7, unit: '段' },
      dragon_god: { current: player.rankTier, target: 8, unit: '段' },
      dedicated: { current: player.loginStreak, target: 3, unit: '天' },
      devoted: { current: player.loginStreak, target: 7, unit: '天' },
      immortal_dedication: { current: player.loginStreak, target: 30, unit: '天' },
    };
    if (badgeId === 'perfectionist') {
      const questionProgress = Math.min(player.totalAnswered, 50);
      const percent = Math.min(questionProgress / 50, accuracy / 95) * 100;
      return { label: `答题 ${questionProgress}/50 · 正确率 ${accuracy}%/95%`, percent };
    }
    const item = targets[badgeId];
    if (!item) return { label: '', percent: 0 };
    return {
      label: `${Math.min(item.current, item.target)}/${item.target} ${item.unit}`,
      percent: Math.min(100, item.current / item.target * 100),
    };
  };

  const changeSchool = (nextSchool: School) => {
    if (nextSchool === player.school || schoolChangeBusyRef.current) return;
    schoolChangeBusyRef.current = true;

    const freeChangeUsed = localStorage.getItem(schoolChangeKey) === 'true';
    const cost = freeChangeUsed ? SCHOOL_CHANGE_COST : 0;
    if (cost > 0 && !spendCoins(cost)) {
      setSchoolChangeError(`金币不足，需要 ${cost} 金币，当前只有 ${usePetStore.getState().coins} 金币。`);
      schoolChangeBusyRef.current = false;
      return;
    }

    setSchool(nextSchool);
    localStorage.setItem(schoolChangeKey, 'true');
    saveToLocalStorage();
    setPendingSchool(null);
    setSchoolChangeError('');
    setChangingSchool(false);
  };

  return (
    <div className="dungeon-page-bg dungeon-subpage" style={{
      minHeight: '100vh',
      backgroundImage: 'linear-gradient(180deg, rgba(5, 14, 13, 0.35), rgba(7, 12, 12, 0.62) 46%, rgba(6, 7, 8, 0.88)), url("/dungeon-art-v3/dungeon-04-bg.webp")',
      padding: '16px',
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Back */}
        <button className="pixel-btn" onClick={() => navigate('/map')} style={{ marginBottom: '16px', fontSize: '11px' }}>
          ← 返回地图
        </button>

        {/* Player card */}
        <div className="pixel-card pixel-border-gold" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span style={{ fontSize: '40px' }}>{school?.icon || '🏯'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '18px' }}>{player.displayName}</div>
              <div style={{ fontSize: '12px', color: school?.themeColor || 'var(--gold)' }}>
                {school?.name} · {rankName}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                {player.realName} · {player.classCode}
              </div>
            </div>
          </div>
          <button
            className="pixel-btn"
            onClick={() => setChangingSchool(true)}
            style={{ width: '100%', marginBottom: '12px', fontSize: '11px' }}
          >
            更换流派
          </button>

          <div className="pixel-card" style={{
            padding: '10px 12px',
            marginBottom: '12px',
            borderColor: school?.themeColor || 'var(--gold)',
            background: 'rgba(255,255,255,0.04)',
          }}>
            <div style={{ fontSize: 11, color: school?.themeColor || 'var(--gold)', fontWeight: 700 }}>
              被动：{passive.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>
              {passive.description}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div className="pixel-card" style={{ padding: '10px', textAlign: 'center', borderColor: 'var(--border-pixel)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>等级</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--exp-blue)' }}>{player.playerLevel}</div>
            </div>
            <div className="pixel-card" style={{ padding: '10px', textAlign: 'center', borderColor: 'var(--border-pixel)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>正确率</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--hp-green)' }}>{accuracy}%</div>
            </div>
            <div className="pixel-card" style={{ padding: '10px', textAlign: 'center', borderColor: 'var(--border-pixel)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>副本</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--gold)' }}>{clearedCount}/8</div>
            </div>
          </div>

          {/* EXP bar */}
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
              EXP: {player.exp}/{player.expToNext}
            </div>
            <div className="pixel-progress" style={{ height: '12px' }}>
              <div className="pixel-progress-fill exp" style={{
                width: `${(player.exp / player.expToNext) * 100}%`,
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '12px', fontSize: '11px', color: 'var(--text-dim)' }}>
            <span>💰 {coins} 通用金币</span>
            <span>📊 {player.totalAnswered} 题</span>
            <span>⚡ {player.maxStreak} 最高连击</span>
          </div>
        </div>

        {/* Weak Points + Mistake Notebook */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {/* Weak Points */}
          <div className="pixel-card" style={{ borderColor: 'var(--hp-red)' }}>
            <div style={{ fontFamily: 'var(--pixel-font)', fontSize: '10px', color: 'var(--hp-red)', marginBottom: '8px' }}>
              ⚠️ 弱点雷达
            </div>
            {Object.keys(weakPoints).length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>暂无弱点，继续加油！</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(weakPoints).sort(([,a], [,b]) => (b as number) - (a as number)).slice(0, 5).map(([kp, count]) => (
                  <div key={kp} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: '11px', padding: '4px 8px',
                    background: (count as number) >= 3 ? 'rgba(255,51,51,0.15)' : 'rgba(255,51,51,0.05)',
                    border: `1px solid ${(count as number) >= 3 ? 'var(--hp-red)' : '#442222'}`,
                  }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {kp}
                    </span>
                    <span style={{
                      color: (count as number) >= 3 ? 'var(--hp-red)' : 'var(--crit-yellow)',
                      fontWeight: 700, marginLeft: '8px',
                    }}>
                      ×{count as number}
                    </span>
                    {(count as number) >= 3 && (
                      <button
                        className="pixel-btn"
                        onClick={() => { startHealing(kp); navigate('/healing'); }}
                        style={{ fontSize: '9px', padding: '2px 6px', marginLeft: '6px' }}
                      >
                        🩹
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mistake Notebook */}
          <div className="pixel-card" style={{ borderColor: 'var(--crit-yellow)' }}>
            <div style={{ fontFamily: 'var(--pixel-font)', fontSize: '10px', color: 'var(--crit-yellow)', marginBottom: '8px' }}>
              📝 错题本
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--crit-yellow)', textAlign: 'center' }}>
              {mistakeNotebook.length}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center', marginTop: '2px' }}>
              道题待复习
            </div>
          </div>
        </div>

        {/* Badge wall */}
        <h3 style={{
          fontFamily: 'var(--pixel-font)', fontSize: '12px', color: 'var(--gold)',
          marginBottom: '12px',
        }}>
          🏅 成就徽章 ({earnedBadges.length}/{Object.keys(BADGE_DEFS).length})
        </h3>

        {BADGE_CATEGORIES.map(category => {
          const entries = Object.entries(BADGE_DEFS).filter(([, def]) => def.category === category.id);
          return (
            <div key={category.id} style={{ marginBottom: '18px' }}>
              <div style={{
                fontSize: '12px', color: 'var(--text-main)', marginBottom: '8px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span>{category.label}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                  {entries.filter(([id]) => earnedBadgeSet.has(id)).length}/{entries.length}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                {entries.map(([badgeId, def]) => {
                  const unlocked = earnedBadgeSet.has(badgeId);
                  const rs = BADGE_RARITY_STARS[def.rarity];
                  const badgeProgress = getBadgeProgress(badgeId);
                  return (
                    <div key={badgeId} className="pixel-card" style={{
                      padding: '12px', minHeight: 150,
                      borderColor: unlocked ? rs.color : 'var(--border-pixel)',
                      background: unlocked ? 'rgba(15, 36, 50, 0.94)' : 'rgba(12, 22, 31, 0.72)',
                      opacity: unlocked ? 1 : 0.72,
                      position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 24, filter: unlocked ? undefined : 'grayscale(1)' }}>{def.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: unlocked ? rs.color : 'var(--text-dim)' }}>
                            {def.name}
                          </div>
                          <div style={{ fontSize: 9, color: rs.color }}>{rs.label}</div>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: unlocked ? '#49d17d' : 'var(--text-dim)' }}>
                          {unlocked ? '已获得' : '未解锁'}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-main)', lineHeight: 1.5, minHeight: 30 }}>
                        {def.desc}
                      </div>
                      <div style={{ marginTop: 9, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${unlocked ? 100 : badgeProgress.percent}%`, height: '100%', background: unlocked ? '#49d17d' : rs.color }} />
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 5 }}>
                        {unlocked ? '条件已达成' : badgeProgress.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {changingSchool && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100002,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, background: 'rgba(0,0,0,0.78)',
          }}>
            <div className="pixel-card pixel-border-gold" style={{
              width: 'min(560px, calc(100vw - 40px))',
              maxHeight: 'calc(100vh - 40px)',
              overflowY: 'auto',
            }}>
              <div style={{
                fontFamily: 'var(--pixel-font)',
                fontSize: 13,
                color: 'var(--gold)',
                marginBottom: 8,
              }}>
                更换修行流派
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 14 }}>
                每赛季第一次更换免费，之后每次消耗 {SCHOOL_CHANGE_COST} 通用金币。更换后段位积分、等级、副本进度都会保留，同时改变称号体系、流派外观和轻量被动效果。
              </div>
              {hasChangedSchool && (
                <div style={{
                  padding: '10px 12px',
                  marginBottom: 12,
                  border: '1px solid var(--gold)',
                  color: 'var(--gold)',
                  background: 'rgba(255,170,0,0.08)',
                  fontSize: 12,
                }}>
                  本赛季免费机会已使用，后续每次更换需要 🪙 {SCHOOL_CHANGE_COST} 金币。当前余额：🪙 {coins}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {schools.map(next => {
                  const selected = next.id === player.school;
                  const nextPassive = getSchoolPassive(next.id);
                  return (
                    <button
                      key={next.id}
                      disabled={selected}
                      onClick={() => {
                        schoolChangeBusyRef.current = false;
                        setSchoolChangeError('');
                        setPendingSchool(next.id);
                      }}
                      className="pixel-card"
                      style={{
                        textAlign: 'left',
                        cursor: selected ? 'default' : 'pointer',
                        borderColor: selected ? next.themeColor : 'var(--border-pixel)',
                        background: selected ? next.bgGradient : 'var(--bg-card)',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 26 }}>{next.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: next.themeColor }}>
                            {next.name} · {next.subtitle}{selected ? ' · 当前' : ''}
                          </div>
                          {!selected && (
                            <div style={{ fontSize: 11, color: hasChangedSchool ? 'var(--gold)' : 'var(--hp-green)', marginTop: 4, fontWeight: 700 }}>
                              {hasChangedSchool ? `更换费用：🪙 ${SCHOOL_CHANGE_COST}` : '本次更换免费'}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: next.themeColor, marginTop: 4, fontWeight: 700 }}>
                            被动：{nextPassive.name} · {nextPassive.description}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>
                            {next.description.slice(0, 70)}...
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button className="pixel-btn" onClick={() => {
                schoolChangeBusyRef.current = false;
                setPendingSchool(null);
                setSchoolChangeError('');
                setChangingSchool(false);
              }} style={{ width: '100%', marginTop: 14 }}>
                关闭
              </button>
            </div>
          </div>
        )}

        {pendingSchool && (() => {
          const nextSchool = schools.find(item => item.id === pendingSchool);
          const cost = hasChangedSchool ? SCHOOL_CHANGE_COST : 0;
          const balanceAfter = Math.max(0, coins - cost);
          return (
            <DungeonConfirmModal
              title="确认更换修行流派"
              zIndex={100003}
              message={`${school?.name || '当前流派'} → ${nextSchool?.name || '目标流派'}。${cost > 0 ? `本次需要 ${cost} 通用金币，当前余额 ${coins}，更换后余额 ${balanceAfter}。` : '本次使用本赛季免费更换机会。'}等级、段位积分和副本进度都会保留。${schoolChangeError ? ` ${schoolChangeError}` : ''}`}
              confirmLabel={cost > 0 ? `支付 ${cost} 金币` : '确认免费更换'}
              onConfirm={() => changeSchool(pendingSchool)}
              onCancel={() => {
                schoolChangeBusyRef.current = false;
                setPendingSchool(null);
                setSchoolChangeError('');
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}
