import { useState } from 'react';
import { usePetStore, FOODS, getLevelMilestone } from '../../stores/petStore';
import { useHatchStore } from '../../stores/hatchStore';
import type { HatchRarity } from '../../stores/hatchStore';
import { ALL_SHOP_ITEMS, getPetConfig, PET_TIERS, getPetTier } from '../../types/pet';
import { validatePetName } from '../../utils/validateName';
import { addTickets, canBuyTickets } from '../../utils/crypto';
import HatchConfirmModal from './HatchConfirmModal';
import ModalPortal from '../ModalPortal';

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ShopPanel({ coins, ownedPets, spendCoins, setTab }: {
  coins: number; ownedPets: any[]; spendCoins: (a: number) => boolean; setTab: (t: 'status' | 'shop' | 'hatch' | 'guide' | 'settings') => void;
}) {
  const [shopTab, setShopTab] = useState<'food' | 'common' | 'rare' | 'legend' | 'special'>('food');
  const [buyConfirm, setBuyConfirm] = useState<{ speciesId: string; name: string; price: number; icon: string } | null>(null);
  const [pendingHatch, setPendingHatch] = useState<{ eggId: string; speciesId: string; petName: string; rarity: HatchRarity } | null>(null);
  const [buyNameInput, setBuyNameInput] = useState('');
  const [foodConfirm, setFoodConfirm] = useState<any>(null);
  const [shopToast, setShopToast] = useState<string | null>(null);
  const showShopToast = (msg: string) => { setShopToast(msg); setTimeout(() => setShopToast(null), 3000); };
  const [actionConfirm, setActionConfirm] = useState<{ type: 'rename' | 'gacha' | 'capsule' | 'core' | 'feeder'; icon: string; title: string; desc: string; price: number } | null>(null);
  const [gachaAnim, setGachaAnim] = useState<{ phase: 'rolling' | 'revealed'; result: NonNullable<ReturnType<typeof doGacha>> } | null>(null);
  const renameCards = usePetStore(s => s.renameCards);
  const doGacha = usePetStore(s => s.doGacha);
  const gachaHistory = usePetStore(s => s.gachaHistory);
  const gachaPulls = usePetStore(s => s.gachaDailyPulls);
  const gachaDate = usePetStore(s => s.gachaDate);
  const gachaPity = usePetStore(s => s.gachaPity);
  const activePetId = usePetStore(s => s.activePetId);
  const buyRenameCard = usePetStore(s => s.buyRenameCard);
  const autoFeederOwned = usePetStore(s => s.autoFeederOwned);
  const buyAutoFeeder = usePetStore(s => s.buyAutoFeeder);
  const expShopDate = usePetStore(s => s.expShopDate);
  const expCapsuleBought = usePetStore(s => s.expCapsuleBought);
  const expCoreBought = usePetStore(s => s.expCoreBought);
  const buyExpItem = usePetStore(s => s.buyExpItem);
  const addEgg = useHatchStore(s => s.addEgg);
  const startHatching = useHatchStore(s => s.startHatching);
  const isOwned = usePetStore(s => s.isOwned);
  const today = localDateKey();
  const todayGachaPulls = gachaDate === today ? gachaPulls : 0;
  const activePet = ownedPets.find(p => p.petId === activePetId);
  const pityThreshold = activePet ? getLevelMilestone(activePet.level).pityThreshold : 100;

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
      <div className="element-legend">🟫 地 · 🔴 火 · 🟢 风 · 🔵 水 · 🌟 光</div>
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
            const elemIcon = config?.element === 'earth' ? '🟫' : config?.element === 'fire' ? '🔴' : config?.element === 'wind' ? '🟢' : config?.element === 'light' ? '🌟' : '🔵';
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
              onClick={() => setActionConfirm({ type: 'rename', icon: '📝', title: '改名卡', desc: '给一只灵犀智子改名字', price: 200 })}>
              🪙 200 购买
            </button>
          </div>

          <div className="special-card" style={{ borderColor: '#0ea5e966' }}>
            <div className="special-icon">🧪</div>
            <h4>经验胶囊</h4>
            <p>向公共经验池注入 120 EXP</p>
            <div className="special-stock">每日限购：{expShopDate === today ? expCapsuleBought : 0}/3</div>
            <button className="shop-card-buy" disabled={coins < 400 || (expShopDate === today ? expCapsuleBought : 0) >= 3}
              onClick={() => setActionConfirm({ type: 'capsule', icon: '🧪', title: '经验胶囊', desc: '向公共经验池注入 120 EXP\n每日限购 3 次', price: 400 })}>
              🪙 400 购买
            </button>
          </div>

          <div className="special-card" style={{ borderColor: '#8b5cf666' }}>
            <div className="special-icon">💠</div>
            <h4>进阶经验核心</h4>
            <p>向公共经验池注入 360 EXP</p>
            <div className="special-stock">每日限购：{expShopDate === today ? expCoreBought : 0}/1</div>
            <button className="shop-card-buy" disabled={coins < 1000 || (expShopDate === today ? expCoreBought : 0) >= 1}
              onClick={() => setActionConfirm({ type: 'core', icon: '💠', title: '进阶经验核心', desc: '向公共经验池注入 360 EXP\n每日限购 1 次', price: 1000 })}>
              🪙 1000 购买
            </button>
          </div>

          <div className="special-card" style={{ borderColor: '#22c55e66' }}>
            <div className="special-icon">🤖</div>
            <h4>自动喂食器</h4>
            <p>饱食低于 40 时自动使用背包食物；没有食物每天提醒一次</p>
            <div className="special-stock">{autoFeederOwned ? '已拥有，可在智子页开关' : '永久道具'}</div>
            <button className="shop-card-buy" disabled={autoFeederOwned || coins < 1500}
              onClick={() => setActionConfirm({ type: 'feeder', icon: '🤖', title: '自动喂食器', desc: '饱食低于 40 时自动使用背包食物\n永久道具，购买后可在智子页开关', price: 1500 })}>
              {autoFeederOwned ? '✅ 已拥有' : '🪙 1500 购买'}
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
                if (!addTickets(1)) {
                  usePetStore.getState().addCoins(100);
                  showShopToast('许愿票写入失败，100 金币已原额退回');
                  return;
                }
                window.dispatchEvent(new CustomEvent('tickets-updated'));
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
                if (!addTickets(3)) {
                  usePetStore.getState().addCoins(250);
                  showShopToast('许愿票写入失败，250 金币已原额退回');
                  return;
                }
                window.dispatchEvent(new CustomEvent('tickets-updated'));
                showShopToast('🎫 +3 许愿票已到账');
              }}>
              {!canBuyTickets(3).allowed ? '📦 额度不足' : '🪙 250 购买（省 50g）'}
            </button>
          </div>

          {/* Gacha */}
          <div className="special-card">
            <div className="special-icon">🎰</div>
            <h4>灵犀抽卡</h4>
            <p>随机获得智子或养成道具<br />第 {pityThreshold} 抽前必出传说智子</p>
            <div className="special-stock">保底进度：{gachaPity}/{pityThreshold} · 今日剩余：{5 - todayGachaPulls} 次</div>
            <button className="shop-card-buy" disabled={coins < 150 || todayGachaPulls >= 5}
              onClick={() => setActionConfirm({ type: 'gacha', icon: '🎰', title: '灵犀抽卡', desc: `随机获得智子/食物/许愿票/改名卡\n当前保底 ${gachaPity}/${pityThreshold}，第 ${pityThreshold} 抽前必出传说智子`, price: 150 })}>
              🎯 单抽 150g
            </button>
          </div>
          {gachaHistory.length > 0 && (
            <div className="special-card" style={{ borderColor: '#cbd5e1', gridColumn: '1 / -1' }}>
              <h4>最近抽取记录</h4>
              {gachaHistory.slice(0, 5).map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#475569', padding: '4px 0' }}>
                  <span>{item.label}</span>
                  <span style={{ color: '#94a3b8' }}>{new Date(item.at).toLocaleString('zh-CN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Purchase confirmation modal */}
      {buyConfirm && (
        <ModalPortal>
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
                      const egg = addEgg(buyConfirm.speciesId, name, tier as HatchRarity, buyConfirm.price);
                      setPendingHatch({ eggId: egg.eggId, speciesId: buyConfirm.speciesId, petName: name, rarity: tier as HatchRarity });
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
                  const egg = addEgg(buyConfirm.speciesId, name, tier as HatchRarity, buyConfirm.price);
                  setPendingHatch({ eggId: egg.eggId, speciesId: buyConfirm.speciesId, petName: name, rarity: tier as HatchRarity });
                  setBuyConfirm(null);
                }}
              >
                确认购买 🪙 {buyConfirm.price}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Food purchase confirmation */}
      {foodConfirm && (
        <ModalPortal>
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
                    usePetStore.getState().save();
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
        </ModalPortal>
      )}

      {/* Action confirmation (rename card / gacha / exp items / feeder) */}
      {actionConfirm && (
        <ModalPortal>
        <div className="gacha-overlay" onClick={() => setActionConfirm(null)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="buy-confirm-header">
              <span>{actionConfirm.icon} 确认购买</span>
              <button className="ai-modal-close" onClick={() => setActionConfirm(null)}>✕</button>
            </div>
            <div className="buy-confirm-body">
              <div style={{ fontSize: 48 }}>{actionConfirm.icon}</div>
              <div className="buy-confirm-name">{actionConfirm.title}</div>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', whiteSpace: 'pre-line' }}>{actionConfirm.desc}</div>
              <div className="buy-confirm-price">🪙 {actionConfirm.price} 金币</div>
              <div className="buy-confirm-balance">当前余额：🪙 {coins} 金币</div>
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
                  } else if (actionConfirm.type === 'capsule') {
                    showShopToast(buyExpItem('capsule') ? '🧪 120 EXP 已放入经验池' : '今日购买次数已满或金币不足');
                  } else if (actionConfirm.type === 'core') {
                    showShopToast(buyExpItem('core') ? '💠 360 EXP 已放入经验池' : '今日购买次数已满或金币不足');
                  } else if (actionConfirm.type === 'feeder') {
                    showShopToast(buyAutoFeeder() ? '🤖 自动喂食器已安装并开启' : '金币不足');
                  } else {
                    const r = doGacha();
                    if (!r) { showShopToast('抽卡失败，请检查金币或今日次数。'); }
                    else {
                      setGachaAnim({ phase: 'rolling', result: r });
                      setTimeout(() => setGachaAnim(a => a ? { ...a, phase: 'revealed' } : null), 1500);
                    }
                  }
                  setActionConfirm(null);
                }}>
                确认购买 🪙 {actionConfirm.price}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Gacha pull animation + result reveal */}
      {gachaAnim && (
        <ModalPortal>
        <div className="gacha-overlay">
          {gachaAnim.phase === 'rolling' ? (
            <div className="gacha-ceremony" style={{ background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)' }}>
              <div className="gacha-card-back"><span className="gacha-card-inner">🎴</span></div>
              <div className="gacha-spin-text">灵犀之力汇聚中…</div>
            </div>
          ) : (() => {
            const r = gachaAnim.result;
            const rarityColor = (r as any).rarity === 'legendary' ? '#f59e0b' : (r as any).rarity === 'rare' ? '#8b5cf6' : '#0ea5e9';
            const rarityLabel = (r as any).rarity === 'legendary' ? '👑 传说' : (r as any).rarity === 'rare' ? '✨ 稀有' : '⭐ 普通';
            const isPet = r.type === 'pet';
            const icon = r.type === 'food' ? '🍖' : r.type === 'wishTicket' ? '🎫' : r.type === 'renameCard' ? '📝' : '';
            const label = r.type === 'food'
              ? `食物补给（${(r as any).foodType === 'premium' ? '高级食物' : '普通食物'}）`
              : r.type === 'wishTicket' ? '许愿票 ×1'
              : r.type === 'renameCard' ? '改名卡 ×1'
              : (r as any).item.name;
            return (
              <div className="gacha-ceremony" style={{
                background: isPet
                  ? `linear-gradient(135deg, ${rarityColor}22, #fff)`
                  : 'linear-gradient(135deg, #f0f9ff, #fff)',
                border: isPet ? `2px solid ${rarityColor}` : '2px solid #bae6fd',
              }}>
                {isPet ? (
                  <>
                    <div className="gacha-preview-big">
                      <img src={`/pet-sprites/previews/${(r as any).item.speciesId}.png`} alt=""
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                    </div>
                    <div className="gacha-name" style={{ color: rarityColor }}>{label}</div>
                    <div className="gacha-rarity" style={{ color: rarityColor }}>{rarityLabel}</div>
                    <div className="gacha-hint">已放入孵化队列，收下后开始孵化</div>
                  </>
                ) : (
                  <>
                    <div className="gacha-reveal-icon">{icon}</div>
                    <div className="gacha-name">{label}</div>
                    <div className="gacha-hint">已放入背包</div>
                  </>
                )}
                <button className="gacha-done-btn" onClick={() => {
                  if (isPet) {
                    const petName = (r as any).autoName || (r as any).item.name;
                    const egg = addEgg((r as any).item.speciesId!, petName, (r as any).rarity as HatchRarity, 150);
                    setPendingHatch({ eggId: egg.eggId, speciesId: (r as any).item.speciesId!, petName, rarity: (r as any).rarity as HatchRarity });
                  }
                  setGachaAnim(null);
                }}>收下</button>
              </div>
            );
          })()}
        </div>
        </ModalPortal>
      )}

      {/* Hatch confirmation modal */}
      {pendingHatch && (
        <HatchConfirmModal
          petName={pendingHatch.petName}
          rarity={pendingHatch.rarity}
          onStart={() => {
            startHatching(pendingHatch.eggId);
            setTab('hatch');
            setPendingHatch(null);
          }}
          onLater={() => {
            setPendingHatch(null);
          }}
          onClose={() => {
            setPendingHatch(null);
          }}
        />
      )}
    </div>
  );
}
