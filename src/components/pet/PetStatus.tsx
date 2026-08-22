import { usePetStore, FOODS, currentWeekKey, getLevelMilestone, getWeeklyPassiveCoinReward, formatPetDisplayName, getLevelBadgeColor } from '../../stores/petStore';
import { getPetTier, type OwnedPet, type PetElement } from '../../types/pet';
import { useQuizStore } from '../../stores/quizStore';
import { readFile, readTextFile, writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import PetSprite from './PetSprite';
import ModalPortal from '../ModalPortal';
import { useState, useEffect } from 'react';
import React from 'react';
import ConfirmModal from './ConfirmModal';
import { repairWorkshopSprite } from '../../utils/workshopSpriteRepair';

function WorkshopThumb({ modelPath }: { modelPath: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const id = modelPath.replace('.json', '').replace('/pet-sprites/2d/', '');
    const show = (buf: Uint8Array) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(buf)], { type: 'image/png' }));
      setUrl(objectUrl);
    };
    (async () => {
      // Fast path: pre-generated thumbnail from purchase time
      try {
        const buf = await readFile(`pet-sprites/2d/${id}-thumb.png`, { baseDir: BaseDirectory.AppData });
        show(buf);
        return;
      } catch { /* thumb missing — self-heal below */ }
      // Self-heal: crop the first frame of the cached spritesheet, persist it
      // as the thumbnail so older pets (bought before thumbnails existed) get one.
      try {
        const [pngBuf, jsonText] = await Promise.all([
          readFile(`pet-sprites/2d/${id}.png`, { baseDir: BaseDirectory.AppData }),
          readTextFile(`pet-sprites/2d/${id}.json`, { baseDir: BaseDirectory.AppData }),
        ]);
        const meta = JSON.parse(jsonText);
        const fw = meta.frameWidth || 192;
        const fh = meta.frameHeight || 208;
        const sheetUrl = URL.createObjectURL(new Blob([new Uint8Array(pngBuf)], { type: 'image/png' }));
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image(); i.onload = () => resolve(i); i.onerror = reject;
          i.src = sheetUrl;
        });
        URL.revokeObjectURL(sheetUrl);
        const canvas = document.createElement('canvas');
        canvas.width = 72;
        canvas.height = Math.round(72 * fh / fw);
        canvas.getContext('2d')!.drawImage(img, 0, 0, fw, fh, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '');
        const thumbBuf = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
        try { await writeFile(`pet-sprites/2d/${id}-thumb.png`, thumbBuf, { baseDir: BaseDirectory.AppData }); } catch {}
        show(thumbBuf);
      } catch {
        // Older purchases can survive while their AppData image cache does not.
        // Restore the same workshop pet instead of showing the old red-dot fallback.
        if (id && await repairWorkshopSprite(id)) {
          try {
            const buf = await readFile(`pet-sprites/2d/${id}-thumb.png`, { baseDir: BaseDirectory.AppData });
            show(buf);
            return;
          } catch { /* full sprite is restored and can be cropped next mount */ }
        }
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [modelPath]);
  if (!url) return React.createElement('span', {
    style: { fontSize: failed ? 22 : 18, lineHeight: '48px', color: '#94a3b8' },
    title: failed ? '素材暂未恢复，请联网后重试' : '正在恢复智子素材',
  }, failed ? '🖼️' : '···');
  return React.createElement('img', { src: url, alt: '', style: { width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' } });
}

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
  const [pendingElement, setPendingElement] = useState<PetElement | null>(null);
  const [recycleTarget, setRecycleTarget] = useState<string | null>(null);
  const [dismantleTarget, setDismantleTarget] = useState<string | null>(null);
  const { ownedPets, activePetId, coins, foods, pendingExp, pendingCoins, expPool } = usePetStore();
  const claimPendingRewards = usePetStore(s => s.claimPendingRewards);
  const weeklyTaskDone = useQuizStore(s => s.weeklyTaskDone);
  const setActivePet = usePetStore(s => s.setActivePet);
  const feedPet = usePetStore(s => s.feedPet);
  const allocateExpFromPool = usePetStore(s => s.allocateExpFromPool);
  const reforgeElement = usePetStore(s => s.reforgeElement);
  const recyclePet = usePetStore(s => s.recyclePet);
  const recycledPets = usePetStore(s => s.recycledPets);
  const restoreRecycledPet = usePetStore(s => s.restoreRecycledPet);
  const dismantleRecycledPet = usePetStore(s => s.dismantleRecycledPet);
  const autoFeederOwned = usePetStore(s => s.autoFeederOwned);
  const autoFeederEnabled = usePetStore(s => s.autoFeederEnabled);
  const setAutoFeederEnabled = usePetStore(s => s.setAutoFeederEnabled);
  const companionSlots = usePetStore(s => s.companionSlots);
  const desktopCompanionIds = usePetStore(s => s.desktopCompanionIds);
  const setDesktopCompanion = usePetStore(s => s.setDesktopCompanion);
  const weeklyPassiveClaimWeek = usePetStore(s => s.weeklyPassiveClaimWeek);
  const claimWeeklyPassiveCoins = usePetStore(s => s.claimWeeklyPassiveCoins);

  const activePet = ownedPets.find(p => p.petId === activePetId);
  const highestPetLevel = ownedPets.reduce((max, pet) => Math.max(max, pet.level), 0);
  const weeklyPassiveCoins = getWeeklyPassiveCoinReward(ownedPets);
  const weeklyPassiveClaimed = weeklyPassiveClaimWeek === currentWeekKey();
  const displayPet = viewingPetId
    ? ownedPets.find(p => p.petId === viewingPetId) || activePet
    : activePet;
  const viewingPet = viewingPetId ? ownedPets.find(p => p.petId === viewingPetId) : null;

  return (
    <div className="pet-status">
      <div style={{ marginBottom: 8 }}>
        <div className="element-legend" style={{ marginBottom: 0 }}>🟫 地 · 🔴 火 · 🟢 风 · 🔵 水 · 🌟 光</div>
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
          { label: '👑 传说', pets: ownedPets.filter(p => (p.tier || getPetTier(p.speciesId)) === 'legendary') },
          { label: '✨ 稀有', pets: ownedPets.filter(p => (p.tier || getPetTier(p.speciesId)) === 'rare') },
          { label: '⭐ 普通', pets: ownedPets.filter(p => (p.tier || getPetTier(p.speciesId)) === 'common') },
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
                        role="button"
                        tabIndex={0}
                        className={`pet-mini-card ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => setViewingPetId(p.petId)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setViewingPetId(p.petId);
                          }
                        }}>
                        <div className="pet-mini-preview">
                          {p.speciesId.startsWith('workshop-') ? (
                            React.createElement(WorkshopThumb, { modelPath: p.modelPath })
                          ) : (
                            <img src={`/pet-sprites/previews/${p.speciesId}.png`} alt=""
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                          )}
                          {isActive && <div className="pet-mini-badge">伙伴</div>}
                        </div>
                        <div className="pet-mini-name">{formatPetDisplayName(p.petName, p.level)}</div>
                        <div className="pet-mini-level" style={{ color: getLevelBadgeColor(p.level) }}>{p.element === 'earth' ? '🟫' : p.element === 'fire' ? '🔴' : p.element === 'wind' ? '🟢' : p.element === 'light' ? '🌟' : '🔵'} Lv.{p.level}</div>
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
        {displayPet && displayPet.petId !== activePetId && companionSlots > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {([2, 3] as const).filter(slot => slot <= companionSlots).map(slot => {
              const assigned = desktopCompanionIds[slot - 2] === displayPet.petId;
              // 单窗多宠架构：设置/收回只是更新 pet_data，桌宠窗口通过
              // pet-data-sync 事件自动增删智子，不再创建/销毁独立窗口。
              return (
                <button key={slot} onClick={async () => {
                  if (assigned) {
                    setDesktopCompanion(slot, null);
                    showToast(`已收回第 ${slot} 个桌面伙伴`);
                    return;
                  }
                  if (!setDesktopCompanion(slot, displayPet.petId)) { showToast('该智子已在其他桌面位置，或位置不可用'); return; }
                  // 桌宠窗口被隐藏时先唤出，避免“设置了但桌面上看不到”
                  await invoke('show_pet_window').catch(() => {});
                  showToast(`${displayPet.petName} 已出现在桌面上`);
                }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #a78bfa', color: '#6d28d9', background: assigned ? '#ede9fe' : '#fff', cursor: 'pointer', fontSize: 11 }}>
                  {assigned ? `收回桌面伙伴 ${slot}` : `设为桌面伙伴 ${slot}`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{
        margin: '12px 0', padding: '11px 13px', border: '1px solid #fde68a', borderRadius: 8,
        background: 'rgba(255,251,235,0.92)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 3 }}>🪙 每周修行津贴</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {weeklyPassiveCoins === 0
              ? `当前最高 Lv.${highestPetLevel}，达到 Lv.10 后解锁；每个账号每周只能领取一次。`
              : weeklyPassiveClaimed
                ? `本周 ${weeklyPassiveCoins} 金币已领取，下周一刷新；多只智子不会重复发放。`
                : `按最高等级智子计算，本周可领取 ${weeklyPassiveCoins} 金币；多只智子共用一次。`}
          </div>
        </div>
        <button
          disabled={weeklyPassiveCoins === 0 || weeklyPassiveClaimed}
          onClick={() => showToast(claimWeeklyPassiveCoins().message)}
          style={{
            minWidth: 116, padding: '7px 12px', border: 0, borderRadius: 6, fontWeight: 700,
            color: weeklyPassiveCoins === 0 || weeklyPassiveClaimed ? '#94a3b8' : '#fff',
            background: weeklyPassiveCoins === 0 || weeklyPassiveClaimed ? '#e2e8f0' : '#f59e0b',
            cursor: weeklyPassiveCoins === 0 || weeklyPassiveClaimed ? 'default' : 'pointer',
          }}
        >
          {weeklyPassiveCoins === 0 ? 'Lv.10 解锁' : weeklyPassiveClaimed ? '本周已领取' : `领取 ${weeklyPassiveCoins} 金币`}
        </button>
      </div>

      {viewingPet && viewingPet.petId !== activePetId && (
        <div className="switch-prompt">
          <span>正在查看：{formatPetDisplayName(viewingPet.petName, viewingPet.level)} {viewingPet.element === 'earth' ? '🟫地' : viewingPet.element === 'fire' ? '🔴火' : viewingPet.element === 'wind' ? '🟢风' : viewingPet.element === 'light' ? '🌟光' : '🔵水'} <span style={{ color: getLevelBadgeColor(viewingPet.level), fontWeight: 600 }}>Lv.{viewingPet.level}</span></span>
          <button className="switch-btn" onClick={() => setSwitchTarget(viewingPet)}>
            🔄 切换智子伙伴
          </button>
        </div>
      )}

      {switchTarget && (
        <ModalPortal>
        <div className="gacha-overlay" onClick={() => setSwitchTarget(null)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="buy-confirm-header">
              <span>🔄 切换智子伙伴</span>
              <button className="ai-modal-close" onClick={() => setSwitchTarget(null)}>✕</button>
            </div>
            <div className="buy-confirm-body">
              <div className="buy-confirm-preview">
                {switchTarget.speciesId.startsWith('workshop-') ? (
                  React.createElement(WorkshopThumb, { modelPath: switchTarget.modelPath })
                ) : (
                  <img src={`/pet-sprites/previews/${switchTarget.speciesId}.png`} alt=""
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                )}
              </div>
              <div className="buy-confirm-info">
                <div className="buy-confirm-name">{formatPetDisplayName(switchTarget.petName, switchTarget.level)}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  {switchTarget.element === 'earth' ? '🟫 地' : switchTarget.element === 'fire' ? '🔴 火' : switchTarget.element === 'wind' ? '🟢 风' : switchTarget.element === 'light' ? '🌟 光' : '🔵 水'} · <span style={{ color: getLevelBadgeColor(switchTarget.level), fontWeight: 600 }}>Lv.{switchTarget.level}</span>
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
        </ModalPortal>
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

          <div style={{ margin: '10px 0', padding: 10, border: '1px solid #dbeafe', borderRadius: 8, background: '#f8fbff', fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 7 }}>🌈 属性重铸</div>
            <div style={{ color: '#64748b', marginBottom: 8 }}>
              每只智子都有一次免费修改机会；之后每次 200 金币。光属性同样可直接选择。
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                ['earth', '🟫 地'], ['fire', '🔴 火'], ['wind', '🟢 风'], ['water', '🔵 水'], ['light', '🌟 光'],
              ] as [PetElement, string][]).map(([element, label]) => (
                <button key={element} disabled={displayPet.element === element} onClick={() => setPendingElement(element)}
                  style={{ border: '1px solid #bfdbfe', borderRadius: 5, background: displayPet.element === element ? '#dbeafe' : '#fff', padding: '4px 7px', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {pendingElement && (() => {
            const labels: Record<PetElement, string> = {
              earth: '🟫 地', fire: '🔴 火', wind: '🟢 风', water: '🔵 水', light: '🌟 光',
            };
            const cost = displayPet.freeElementChangeUsed ? 200 : 0;
            return (
              <ModalPortal>
              <div className="gacha-overlay" onClick={() => setPendingElement(null)}>
                <div className="buy-confirm-modal" onClick={event => event.stopPropagation()}>
                  <div className="buy-confirm-header">
                    <span>🌈 确认属性重铸</span>
                    <button className="ai-modal-close" onClick={() => setPendingElement(null)}>✕</button>
                  </div>
                  <div style={{ padding: '18px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
                      将「{displayPet.petName}」从 {labels[displayPet.element]} 修改为
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, margin: '10px 0', color: '#6d28d9' }}>
                      {labels[pendingElement]}
                    </div>
                    <div style={{ fontSize: 13, color: cost ? '#b45309' : '#15803d', fontWeight: 700 }}>
                      {cost ? `本次消耗 ${cost} 金币` : '本次使用免费修改机会'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>确认后立即生效，请核对属性。</div>
                  </div>
                  <div className="buy-confirm-actions">
                    <button className="mode-btn mode-btn-back" onClick={() => setPendingElement(null)}>取消</button>
                    <button className="mode-btn" onClick={() => {
                      const target = pendingElement;
                      setPendingElement(null);
                      const result = reforgeElement(displayPet.petId, target);
                      showToast(result.ok
                        ? `${displayPet.petName} 已调整为${labels[target]}属性${result.cost ? `，消耗 ${result.cost} 金币` : '，已使用免费机会'}`
                        : result.message || '修改失败');
                    }}>确认修改{cost ? ` · 🪙 ${cost}` : ''}</button>
                  </div>
                </div>
              </div>
              </ModalPortal>
            );
          })()}

          {autoFeederOwned && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '8px 0', fontSize: 12, color: '#166534' }}>
              <input type="checkbox" checked={autoFeederEnabled} onChange={e => setAutoFeederEnabled(e.target.checked)} />
              🤖 自动喂食器 {autoFeederEnabled ? '已开启' : '已关闭'}（饱食低于 40 自动喂食）
            </label>
          )}

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

          {ownedPets.length > 1 && (
            <button onClick={() => setRecycleTarget(displayPet.petId)} style={{ marginTop: 8, border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 6, padding: '5px 9px', fontSize: 12, cursor: 'pointer' }}>
              🗑 放入智子回收站
            </button>
          )}

          {recycledPets.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, border: '1px dashed #cbd5e1', borderRadius: 8, fontSize: 12 }}>
              <strong>🗑 智子回收站</strong>
              {recycledPets.map(record => (
                <div key={record.pet.petId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                  <span>{record.pet.petName} · 可返还 {record.returnedExp} EXP、{record.returnedCoins} 金币</span>
                  <button onClick={() => { restoreRecycledPet(record.pet.petId); showToast('已恢复智子'); }}>恢复</button>
                  <button onClick={() => setDismantleTarget(record.pet.petId)}>永久拆解</button>
                </div>
              ))}
            </div>
          )}

          {activePet && (() => {
            const ms = getLevelMilestone(activePet.level);
            return (
              <div className="pet-evolve" style={{ borderColor: getLevelBadgeColor(activePet.level) }}>
                <h4 style={{ color: getLevelBadgeColor(activePet.level) }}>⭐ {ms.title}伙伴</h4>
                <p>Lv.{activePet.level} · {ms.weeklyPassiveCoins > 0 ? `每周可领 ${ms.weeklyPassiveCoins}g` : ''} {ms.pityThreshold < 100 ? `· ${ms.pityThreshold} 抽保底` : ''}</p>
                <p className="evolve-hint">继续学习提升等级解锁更多效果！</p>
              </div>
            );
          })()}

          {recycleTarget && (
            <ConfirmModal
              icon="🗑" title="放入智子回收站"
              desc={`将「${ownedPets.find(p => p.petId === recycleTarget)?.petName ?? ''}」放入智子回收站？\n放入后可随时恢复；确认拆解才会返还资源。`}
              confirmText="放入回收站" danger
              onCancel={() => setRecycleTarget(null)}
              onConfirm={() => {
                const result = recyclePet(recycleTarget);
                showToast(result.ok ? '已放入智子回收站，可在本页恢复或拆解' : result.message || '操作失败');
                if (result.ok) setViewingPetId(null);
                setRecycleTarget(null);
              }}
            />
          )}

          {dismantleTarget && (
            <ConfirmModal
              icon="⚠️" title="永久拆解"
              desc="确认永久拆解？资源将返还到经验池和金币钱包，无法撤销。"
              confirmText="永久拆解" danger
              onCancel={() => setDismantleTarget(null)}
              onConfirm={() => {
                const result = dismantleRecycledPet(dismantleTarget);
                showToast(result.ok ? `已返还 ${result.exp} EXP、${result.coins} 金币` : '拆解失败');
                setDismantleTarget(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
