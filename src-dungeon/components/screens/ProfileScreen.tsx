import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useDungeonStore } from '../../stores/dungeonStore';
import { getRankName, getSchoolPassive } from '../../utils/gameLogic';
import schoolsData from '../../data/schools.json';
import type { School, SchoolDefinition } from '../../types/dungeon';

const BADGE_RARITY_STARS: Record<string, { stars: string; color: string; label: string }> = {
  common:    { stars: '⭐',        color: '#999',     label: '普通' },
  rare:      { stars: '⭐⭐',       color: '#44cc44',  label: '稀有' },
  epic:      { stars: '⭐⭐⭐',      color: '#4488ff',  label: '史诗' },
  legendary: { stars: '⭐⭐⭐⭐',     color: '#aa44ff',  label: '传说' },
  mythic:    { stars: '🌟🌟🌟🌟🌟', color: '#ffaa00',  label: '神话' },
};

const BADGE_DEFS: Record<string, { name: string; desc: string; rarity: string; icon: string }> = {
  first_blood: { name: '初出茅庐', desc: '完成第一次答题', rarity: 'common', icon: '⚔️' },
  apprentice: { name: '修行学徒', desc: '累计答题10道', rarity: 'common', icon: '📜' },
  marathon: { name: '马拉松', desc: '累计答题100道', rarity: 'rare', icon: '🏃' },
  sharpshooter: { name: '神射手', desc: '最高连击达到10', rarity: 'rare', icon: '🎯' },
  combo_master: { name: '连击大师', desc: '最高连击达到30', rarity: 'epic', icon: '⚡' },
  unstoppable: { name: '势不可挡', desc: '最高连击达到50', rarity: 'legendary', icon: '🔥' },
  perfectionist: { name: '完美主义者', desc: '正确率超过95%', rarity: 'epic', icon: '💎' },
  speed_demon: { name: '速度之魂', desc: '获得SS评价', rarity: 'epic', icon: '💨' },
  time_lord: { name: '时间领主', desc: '获得3次SS评价', rarity: 'legendary', icon: '⏰' },
  first_clear: { name: '首通勇士', desc: '通关第一个副本', rarity: 'common', icon: '🏰' },
  dungeon_crawler: { name: '副本探索者', desc: '通关3个副本', rarity: 'rare', icon: '🗺️' },
  dungeon_master: { name: '副本大师', desc: '通关6个副本', rarity: 'epic', icon: '👑' },
  all_clear: { name: '全境守护者', desc: '通关全部8个副本', rarity: 'legendary', icon: '🌟' },
  flawless: { name: '无伤通关', desc: '完美通关1个副本', rarity: 'epic', icon: '🛡️' },
  immortal_dragon: { name: '不灭之龙', desc: '完美通关3个副本', rarity: 'legendary', icon: '🐉' },
  supreme_dragon: { name: '至尊龙神', desc: '完美通关全部副本', rarity: 'mythic', icon: '🔮' },
  rising_star: { name: '冉冉升起', desc: '段位达到第3段', rarity: 'common', icon: '⭐' },
  dragon_warrior: { name: '龙之战将', desc: '段位达到第5段', rarity: 'rare', icon: '⚔️' },
  dragon_lord: { name: '龙之君主', desc: '段位达到第7段', rarity: 'epic', icon: '👑' },
  dragon_god: { name: '龙神', desc: '段位达到第8段', rarity: 'legendary', icon: '🐲' },
  dedicated: { name: '坚持不懈', desc: '连续登录3天', rarity: 'common', icon: '📅' },
  devoted: { name: '忠心耿耿', desc: '连续登录7天', rarity: 'rare', icon: '💪' },
  immortal_dedication: { name: '永恒之志', desc: '连续登录30天', rarity: 'legendary', icon: '♾️' },
};

export default function ProfileScreen() {
  const navigate = useNavigate();
  const [changingSchool, setChangingSchool] = useState(false);
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

  // Group badges by rarity
  const badgesByRarity: Record<string, string[]> = {};
  earnedBadges.forEach(bid => {
    const def = BADGE_DEFS[bid];
    if (def) {
      if (!badgesByRarity[def.rarity]) badgesByRarity[def.rarity] = [];
      badgesByRarity[def.rarity].push(bid);
    }
  });

  const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'common'];

  const changeSchool = (nextSchool: School) => {
    if (nextSchool === player.school || hasChangedSchool) return;
    setSchool(nextSchool);
    localStorage.setItem(schoolChangeKey, 'true');
    saveToLocalStorage();
    setChangingSchool(false);
  };

  return (
    <div className="dungeon-page-bg dungeon-subpage" style={{
      minHeight: '100vh',
      backgroundImage: 'linear-gradient(180deg, rgba(5, 14, 13, 0.76), rgba(7, 12, 12, 0.94) 46%, rgba(7, 8, 9, 0.98)), url("/dungeon-art-v2/dungeon-04-bg.webp")',
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
            <span>💰 {player.gold} 金币</span>
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

        {rarityOrder.map(rarity => {
          const bids = badgesByRarity[rarity];
          if (!bids || bids.length === 0) return null;
          const rs = BADGE_RARITY_STARS[rarity];
          return (
            <div key={rarity} style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '13px', color: rs.color, marginBottom: '8px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span>{rs.stars}</span>
                <span style={{ fontSize: '11px', opacity: 0.8 }}>{rs.label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                {bids.map(bid => {
                  const def = BADGE_DEFS[bid];
                  if (!def) return null;
                  const isMythic = rarity === 'mythic';
                  const isLegendary = rarity === 'legendary';
                  return (
                    <div key={bid} className="pixel-card" style={{
                      padding: '14px 10px', textAlign: 'center',
                      borderColor: rs.color,
                      borderWidth: isMythic ? '3px' : isLegendary ? '2px' : '1px',
                      background: isMythic
                        ? `linear-gradient(135deg, rgba(255,170,0,0.1), rgba(255,170,0,0.02))`
                        : isLegendary
                          ? `linear-gradient(135deg, rgba(170,68,255,0.08), rgba(170,68,255,0.01))`
                          : undefined,
                      animation: isMythic ? 'mythicPulse 2s ease-in-out infinite' : undefined,
                      position: 'relative', overflow: 'hidden',
                    }}>
                      {isMythic && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                          background: 'linear-gradient(90deg, transparent, #ffaa00, #ffdd00, #ffaa00, transparent)',
                          animation: 'shine 2s linear infinite',
                        }} />
                      )}
                      <div style={{ fontSize: '28px', marginBottom: '6px' }}>{def.icon}</div>
                      <div style={{
                        fontSize: '12px', fontWeight: 700,
                        color: rs.color, marginBottom: '2px',
                      }}>
                        {def.name}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                        {def.desc}
                      </div>
                      <div style={{ fontSize: '12px', marginTop: '4px', letterSpacing: '2px' }}>
                        {rs.stars}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {earnedBadges.length === 0 && (
          <div className="pixel-card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏅</div>
            <div>还没有获得任何徽章</div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>去打副本吧！</div>
          </div>
        )}

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
                每赛季可更换 1 次。更换后段位积分、等级、副本进度都会保留，同时改变称号体系、流派外观和轻量被动效果。
              </div>
              {hasChangedSchool && (
                <div style={{
                  padding: '10px 12px',
                  marginBottom: 12,
                  border: '1px solid var(--hp-red)',
                  color: 'var(--hp-red)',
                  background: 'rgba(255,51,51,0.1)',
                  fontSize: 12,
                }}>
                  本赛季已经更换过流派。
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {schools.map(next => {
                  const selected = next.id === player.school;
                  const nextPassive = getSchoolPassive(next.id);
                  return (
                    <button
                      key={next.id}
                      disabled={selected || hasChangedSchool}
                      onClick={() => changeSchool(next.id)}
                      className="pixel-card"
                      style={{
                        textAlign: 'left',
                        cursor: selected || hasChangedSchool ? 'default' : 'pointer',
                        opacity: hasChangedSchool && !selected ? 0.45 : 1,
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
              <button className="pixel-btn" onClick={() => setChangingSchool(false)} style={{ width: '100%', marginTop: 14 }}>
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
