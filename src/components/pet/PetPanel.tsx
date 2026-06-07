import { useState, useEffect } from 'react';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { usePetStore, FOODS, formatPetDisplayName } from '../../stores/petStore';
import { useHatchStore } from '../../stores/hatchStore';
import type { HatchRarity } from '../../stores/hatchStore';
import { STARTER_PETS, ALL_SHOP_ITEMS, getPetConfig, PET_TIERS, getPetTier } from '../../types/pet';
import type { OwnedPet } from '../../types/pet';
import { validatePetName } from '../../utils/validateName';
import { addTickets, canBuyTickets } from '../../utils/crypto';
import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs';
import CeremonyModal from './CeremonyModal';
import PetSprite from './PetSprite';
import HatchConfirmModal from './HatchConfirmModal';
import HatchPanel from './HatchPanel';
import RaisingGuide from './RaisingGuide';
import PetSettings from './PetSettings';
import WishWall from './WishWall';
import PetStatus from './PetStatus';

export default function PetPanel() {
  const { ownedPets, activePetId, coins } = usePetStore();
  const selectStarter = usePetStore(s => s.selectStarter);
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
  const [tab, setTab] = useState<'status' | 'shop' | 'hatch' | 'guide' | 'settings' | 'wish'>(searchParams.get('tab') === 'shop' ? 'shop' : 'status');
  const eggCount = useHatchStore(s => s.eggs.length);
  const [newPetCount, setNewPetCount] = useState(() => {
    try { return JSON.parse(localStorage.getItem('csp_new_pets') || '[]').length; }
    catch { return 0; }
  });

  // Refresh new pet badge when ownedPets changes (new pet claimed)
  useEffect(() => {
    try {
      const count = JSON.parse(localStorage.getItem('csp_new_pets') || '[]').length;
      setNewPetCount(count);
    } catch {}
  }, [ownedPets]);

  // Keep tab in sync with URL param
  useEffect(() => {
    if (searchParams.get('tab') === 'shop') setTab('shop');
  }, [searchParams]);

  // Listen for visibility toggle from pet window action bar
  useEffect(() => {
    const unlisten = listen('pet-visibility-toggled', () => {
      setPetWinVisible(prev => !prev);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

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
  const [petSize, setPetSize] = useState(() => {
    try { return localStorage.getItem('csp_pet_size') || 'medium'; }
    catch { return 'medium'; }
  });
  const [roaming, setRoaming] = useState(() => {
    try { return localStorage.getItem('csp_pet_roaming') === 'true'; }
    catch { return false; }
  });
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
        <button className={`pet-tab ${tab === 'status' ? 'active' : ''}`} onClick={() => { setTab('status'); localStorage.removeItem('csp_new_pets'); setNewPetCount(0); }}>
          🐾 智子 {newPetCount > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>NEW</span>}
        </button>
        <button className={`pet-tab ${tab === 'shop' ? 'active' : ''}`} onClick={() => setTab('shop')}>🛒 商城</button>
        <button className={`pet-tab ${tab === 'hatch' ? 'active' : ''}`} onClick={() => setTab('hatch')}>
          🐣 孵化中{eggCount > 0 && <span className="hatch-badge">{eggCount}</span>}
        </button>
        <button className={`pet-tab ${tab === 'guide' ? 'active' : ''}`} onClick={() => setTab('guide')}>📖 指南</button>
        <button className={`pet-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>⚙️ 显示</button>
        <button className={`pet-tab ${tab === 'wish' ? 'active' : ''}`} onClick={() => setTab('wish')}>💡 许愿</button>
      </div>

      {tab === 'status' && (
        <PetStatus
          viewingPetId={viewingPetId} setViewingPetId={setViewingPetId}
          openGroups={openGroups} setOpenGroups={setOpenGroups}
          switchTarget={switchTarget} setSwitchTarget={setSwitchTarget}
          renameCards={renameCards} setRenameInput={setRenameInput}
          setRenameModal={setRenameModal} showToast={showToast}
        />
      )}
      {tab === 'shop' && (
        <ShopPanel coins={coins} ownedPets={ownedPets} spendCoins={spendCoins} setTab={setTab} />
      )}

      {tab === 'hatch' && <HatchPanel />}

      {tab === 'guide' && <RaisingGuide />}

      {tab === 'settings' && <PetSettings petSize={petSize} setPetSize={setPetSize} roaming={roaming} setRoaming={setRoaming} petWinVisible={petWinVisible} setPetWinVisible={setPetWinVisible} showToast={showToast} />}
      {tab === 'wish' && <WishWall />}

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
                const err = validatePetName(v);
                if (err) return <p className="name-error">{err}</p>;
                return null;
              })()}
              <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
                消耗 1 张改名卡（剩余 {renameCards} 张）
              </div>
            </div>
            <div className="buy-confirm-actions">
              <button className="mode-btn mode-btn-back" onClick={() => setRenameModal(false)}>取消</button>
              <button className="mode-btn"
                disabled={(() => { const v = renameInput.trim(); return !v || !!validatePetName(v); })()}
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
const WORKSHOP_API = 'https://api.cspstudy.top';

function WorkshopShop({ coins, spendCoins, setPendingHatch, showShopToast }: {
  coins: number; spendCoins: (a: number) => boolean; setPendingHatch: (p: any) => void; showShopToast: (m: string) => void;
}) {
  const [pets, setPets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isOwned = usePetStore(s => s.isOwned);

  useEffect(() => {
    fetch(WORKSHOP_API + '/api/workshop/pets')
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setPets(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleBuy = async (pet: any) => {
    if (isOwned('workshop-' + pet.id)) { showShopToast('已经拥有这只精灵了'); return; }
    const price = pet.price || 200;
    if (!spendCoins(price)) { showShopToast('金币不足'); return; }
    showShopToast('正在下载精灵素材...');
    try {
      // Download spritesheet & thumbnail
      const ssUrl = WORKSHOP_API + '/api/workshop/image?key=' + encodeURIComponent(pet.spritesheet_url || '');
      const ssResp = await fetch(ssUrl);
      const ssBuf = new Uint8Array(await ssResp.arrayBuffer());
      const petId = 'ws-' + pet.id;
      await writeFile('pet-sprites/2d/' + petId + '.png', ssBuf, { baseDir: BaseDirectory.AppData });
      // Save pet.json metadata
      let petJson = { frameWidth: 192, frameHeight: 208, maxFrames: 8, anims: { idle: 6 }, animOrder: ['idle'], durations: { idle: 1100 } };
      try { if (pet.pet_json) petJson = JSON.parse(pet.pet_json); } catch {}
      const jsonStr = JSON.stringify(petJson);
      await writeFile('pet-sprites/2d/' + petId + '.json', new TextEncoder().encode(jsonStr), { baseDir: BaseDirectory.AppData });
      // Start hatching
      const rarity = pet.tier === 'legendary' ? 'legendary' as const : pet.tier === 'rare' ? 'rare' as const : 'common' as const;
      setPendingHatch({ speciesId: 'workshop-' + pet.id, petName: pet.name, rarity });
      showShopToast('✅ 购买成功！请孵化');
    } catch (e: any) { showShopToast('下载失败: ' + (e.message || '网络错误')); }
  };

  if (loading) return React.createElement('div', { style: { textAlign: 'center', padding: 40, color: '#94a3b8' } }, '加载中...');
  if (!pets.length) return React.createElement('div', { style: { textAlign: 'center', padding: 40, color: '#94a3b8' } },
    '🏭 还没有老师上传精灵，敬请期待~');

  return React.createElement('div', { className: 'special-grid' },
    pets.map((pet: any) => React.createElement('div', { key: pet.id, className: 'special-card' },
      React.createElement('img', {
        src: WORKSHOP_API + '/api/workshop/image?key=' + encodeURIComponent(pet.thumbnail_url || pet.spritesheet_url || ''),
        style: { width: 80, height: 87, borderRadius: 8, objectFit: 'contain', background: '#f1f5f9' },
        onError: (e: any) => { e.target.style.display = 'none'; },
      }),
      React.createElement('h4', null, pet.name),
      React.createElement('p', { style: { fontSize: 11, color: '#94a3b8' } }, (pet.teacher_name || '未知老师') + ' · ' + (pet.element || '?')),
      React.createElement('button', {
        className: 'shop-card-buy',
        disabled: coins < (pet.price || 200) || isOwned('workshop-' + pet.id),
        onClick: () => handleBuy(pet),
      }, isOwned('workshop-' + pet.id) ? '已拥有' : '🪙 ' + (pet.price || 200) + ' 购买'),
    )),
  );
}

function ShopPanel({ coins, ownedPets, spendCoins, setTab }: {
  coins: number; ownedPets: any[]; spendCoins: (a: number) => boolean; setTab: (t: 'status' | 'shop' | 'hatch' | 'guide' | 'settings') => void;
}) {
  const [shopTab, setShopTab] = useState<'food' | 'common' | 'rare' | 'legend' | 'special' | 'workshop'>('food');
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
    { key: 'workshop', label: '🏭 工坊' },
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

          {/* Wish Tickets */}
          <div className="special-card" style={{ borderColor: '#7c3aed44' }}>
            <div className="special-icon">🎫</div>
            <h4>许愿票 ×1</h4>
            <p>给你喜欢的许愿投一票</p>
            <div className="special-stock">本周还可购买：{canBuyTickets(0).remaining} 张</div>
            <button className="shop-card-buy" disabled={coins < 100 || !canBuyTickets(1).allowed || !localStorage.getItem('csp_class_code')}
              title={!localStorage.getItem('csp_class_code') ? '请先在设置中绑定班级码' : ''}
              onClick={() => {
                if (!localStorage.getItem('csp_class_code')) { showShopToast('请先在设置中绑定班级码'); return; }
                if (!canBuyTickets(1).allowed) { showShopToast('本周许愿票已买完，下周再来吧'); return; }
                if (!spendCoins(100)) { showShopToast('金币不足'); return; }
                addTickets(1); window.dispatchEvent(new CustomEvent('tickets-updated'));
                showShopToast('🎫 +1 许愿票已到账');
              }}>
              {!canBuyTickets(1).allowed ? '📦 本周已满' : '🪙 100 购买'}
            </button>
          </div>

          <div className="special-card" style={{ borderColor: '#7c3aed66' }}>
            <div className="special-icon">🎫🎫🎫</div>
            <h4>许愿票 ×3</h4>
            <p>打包优惠！给你喜欢的许愿投 3 票</p>
            <div className="special-stock">省 50g</div>
            <button className="shop-card-buy" disabled={coins < 250 || !canBuyTickets(3).allowed || !localStorage.getItem('csp_class_code')}
              title={!localStorage.getItem('csp_class_code') ? '请先在设置中绑定班级码' : ''}
              onClick={() => {
                if (!localStorage.getItem('csp_class_code')) { showShopToast('请先在设置中绑定班级码'); return; }
                if (!canBuyTickets(3).allowed) { showShopToast('本周许愿票额度不足，还剩 ' + canBuyTickets(0).remaining + ' 张'); return; }
                if (!spendCoins(250)) { showShopToast('金币不足'); return; }
                addTickets(3); window.dispatchEvent(new CustomEvent('tickets-updated'));
                showShopToast('🎫 +3 许愿票已到账');
              }}>
              {!canBuyTickets(3).allowed ? '📦 额度不足' : '🪙 250 购买（省 50g）'}
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

      {/* Workshop tab */}
      {shopTab === 'workshop' && <WorkshopShop coins={coins} spendCoins={spendCoins} setPendingHatch={setPendingHatch} showShopToast={showShopToast} />}

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
                      const err = validatePetName(name, ownedPets.map(p => p.petName));
                      if (err) { showShopToast(err); return; }
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
          onClose={() => {
            addEgg(pendingHatch.speciesId, pendingHatch.petName, pendingHatch.rarity);
            setPendingHatch(null);
          }}
        />
      )}
    </div>
  );
}

