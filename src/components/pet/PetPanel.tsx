import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePetStore, formatPetDisplayName } from '../../stores/petStore';
import { useHatchStore } from '../../stores/hatchStore';
import { STARTER_PETS } from '../../types/pet';
import type { OwnedPet } from '../../types/pet';
import { validatePetName } from '../../utils/validateName';
import { safeListen } from '../../lib/tauriEvents';
import CeremonyModal from './CeremonyModal';
import PetSprite from './PetSprite';
import HatchPanel from './HatchPanel';
import RaisingGuide from './RaisingGuide';
import PetSettings from './PetSettings';
import WishWall from './WishWall';
import PetStatus from './PetStatus';
import { WorkshopShop } from './WorkshopShop';
import { ShopPanel } from './ShopPanel';

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
  const [tab, setTab] = useState<'status' | 'shop' | 'hatch' | 'guide' | 'settings' | 'wish' | 'workshop'>(searchParams.get('tab') === 'shop' ? 'shop' : 'status');
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
    const cleanups = [
      safeListen('pet-visibility-toggled', (e: any) => {
        if (typeof e.payload?.visible === 'boolean') setPetWinVisible(e.payload.visible);
        else setPetWinVisible(prev => !prev);
      }),
      safeListen('pet-window-visibility', (e: any) => {
        if (typeof e.payload?.visible === 'boolean') setPetWinVisible(e.payload.visible);
      }),
    ];
    return () => cleanups.forEach(fn => fn());
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
        <button className={`pet-tab ${tab === 'workshop' ? 'active' : ''}`} onClick={() => setTab('workshop')}>🏭 工坊</button>
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
      {tab === 'workshop' && <WorkshopShop />}

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
