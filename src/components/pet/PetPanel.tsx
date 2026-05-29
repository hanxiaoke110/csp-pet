import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { usePetStore, FOODS, getLevelMilestone, formatPetDisplayName, getLevelBadgeColor } from '../../stores/petStore';
import { useHatchStore } from '../../stores/hatchStore';
import type { HatchRarity } from '../../stores/hatchStore';
import { STARTER_PETS, ALL_SHOP_ITEMS, getPetConfig, PET_TIERS, getPetTier } from '../../types/pet';
import type { OwnedPet } from '../../types/pet';
import { validatePetName } from '../../utils/validateName';
import CeremonyModal from './CeremonyModal';
import PetSprite from './PetSprite';
import HatchConfirmModal from './HatchConfirmModal';
import HatchPanel from './HatchPanel';
import RaisingGuide from './RaisingGuide';

export default function PetPanel() {
  const { ownedPets, activePetId, coins, foods, pendingExp, pendingCoins } = usePetStore();
  const selectStarter = usePetStore(s => s.selectStarter);
  const setActivePet = usePetStore(s => s.setActivePet);
  const feedPet = usePetStore(s => s.feedPet);
  const spendCoins = usePetStore(s => s.spendCoins);
  const renamePet = usePetStore(s => s.renamePet);
  const renameCards = usePetStore(s => s.renameCards);
  const save = usePetStore(s => s.save);

  const [nameInput, setNameInput] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState('capi');
  const [ceremony, setCeremony] = useState<{
    type: 'summon' | 'hatch' | 'evolve';
    petName: string;
    element: string;
    icon: string;
    oldName?: string;
    newName?: string;
  } | null>(null);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'status' | 'shop' | 'hatch' | 'guide'>(searchParams.get('tab') === 'shop' ? 'shop' : 'status');
  const eggCount = useHatchStore(s => s.eggs.length);

  // Keep tab in sync with URL param
  useEffect(() => {
    if (searchParams.get('tab') === 'shop') setTab('shop');
  }, [searchParams]);

  // Listen for tab switch from pet window
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab === 'shop') setTab('shop');
    };
    window.addEventListener('switch-pet-tab', handler);
    return () => window.removeEventListener('switch-pet-tab', handler);
  }, []);
  const [viewingPetId, setViewingPetId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['👑 传说']));
  const [switchTarget, setSwitchTarget] = useState<OwnedPet | null>(null);
  const [renameModal, setRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [petWinVisible, setPetWinVisible] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };

  const activePet = ownedPets.find(p => p.petId === activePetId) || null;
  const viewingPet = ownedPets.find(p => p.petId === viewingPetId) || activePet;
  const displayPet = viewingPet || activePet;

  // Sync rename input when opening modal or switching pets
  useEffect(() => {
    if (displayPet) setRenameInput(displayPet.petName);
  }, [displayPet?.petId, renameModal]);

  // --- Starter selection screen ---
  if (ownedPets.length === 0) {
    return (
      <div className="pet-panel">
        <h2>🎒 选择你的初始伙伴</h2>
        <p className="pet-subtitle">选一只灵犀智子陪你一起学习 C++！</p>

        {/* Live preview of selected starter */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
          <PetSprite
            renderType={STARTER_PETS.find(s => s.speciesId === selectedSpecies)?.renderType}
            modelPath={STARTER_PETS.find(s => s.speciesId === selectedSpecies)?.modelPath}
          />
        </div>

        <div className="starter-grid">
          {STARTER_PETS.map(s => (
            <div
              key={s.speciesId}
              className={`starter-card ${selectedSpecies === s.speciesId ? 'selected' : ''}`}
              onClick={() => setSelectedSpecies(s.speciesId)}
            >
              <div className="starter-icon"><img src={`/pet-sprites/previews/${s.speciesId}.png`} alt={s.name} style={{width:48,height:48,imageRendering:'pixelated'}} onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} /></div>
              <div className="starter-name">{s.name}</div>
              <div className="starter-elem">
                {s.element === 'earth' ? '🟫 地' : s.element === 'fire' ? '🔴 火' : s.element === 'wind' ? '🟢 风' : '🔵 水'}
              </div>
              <div className="starter-style">2D 像素</div>
              <div className="starter-desc">{s.description}</div>
            </div>
          ))}
        </div>
        <div className="starter-form">
          <input
            className="pw-input" placeholder="给你的灵犀智子起个名字（1-8字）..." value={nameInput}
            onChange={e => {
              const v = e.target.value.slice(0, 8);
              setNameInput(v);
            }}
          />
          <button className="mode-btn" disabled={!!validatePetName(nameInput)}
            onClick={() => {
              const species = STARTER_PETS.find(s => s.speciesId === selectedSpecies);
              setCeremony({
                type: 'summon', petName: nameInput.trim(), element: species?.element || 'fire',
                icon: selectedSpecies,
              });
            }}>
            就决定是你了！
          </button>
        </div>
        {nameInput && validatePetName(nameInput) && (
          <p className="name-error">{validatePetName(nameInput)}</p>
        )}

        {ceremony && (
          <CeremonyModal
            type={ceremony.type}
            petName={ceremony.petName}
            petElement={ceremony.element}
            petIcon={ceremony.icon}
            oldName={ceremony.oldName}
            newName={ceremony.newName}
            onComplete={(finalName) => {
              selectStarter(selectedSpecies, finalName || ceremony.petName);
              save();
              setCeremony(null);
            }}
          />
        )}
      </div>
    );
  }

  // --- Pet management screen ---

  return (
    <div className="pet-panel">
      <div className="pet-tabs">
        <button className={`pet-tab ${tab === 'status' ? 'active' : ''}`} onClick={() => setTab('status')}>🐾 智子</button>
        <button className={`pet-tab ${tab === 'shop' ? 'active' : ''}`} onClick={() => setTab('shop')}>🛒 商城</button>
        <button className={`pet-tab ${tab === 'hatch' ? 'active' : ''}`} onClick={() => setTab('hatch')}>
          🐣 孵化中{eggCount > 0 && <span className="hatch-badge">{eggCount}</span>}
        </button>
        <button className={`pet-tab ${tab === 'guide' ? 'active' : ''}`} onClick={() => setTab('guide')}>📖 指南</button>
      </div>

      {tab === 'status' && (
        <div className="pet-status">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="element-legend" style={{ marginBottom: 0 }}>🟫 地 · 🔴 火 · 🟢 风 · 🔵 水</div>
            <button
              onClick={async () => {
                const result = await invoke('toggle_pet_window').catch(() => 'error');
                if (result === 'hidden') { setPetWinVisible(false); showToast('悬浮窗已隐藏'); }
                else if (result === 'shown') { setPetWinVisible(true); showToast('悬浮窗已显示'); }
                else showToast('操作失败');
              }}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600,
                background: '#fef3c7', border: '1px solid #f59e0b',
                borderRadius: 8, color: '#92400e', cursor: 'pointer',
              }}
            >
              🪟 {petWinVisible ? '隐藏悬浮窗' : '显示悬浮窗'}
            </button>
          </div>
          {/* Pet preview */}
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
          {/* Pet selector — grouped by rarity */}
          <div className="pet-collection">
            {[
              { label: '👑 传说', pets: ownedPets.filter(p => PET_TIERS[p.speciesId] === 'legendary') },
              { label: '✨ 稀有', pets: ownedPets.filter(p => PET_TIERS[p.speciesId] === 'rare') },
              { label: '⭐ 普通', pets: ownedPets.filter(p => (PET_TIERS[p.speciesId] || 'common') === 'common') },
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
                            <img src={`/pet-sprites/previews/${p.speciesId}.png`} alt=""
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
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
            )})}
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

          {/* Switch button — shown when viewing a non-active pet */}
          {viewingPet && viewingPet.petId !== activePetId && (
            <div className="switch-prompt">
              <span>正在查看：{formatPetDisplayName(viewingPet.petName, viewingPet.level)} {viewingPet.element === 'earth' ? '🟫地' : viewingPet.element === 'fire' ? '🔴火' : viewingPet.element === 'wind' ? '🟢风' : '🔵水'} <span style={{ color: getLevelBadgeColor(viewingPet.level), fontWeight: 600 }}>Lv.{viewingPet.level}</span></span>
              <button className="switch-btn" onClick={() => setSwitchTarget(viewingPet)}>
                🔄 切换智子伙伴
              </button>
            </div>
          )}

          {/* Switch modal */}
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
                  <button className="mode-btn"
                    onClick={() => {
                      setActivePet(switchTarget.petId);
                      showToast(`已切换智子伙伴为「${switchTarget.petName}」！`);
                      setSwitchTarget(null);
                    }}>
                    确认切换
                  </button>
                </div>
              </div>
            </div>
          )}

          {displayPet && (
            <>
              {/* Stats */}
              <div className="pet-stats">
                <div className="pet-stat-row">
                  <span className="stat-name">等级</span>
                  <span className="stat-value" style={{ color: getLevelBadgeColor(displayPet.level), fontWeight: 700 }}>Lv.{displayPet.level}</span>
                  <div className="stat-bar"><div className="stat-fill exp" style={{ width: `${(displayPet.exp / displayPet.expToNext) * 100}%` }} /></div>
                  <span className="stat-num">{displayPet.exp}/{displayPet.expToNext}</span>
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

              <div className="pet-coins">🪙 {coins} 金币</div>

              {(pendingExp > 0 || pendingCoins > 0) && (
                <div className="pet-pending">
                  🎁 待领取：+{pendingExp} EXP +{pendingCoins} 金币
                  <span className="pending-hint">（完成本周选择题后发放）</span>
                </div>
              )}

              {/* Feed */}
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

              {/* Level milestone */}
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
      )}

      {tab === 'shop' && (
        <ShopPanel coins={coins} ownedPets={ownedPets} spendCoins={spendCoins} setTab={setTab} />
      )}

      {tab === 'hatch' && <HatchPanel />}

      {tab === 'guide' && <RaisingGuide />}

      {/* Rename modal */}
      {renameModal && displayPet && (
        <div className="gacha-overlay" key={displayPet.petId} onClick={() => setRenameModal(false)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="buy-confirm-header">
              <span>📝 修改名字</span>
              <button className="ai-modal-close" onClick={() => setRenameModal(false)}>✕</button>
            </div>
            <div className="buy-confirm-body">
              <div className="buy-confirm-info">
                <div className="buy-confirm-name">{formatPetDisplayName(displayPet.petName, displayPet.level)}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>当前名字</div>
              </div>
              <div className="buy-confirm-name-row">
                <label className="buy-confirm-label">新名字（1-8字，中文/英文/数字）：</label>
                <input className="pw-input" value={renameInput}
                  onChange={e => setRenameInput(e.target.value.slice(0, 8))}
                  onKeyDown={e => { if (e.key === 'Enter') {
                    const err = renamePet(displayPet!.petId, renameInput.trim());
                    if (!err) { showToast('改名成功！'); setRenameModal(false); }
                    else showToast(err);
                  }}} autoFocus />
              </div>
              {(() => {
                const v = renameInput.trim();
                if (!v) return <p className="name-error">请输入新名字</p>;
                if (v.length < 1) return <p className="name-error">请输入名字</p>;
                if (v.length > 8) return <p className="name-error">名字最多 8 个字</p>;
                if (!/^[一-龥a-zA-Z0-9]+$/.test(v)) return <p className="name-error">只能使用中文、英文和数字</p>;
                return null;
              })()}
              <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
                消耗 1 张改名卡（剩余 {renameCards} 张）
              </div>
            </div>
            <div className="buy-confirm-actions">
              <button className="mode-btn mode-btn-back" onClick={() => setRenameModal(false)}>取消</button>
              <button className="mode-btn"
                disabled={(() => { const v = renameInput.trim(); return !v || v.length < 2 || v.length > 8 || !/^[一-龥a-zA-Z0-9]+$/.test(v); })()}
                onClick={() => {
                  const err = renamePet(displayPet!.petId, renameInput.trim());
                  if (!err) {
                    showToast('改名成功！');
                    setRenameModal(false);
                  } else {
                    showToast(err);
                  }
                }}>
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="milestone-toast">{toastMsg}</div>}
    </div>
  );
}

// ─── Shop sub-component ───
function ShopPanel({ coins, ownedPets, spendCoins, setTab }: {
  coins: number; ownedPets: any[]; spendCoins: (a: number) => boolean; setTab: (t: 'status' | 'shop' | 'hatch' | 'guide') => void;
}) {
  const [shopTab, setShopTab] = useState<'food' | 'common' | 'rare' | 'legend' | 'special'>('food');
  const [buyConfirm, setBuyConfirm] = useState<{ speciesId: string; name: string; price: number; icon: string } | null>(null);
  const [pendingHatch, setPendingHatch] = useState<{ speciesId: string; petName: string; rarity: HatchRarity } | null>(null);
  const [buyNameInput, setBuyNameInput] = useState('');
  const [foodConfirm, setFoodConfirm] = useState<any>(null);
  const [shopToast, setShopToast] = useState<string | null>(null);
  const showShopToast = (msg: string) => { setShopToast(msg); setTimeout(() => setShopToast(null), 3000); };
  const [actionConfirm, setActionConfirm] = useState<{ type: 'rename' | 'gacha'; title: string; desc: string; price: number } | null>(null);
  const renameCards = usePetStore(s => s.renameCards);
  const rollGacha = usePetStore(s => s._rollGacha);
  const gachaPulls = usePetStore(s => s.gachaDailyPulls);
  const buyRenameCard = usePetStore(s => s.buyRenameCard);
  const addEgg = useHatchStore(s => s.addEgg);
  const startHatching = useHatchStore(s => s.startHatching);
  const isOwned = usePetStore(s => s.isOwned);

  const allPets = ALL_SHOP_ITEMS.filter(i => i.itemType === 'pet');
  const commons = allPets.filter(i => (PET_TIERS[i.speciesId!] || 'common') === 'common');
  const rares = allPets.filter(i => PET_TIERS[i.speciesId!] === 'rare');
  const legends = allPets.filter(i => PET_TIERS[i.speciesId!] === 'legendary');

  const currentPets = shopTab === 'common' ? commons : shopTab === 'rare' ? rares : shopTab === 'legend' ? legends : [];

  const tabs = [
    { key: 'food', label: '🍖 食物' },
    { key: 'common', label: '⭐ 普通' },
    { key: 'rare', label: '✨ 稀有' },
    { key: 'legend', label: '👑 传说' },
    { key: 'special', label: '🎁 特殊' },
  ] as const;

  return (
    <div className="pet-shop">
      <div className="element-legend">🟫 地 · 🔴 火 · 🟢 风 · 🔵 水</div>
      <div className="shop-header">
        <span className="shop-coins">🪙 {coins} 金币</span>
        {renameCards > 0 && <span className="shop-coins" style={{fontSize:13}}>📝 ×{renameCards}</span>}
      </div>

      {shopToast && <div className="milestone-toast" style={{ position: 'fixed', top: 60, bottom: 'auto' }}>{shopToast}</div>}

      <div className="shop-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`shop-tab ${shopTab === t.key ? 'active' : ''}`}
            onClick={() => setShopTab(t.key as any)}>{t.label}</button>
        ))}
      </div>

      {/* Food tab */}
      {shopTab === 'food' && (
        <div className="shop-food-grid">
          {Object.entries(FOODS).map(([id, f]) => (
            <div key={id} className="shop-card">
              <span style={{ fontSize: 40 }}>{f.icon}</span>
              <div className="shop-card-name">{f.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>饱食 +{f.hunger}</div>
              <button className="shop-card-buy" disabled={coins < f.price}
                onClick={() => setFoodConfirm({ id, name: f.name, price: f.price, hunger: f.hunger, icon: f.icon })}>
                🪙 {f.price}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Common / Rare / Legend tabs */}
      {['common', 'rare', 'legend'].includes(shopTab) && (
        <div className="shop-pet-grid">
          {currentPets.map(item => {
            const owned = isOwned(item.speciesId!);
            const config = getPetConfig(item.speciesId!);
            const elemIcon = config?.element === 'earth' ? '🟫' : config?.element === 'fire' ? '🔴' : config?.element === 'wind' ? '🟢' : '🔵';
            return (
              <div key={item.itemId} className={`shop-card ${owned ? 'owned' : ''}`}>
                <div className="shop-card-preview">
                  <img src={`/pet-sprites/previews/${item.speciesId}.png`} alt=""
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                  {owned && <div className="shop-card-owned">已拥有</div>}
                </div>
                <div className="shop-card-name">{elemIcon} {item.name}</div>
                <button className="shop-card-buy" disabled={owned || coins < item.price}
                  onClick={() => {
                    if (owned) return;
                    setBuyConfirm({ speciesId: item.speciesId!, name: item.name, price: item.price, icon: elemIcon });
                    setBuyNameInput(item.name);
                  }}>
                  {owned ? '✅ 已拥有' : `🪙 ${item.price}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Special tab */}
      {shopTab === 'special' && (
        <div className="special-grid">
          {/* Rename Card */}
          <div className="special-card">
            <div className="special-icon">📝</div>
            <h4>改名卡</h4>
            <p>给任意一只宠物重新起名</p>
            <div className="special-stock">拥有：{renameCards} 张</div>
            <button className="shop-card-buy" disabled={coins < 200}
              onClick={() => setActionConfirm({ type: 'rename', title: '改名卡', desc: '给一只灵犀智子改名字', price: 200 })}>
              🪙 200 购买
            </button>
          </div>

          {/* Gacha */}
          <div className="special-card">
            <div className="special-icon">🎰</div>
            <h4>灵犀抽卡</h4>
            <p>随机获得一只宠物<br />每 100 抽必出稀有+</p>
            <div className="special-stock">今日剩余：{5 - gachaPulls} 次</div>
            <button className="shop-card-buy" disabled={coins < 200 || gachaPulls >= 5}
              onClick={() => setActionConfirm({ type: 'gacha', title: '灵犀抽卡', desc: '随机获得一只灵犀智子\n每 100 抽必出稀有+', price: 200 })}>
              🎯 单抽 200g
            </button>
          </div>
        </div>
      )}

      {/* Purchase confirmation modal */}
      {buyConfirm && (
        <div className="gacha-overlay" onClick={() => setBuyConfirm(null)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="buy-confirm-header">
              <span>🛒 确认购买</span>
              <button className="ai-modal-close" onClick={() => setBuyConfirm(null)}>✕</button>
            </div>
            <div className="buy-confirm-body">
              <div className="buy-confirm-preview">
                <img src={`/pet-sprites/previews/${buyConfirm.speciesId}.png`} alt=""
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              </div>
              <div className="buy-confirm-info">
                <div className="buy-confirm-name">{buyConfirm.icon} {buyConfirm.name}</div>
                <div className="buy-confirm-price">🪙 {buyConfirm.price} 金币</div>
                <div className="buy-confirm-balance">当前余额：🪙 {coins} 金币</div>
              </div>
              <div className="buy-confirm-name-row">
                <label className="buy-confirm-label">给灵犀智子起个名字：</label>
                <input
                  className="pw-input"
                  value={buyNameInput}
                  onChange={e => setBuyNameInput(e.target.value.slice(0, 8))}
                  placeholder="1-8个字"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const name = buyNameInput.trim();
                      if (!name || name.length < 1) { showShopToast('请输入名字'); return; }
                      if (name.length > 8) { showShopToast('名字最多 8 个字'); return; }
                      const tier = getPetTier(buyConfirm.speciesId);
                      const ok = spendCoins(buyConfirm.price);
                      if (!ok) { showShopToast('金币不足，无法购买。'); setBuyConfirm(null); return; }
                      setPendingHatch({ speciesId: buyConfirm.speciesId, petName: name, rarity: tier as HatchRarity });
                      setBuyConfirm(null);
                    }
                  }}
                />
              </div>
              {(() => {
                const err = validatePetName(buyNameInput, ownedPets.map(p => p.petName));
                return err ? <p className="name-error">{err}</p> : null;
              })()}
            </div>
            <div className="buy-confirm-actions">
              <button className="mode-btn mode-btn-back" onClick={() => setBuyConfirm(null)}>取消</button>
              <button className="mode-btn"
                disabled={!!validatePetName(buyNameInput, ownedPets.map(p => p.petName))}
                onClick={() => {
                  const name = buyNameInput.trim();
                  if (!name) return;
                  const tier = getPetTier(buyConfirm.speciesId);
                  const ok = spendCoins(buyConfirm.price);
                  if (!ok) { showShopToast('金币不足，无法购买。'); setBuyConfirm(null); return; }
                  setPendingHatch({ speciesId: buyConfirm.speciesId, petName: name, rarity: tier as HatchRarity });
                  setBuyConfirm(null);
                }}
              >
                确认购买 🪙 {buyConfirm.price}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Food purchase confirmation */}
      {foodConfirm && (
        <div className="gacha-overlay" onClick={() => setFoodConfirm(null)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="buy-confirm-header">
              <span>🍖 确认购买</span>
              <button className="ai-modal-close" onClick={() => setFoodConfirm(null)}>✕</button>
            </div>
            <div className="buy-confirm-body">
              <div style={{ fontSize: 48 }}>{foodConfirm.icon}</div>
              <div className="buy-confirm-name">{foodConfirm.name}</div>
              <div className="buy-confirm-price">🪙 {foodConfirm.price} 金币</div>
              <div style={{ fontSize: 13, color: '#22c55e' }}>回复饱食度 +{foodConfirm.hunger}</div>
              <div className="buy-confirm-balance">当前余额：🪙 {coins} 金币</div>
            </div>
            <div className="buy-confirm-actions">
              <button className="mode-btn mode-btn-back" onClick={() => setFoodConfirm(null)}>取消</button>
              <button className="mode-btn"
                onClick={() => {
                  if (spendCoins(foodConfirm.price)) {
                    usePetStore.setState(s => ({ foods: { ...s.foods, [foodConfirm.id]: (s.foods[foodConfirm.id] || 0) + 1 } }));
                    showShopToast(`成功购买「${foodConfirm.name}」！`);
                  } else {
                    showShopToast('金币不足，无法购买。');
                  }
                  setFoodConfirm(null);
                }}>
                确认购买 🪙 {foodConfirm.price}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action confirmation (rename card / gacha) */}
      {actionConfirm && (
        <div className="gacha-overlay" onClick={() => setActionConfirm(null)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="buy-confirm-header">
              <span>{actionConfirm.type === 'rename' ? '📝' : '🎰'} 确认购买</span>
              <button className="ai-modal-close" onClick={() => setActionConfirm(null)}>✕</button>
            </div>
            <div className="buy-confirm-body">
              <div style={{ fontSize: 48 }}>{actionConfirm.type === 'rename' ? '📝' : '🎰'}</div>
              <div className="buy-confirm-name">{actionConfirm.title}</div>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', whiteSpace: 'pre-line' }}>{actionConfirm.desc}</div>
              <div className="buy-confirm-price">🪙 {actionConfirm.price} 金币</div>
            </div>
            <div className="buy-confirm-actions">
              <button className="mode-btn mode-btn-back" onClick={() => setActionConfirm(null)}>取消</button>
              <button className="mode-btn"
                onClick={() => {
                  if (actionConfirm.type === 'rename') {
                    if (buyRenameCard()) {
                      showShopToast('成功购买改名卡！');
                    } else {
                      showShopToast('金币不足，无法购买。');
                    }
                  } else {
                    const r = rollGacha();
                    if (!r) { showShopToast('抽卡失败，请检查金币或今日次数。'); }
                    else if (r.rarity === 'refund') { showShopToast('该池精灵已集齐，金币已退还。'); }
                    else { setPendingHatch({ speciesId: r.item.speciesId!, petName: (r as any).autoName, rarity: r.rarity as HatchRarity }); }
                  }
                  setActionConfirm(null);
                }}>
                确认购买 🪙 {actionConfirm.price}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hatch confirmation modal */}
      {pendingHatch && (
        <HatchConfirmModal
          petName={pendingHatch.petName}
          rarity={pendingHatch.rarity}
          onStart={() => {
            const egg = addEgg(pendingHatch.speciesId, pendingHatch.petName, pendingHatch.rarity);
            startHatching(egg.eggId);
            setTab('hatch');
            setPendingHatch(null);
          }}
          onLater={() => {
            addEgg(pendingHatch.speciesId, pendingHatch.petName, pendingHatch.rarity);
            setPendingHatch(null);
          }}
          onClose={() => setPendingHatch(null)}
        />
      )}
    </div>
  );
}

