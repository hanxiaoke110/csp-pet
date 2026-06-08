import { usePetStore, FOODS, getLevelMilestone, formatPetDisplayName, getLevelBadgeColor } from '../../stores/petStore';
import { PET_TIERS, getPetTier, type OwnedPet } from '../../types/pet';
import { useQuizStore } from '../../stores/quizStore';
import PetSprite from './PetSprite';

interface Props {
  viewingPetId: string | null;
  setViewingPetId: (v: string | null) => void;
  openGroups: Set<string>;
  setOpenGroups: (v: Set<string>) => void;
  switchTarget: OwnedPet | null;
  setSwitchTarget: (v: OwnedPet | null) => void;
  renameCards: number;
  setRenameInput: (v: string) => void;
  setRenameModal: (v: boolean) => void;
  showToast: (msg: string) => void;
}

export default function PetStatus({
  viewingPetId, setViewingPetId, openGroups, setOpenGroups,
  switchTarget, setSwitchTarget, renameCards, setRenameInput, setRenameModal, showToast,
}: Props) {
  const { ownedPets, activePetId, coins, foods, pendingExp, pendingCoins, expPool } = usePetStore();
  const claimPendingRewards = usePetStore(s => s.claimPendingRewards);
  const weeklyTaskDone = useQuizStore(s => s.weeklyTaskDone);
  const setActivePet = usePetStore(s => s.setActivePet);
  const feedPet = usePetStore(s => s.feedPet);
  const allocateExpFromPool = usePetStore(s => s.allocateExpFromPool);

  const activePet = ownedPets.find(p => p.petId === activePetId);
  const displayPet = viewingPetId
    ? ownedPets.find(p => p.petId === viewingPetId) || activePet
    : activePet;
  const viewingPet = viewingPetId ? ownedPets.find(p => p.petId === viewingPetId) : null;

  return (
    <div className="pet-status">
      <div style={{ marginBottom: 8 }}>
        <div className="element-legend" style={{ marginBottom: 0 }}>🟫 地 · 🔴 火 · 🟢 风 · 🔵 水</div>
      </div>

      {displayPet && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, position: 'relative' }}>
          <PetSprite key={displayPet.modelPath} renderType={displayPet.renderType} modelPath={displayPet.modelPath} />
          {displayPet.level >= 1 && (
            <div style={{
              position: 'absolute', top: 0, right: 0,
              fontSize: 10, fontWeight: 700, color: getLevelBadgeColor(displayPet.level),
              background: `${getLevelBadgeColor(displayPet.level)}22`, borderRadius: '0 12px 0 8px',
              padding: '2px 8px', lineHeight: 1.4,
            }}>
              {getLevelMilestone(displayPet.level).title}
            </div>
          )}
        </div>
      )}

      <div className="pet-collection">
        {[
          { label: '👑 传说', pets: ownedPets.filter(p => getPetTier(p.speciesId) === 'legendary') },
          { label: '✨ 稀有', pets: ownedPets.filter(p => getPetTier(p.speciesId) === 'rare') },
          { label: '⭐ 普通', pets: ownedPets.filter(p => getPetTier(p.speciesId) === 'common') },
        ].filter(g => g.pets.length > 0).map(g => {
          const isOpen = openGroups.has(g.label);
          return (
            <div key={g.label} className="pet-group">
              <div className="pet-group-label" onClick={() => {
                const next = new Set(openGroups);
                isOpen ? next.delete(g.label) : next.add(g.label);
                setOpenGroups(next);
              }}>
                <span className="group-arrow">{isOpen ? '▼' : '▶'}</span>
                {g.label} ({g.pets.length})
              </div>
              {isOpen && (
                <div className="pet-group-grid">
                  {g.pets.map(p => {
                    const isActive = p.petId === activePetId;
                    const isSelected = p.petId === viewingPetId;
                    return (
                      <div key={p.petId}
                        className={`pet-mini-card ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => setViewingPetId(p.petId)}>
                        <div className="pet-mini-preview">
                          {p.speciesId.startsWith('workshop-') ? (
                            <span style={{ fontSize: 32, lineHeight: '48px' }}>
                              {p.element === 'earth' ? '🟫' : p.element === 'fire' ? '🔴' : p.element === 'wind' ? '🟢' : p.element === 'water' ? '🔵' : '🌟'}
                            </span>
                          ) : (
                            <img src={`/pet-sprites/previews/${p.speciesId}.png`} alt=""
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                          )}
                          {isActive && <div className="pet-mini-badge">伙伴</div>}
                        </div>
                        <div className="pet-mini-name">{formatPetDisplayName(p.petName, p.level)}</div>
                        <div className="pet-mini-level" style={{ color: getLevelBadgeColor(p.level) }}>{p.element === 'earth' ? '🟫' : p.element === 'fire' ? '🔴' : p.element === 'wind' ? '🟢' : '🔵'} Lv.{p.level}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {renameCards > 0 && displayPet && (
          <button className="rename-btn"
            onClick={() => {
              setRenameInput(displayPet.petName);
              setRenameModal(true);
            }}>
            📝 改名 (×{renameCards})
          </button>
        )}
      </div>

      {viewingPet && viewingPet.petId !== activePetId && (
        <div className="switch-prompt">
          <span>正在查看：{formatPetDisplayName(viewingPet.petName, viewingPet.level)} {viewingPet.element === 'earth' ? '🟫地' : viewingPet.element === 'fire' ? '🔴火' : viewingPet.element === 'wind' ? '🟢风' : '🔵水'} <span style={{ color: getLevelBadgeColor(viewingPet.level), fontWeight: 600 }}>Lv.{viewingPet.level}</span></span>
          <button className="switch-btn" onClick={() => setSwitchTarget(viewingPet)}>
            🔄 切换智子伙伴
          </button>
        </div>
      )}

      {switchTarget && (
        <div className="gacha-overlay" onClick={() => setSwitchTarget(null)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="buy-confirm-header">
              <span>🔄 切换智子伙伴</span>
              <button className="ai-modal-close" onClick={() => setSwitchTarget(null)}>✕</button>
            </div>
            <div className="buy-confirm-body">
              <div className="buy-confirm-preview">
                <img src={`/pet-sprites/previews/${switchTarget.speciesId}.png`} alt=""
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              </div>
              <div className="buy-confirm-info">
                <div className="buy-confirm-name">{formatPetDisplayName(switchTarget.petName, switchTarget.level)}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  {switchTarget.element === 'earth' ? '🟫 地' : switchTarget.element === 'fire' ? '🔴 火' : switchTarget.element === 'wind' ? '🟢 风' : '🔵 水'} · <span style={{ color: getLevelBadgeColor(switchTarget.level), fontWeight: 600 }}>Lv.{switchTarget.level}</span>
                </div>
              </div>
            </div>
            <div className="buy-confirm-actions">
              <button className="mode-btn mode-btn-back" onClick={() => setSwitchTarget(null)}>取消</button>
              <button className="mode-btn" onClick={() => {
                setActivePet(switchTarget.petId);
                showToast(`已切换智子伙伴为「${switchTarget.petName}」！`);
                setSwitchTarget(null);
              }}>确认切换</button>
            </div>
          </div>
        </div>
      )}

      {displayPet && (
        <>
          <div className="pet-stats">
            <div className="pet-stat-row">
              <span className="stat-name">等级</span>
              <span className="stat-value" style={{ color: getLevelBadgeColor(displayPet.level), fontWeight: 700 }}>Lv.{displayPet.level}</span>
              <div className="stat-bar"><div className="stat-fill exp" style={{ width: `${(displayPet.exp / displayPet.expToNext) * 100}%` }} /></div>
              <span className="stat-num">{displayPet.exp}/{displayPet.expToNext}</span>
              {expPool > 0 && (
                <button onClick={() => {
                  const amount = Math.min(expPool, displayPet.expToNext - displayPet.exp);
                  if (amount <= 0) { showToast('经验已满，升级后再来'); return; }
                  allocateExpFromPool(displayPet.petId, amount);
                  showToast(`已分配 ${amount} 经验给 ${formatPetDisplayName(displayPet.petName, displayPet.level)}`);
                }} style={{
                  padding: '2px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  background: '#ede9fe', border: '1px solid #7c3aed', borderRadius: 6, color: '#7c3aed',
                  marginLeft: 8, whiteSpace: 'nowrap',
                }}>📦 分配 {Math.min(expPool, displayPet.expToNext - displayPet.exp)} exp</button>
              )}
            </div>
            <div className="pet-stat-row">
              <span className="stat-name">🍖 饱食</span>
              <div className="stat-bar">
                <div className="stat-fill hunger" style={{ width: `${displayPet.hunger}%`, background: displayPet.hunger <= 20 ? '#ef4444' : displayPet.hunger <= 50 ? '#f59e0b' : '#22c55e' }} />
              </div>
              <span className="stat-num">{displayPet.hunger}/100{displayPet.hunger <= 0 ? ' 😿 严重饥饿' : displayPet.hunger <= 20 ? ' 该喂食了' : ''}</span>
            </div>
            <div className="pet-stat-row">
              <span className="stat-name">😊 心情</span>
              <div className="stat-bar"><div className="stat-fill mood" style={{ width: `${displayPet.mood}%` }} /></div>
              <span className="stat-num">{displayPet.mood}/100</span>
            </div>
            <div className="pet-stat-row">
              <span className="stat-name">💕 好感</span>
              <div className="stat-bar"><div className="stat-fill affection" style={{ width: `${displayPet.affection}%` }} /></div>
              <span className="stat-num">{displayPet.affection}/100</span>
            </div>
          </div>

          <div className="pet-coins">🪙 {coins} 金币 {expPool > 0 && <span style={{ color: '#818cf8', marginLeft: 8 }}>📦 {expPool} exp</span>}</div>

          {(pendingExp > 0 || pendingCoins > 0) && (
            <div className="pet-pending">
              🎁 待领取：+{pendingExp} EXP +{pendingCoins} 金币
              {weeklyTaskDone >= 5 ? (
                <button className="claim-btn" onClick={claimPendingRewards}
                  style={{ marginLeft: 8, padding: '4px 12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                  📥 领取奖励
                </button>
              ) : (
                <span className="pending-hint" style={{ marginLeft: 8 }}>🔒 完成本周选择题后领取</span>
              )}
            </div>
          )}

          <div className="pet-feed">
            <h4>🍖 喂食</h4>
            <div className="feed-grid">
              {Object.entries(FOODS).map(([id, f]) => (
                <button key={id} className="feed-btn" disabled={(foods[id] || 0) <= 0}
                  onClick={() => feedPet(displayPet!.petId, id)}>
                  <span>{f.icon}</span>
                  <span className="feed-name">{f.name}</span>
                  <span className="feed-effect">+{f.hunger}</span>
                  <span className="feed-stock">x{foods[id] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {activePet && (() => {
            const ms = getLevelMilestone(activePet.level);
            return (
              <div className="pet-evolve" style={{ borderColor: getLevelBadgeColor(activePet.level) }}>
                <h4 style={{ color: getLevelBadgeColor(activePet.level) }}>⭐ {ms.title}伙伴</h4>
                <p>Lv.{activePet.level} · {ms.dailyPassiveCoins > 0 ? `每周 +${ms.dailyPassiveCoins * 4}g` : ''} {ms.pityThreshold < 100 ? '· 保底 50 抽' : ''}</p>
                <p className="evolve-hint">继续学习提升等级解锁更多效果！</p>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
