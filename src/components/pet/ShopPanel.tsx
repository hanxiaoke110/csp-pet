import { useState } from 'react';
import { usePetStore, FOODS } from '../../stores/petStore';
import { useHatchStore } from '../../stores/hatchStore';
import type { HatchRarity } from '../../stores/hatchStore';
import { ALL_SHOP_ITEMS, getPetConfig, PET_TIERS, getPetTier } from '../../types/pet';
import { validatePetName } from '../../utils/validateName';
import { addTickets, canBuyTickets } from '../../utils/crypto';
import HatchConfirmModal from './HatchConfirmModal';

export function ShopPanel({ coins, ownedPets, spendCoins, setTab }: {
  coins: number; ownedPets: any[]; spendCoins: (a: number) => boolean; setTab: (t: 'status' | 'shop' | 'hatch' | 'guide' | 'settings') => void;
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
  const doGacha = usePetStore(s => s.doGacha);
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
            <button className="shop-card-buy" disabled={coins < 150 || gachaPulls >= 5}
              onClick={() => setActionConfirm({ type: 'gacha', title: '灵犀抽卡', desc: '随机获得精灵/食物/许愿票/改名卡\n每 100 抽保底传说', price: 150 })}>
              🎯 单抽 150g
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
                    const r = doGacha();
                    if (!r) { showShopToast('抽卡失败，请检查金币或今日次数。'); }
                    else if (r.type === 'food') {
                      const label = r.foodType === 'premium' ? '🍖 高级食物' : '🍞 普通食物';
                      showShopToast(`${label} 已放入背包！`);
                    } else if (r.type === 'wishTicket') {
                      showShopToast('🎫 许愿票 +1 已到账！');
                    } else if (r.type === 'renameCard') {
                      showShopToast('📝 改名卡已放入背包！');
                    } else {
                      setPendingHatch({ speciesId: r.item.speciesId!, petName: (r as any).autoName, rarity: r.rarity as HatchRarity });
                    }
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

