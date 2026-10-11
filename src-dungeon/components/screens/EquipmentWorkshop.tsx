import { useEffect, useRef, useState } from 'react';
import { useTrialEquipmentStore } from '../../stores/trialEquipmentStore';
import { usePetStore } from '../../../src/stores/petStore';
import { TRIAL_EQUIPMENT } from '../../data/explorationItems';
import { EQUIPMENT_ELEMENTS, EQUIPMENT_RARITIES, ELEMENT_NAMES, ELEMENT_COUNTERS, getUpgradeCost } from '../../data/equipmentCatalog';
import { loadEquipmentCatalog } from '../../services/equipmentCatalogService';
import type { EquipmentElement, EquipmentRarity } from '../../types/exploration';
import DungeonConfirmModal from '../shared/DungeonConfirmModal';

const RARITIES = { common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' };
const COLORS = { common: '#b3c8d9', rare: '#5fcfff', epic: '#c193ff', legendary: '#f8d477' };

export default function EquipmentWorkshop() {
  const state = useTrialEquipmentStore();
  const coins = usePetStore(s => s.coins);
  const [tab, setTab] = useState<'shop' | 'inventory'>('shop');
  const [element, setElement] = useState<EquipmentElement | ''>('');
  const [rarity, setRarity] = useState<EquipmentRarity | ''>('');
  const [category, setCategory] = useState<'weapon' | 'armor' | ''>('');
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [confirmation, setConfirmation] = useState<{ action: 'buy' | 'upgrade' | 'dismantle'; id: string; message: string } | null>(null);
  const submitting = useRef(false);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => { submitting.current = false; }, [confirmation]);
  useEffect(() => {
    let active = true;
    void loadEquipmentCatalog().then(() => {
      if (active) { state.load(); setRevision(n => n + 1); setReady(true); }
    });
    return () => { active = false; };
  }, []);
  // Reading catalog here also picks up validated online updates when revision changes.
  void revision;
  const items = Object.values(TRIAL_EQUIPMENT).filter(item =>
    ['weapon', 'armor'].includes(item.category) &&
    (tab === 'shop' ? item.shopAvailable : state.ownedItems.some(owned => owned.definitionId === item.id)) &&
    (!element || item.element === element) && (!rarity || item.rarity === rarity) && (!category || item.category === category));
  const definition = items.find(item => item.id === selected);
  const owned = state.ownedItems.find(item => item.definitionId === definition?.id);
  const level = owned?.upgradeLevel || 0;
  const cost = definition && getUpgradeCost(definition, level);
  const equippedId = definition?.category === 'weapon' ? state.equippedWeaponId : state.equippedArmorId;
  const equippedOwned = state.ownedItems.find(item => item.id === equippedId);
  const equippedDefinition = equippedOwned && TRIAL_EQUIPMENT[equippedOwned.definitionId];
  const equipped = Boolean(owned && equippedId === owned.id);
  const refund = Math.floor(((owned?.purchasePrice || 0) + (owned?.investedCoins || 0)) * .8);

  return <section className="equipment-workshop pixel-card" aria-label="装备工坊">
    <h2>⚒ 装备工坊</h2>
    <p className="equipment-muted">固定品级、明码标价，无抽卡。武器决定攻击属性，防具决定防御属性；最多强化到 +5。</p>
    {!ready && <p role="status">正在读取装备存档与目录，暂不扣除金币；断网时会自动使用本地目录。</p>}
    <fieldset disabled={!ready} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <div className="equipment-controls">
      <button className={`pixel-btn ${tab === 'shop' ? 'primary' : ''}`} onClick={() => { setTab('shop'); setSelected(''); }}>装备商店</button>
      <button className={`pixel-btn ${tab === 'inventory' ? 'primary' : ''}`} onClick={() => { setTab('inventory'); setSelected(''); }}>我的装备 · 强化</button>
      <label>种类 <select value={category} onChange={e => { setCategory(e.target.value as typeof category); setSelected(''); }}><option value="">全部</option><option value="weapon">武器</option><option value="armor">防具</option></select></label>
      <label>属性 <select value={element} onChange={e => { setElement(e.target.value as typeof element); setSelected(''); }}><option value="">全部</option>{EQUIPMENT_ELEMENTS.map(value => <option key={value} value={value}>{ELEMENT_NAMES[value]}</option>)}</select></label>
      <label>品级 <select value={rarity} onChange={e => { setRarity(e.target.value as typeof rarity); setSelected(''); }}><option value="">全部</option>{EQUIPMENT_RARITIES.map(value => <option key={value} value={value}>{RARITIES[value]}</option>)}</select></label>
    </div>
    <div className="equipment-materials">{EQUIPMENT_ELEMENTS.map(value => <span key={value}>{ELEMENT_NAMES[value]}晶石 {state.materials[`${value}-crystal`] || 0}</span>)}</div>
    <div className="equipment-workspace">
      <div className="equipment-grid">
        {items.map(item => {
          const entry = state.ownedItems.find(o => o.definitionId === item.id);
          return <button key={item.id} className={`equipment-tile ${selected === item.id ? 'is-selected' : ''}`} style={{ '--equipment-color': COLORS[item.rarity] } as React.CSSProperties} onClick={() => {
            setSelected(item.id);
            requestAnimationFrame(() => {
              if (window.matchMedia('(max-width: 690px)').matches) detailRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            });
          }} aria-pressed={selected === item.id}>
            <img src={item.icon} alt="" loading="lazy" />
            <strong>{item.name}{entry && ` +${entry.upgradeLevel || 0}`}</strong>
            <small>{ELEMENT_NAMES[item.element!]} · {RARITIES[item.rarity]} · {item.category === 'weapon' ? '武器' : '防具'}</small>
            <span>{entry ? '已拥有 · 点击查看' : `${item.price} 金币`}</span>
          </button>;
        })}
        {!items.length && <p>暂无符合筛选的装备。可到商店挑选，或在迷雾探索中获取。</p>}
      </div>
      <aside ref={detailRef} className="equipment-detail" aria-label="装备详情">
        {!definition ? <p className="equipment-muted">点击装备查看完整规则、换装对比和强化费用。</p> : <>
          <h3 style={{ color: COLORS[definition.rarity] }}>{definition.name} +{level}</h3>
          <p>{ELEMENT_NAMES[definition.element!]}属性 · {RARITIES[definition.rarity]} · {definition.category === 'weapon' ? `攻击 +${definition.attack || 0}` : `防御 +${definition.defense || 0}`}</p>
          <p>{definition.category === 'weapon'
            ? `基础增伤 ${5 + level * 5}%；克制${ELEMENT_NAMES[ELEMENT_COUNTERS[definition.element!]]}属性时再乘120%。+0时100点基础伤害变126点。每阶增加5%增伤。`
            : `克制${ELEMENT_NAMES[ELEMENT_COUNTERS[definition.element!]]}属性敌人时减伤${10 + level * 4}%；无克制不额外减伤。每阶增加4%减伤，最高30%，先减伤再扣护盾。`}</p>
          <p>特殊效果：{definition.description}</p><small className="equipment-muted">{definition.scope} 离开战斗或下一场时重置触发次数；不改变伙伴属性。</small>
          {equippedDefinition && <div className="equipment-comparison">
            <strong>对比当前：{equippedDefinition.name} +{equippedOwned?.upgradeLevel || 0}</strong>
            <p>攻击 {definition.attack || 0} / 当前 {equippedDefinition.attack || 0} · 防御 {definition.defense || 0} / 当前 {equippedDefinition.defense || 0}</p>
            <p>强化 +{level} / 当前 +{equippedOwned?.upgradeLevel || 0} · 属性 {ELEMENT_NAMES[definition.element!]} / 当前 {ELEMENT_NAMES[equippedDefinition.element!]}</p>
          </div>}
          {!owned ? <button className="pixel-btn primary" disabled={coins < (definition.price || 0)} onClick={() => setConfirmation({ action: 'buy', id: definition.id, message: `花费 ${definition.price} 金币购买「${definition.name}」？品级固定，购买后需手动装备。` })}>购买 · {definition.price} 金币</button> : <>
            <div className="equipment-controls"><button className="pixel-btn primary" onClick={() => equipped ? state.unequipItem(owned.id) : state.equipItem(owned.id)}>{equipped ? '卸下' : '装备到对应位置'}</button></div>
            {cost ? <>
              <p>下一阶：{cost.coins} 金币＋{ELEMENT_NAMES[definition.element!]}晶石 {cost.materials} 个</p>
              <button className="pixel-btn" disabled={coins < cost.coins || (state.materials[cost.materialId] || 0) < cost.materials} onClick={() => setConfirmation({ action: 'upgrade', id: owned.id, message: `强化到 +${level + 1}，花费 ${cost.coins} 金币和 ${cost.materials} 个${ELEMENT_NAMES[definition.element!]}晶石。晶石仅探索获取，不可买卖，分解不返还。` })}>强化到 +{level + 1}</button>
              {(state.materials[cost.materialId] || 0) < cost.materials && <p className="equipment-muted">晶石不足：通关迷雾探索领取对应属性晶石，每张地图仅领一次。</p>}
            </> : <p>已满级 +5</p>}
            <p className="equipment-muted">实际购买 {owned.purchasePrice || 0}＋强化投入 {owned.investedCoins || 0} 金币 · 分解返还 {refund} 金币（80%向下取整），不返还材料。</p>
            <button className="pixel-btn" disabled={equipped} onClick={() => setConfirmation({ action: 'dismantle', id: owned.id, message: `永久分解「${definition.name} +${level}」？返还 ${refund} 金币，不返还晶石。掉落及旧装备的购买成本为0；分解后若要再次拥有，需重新获取。` })}>{equipped ? '先卸下才能分解' : `分解 · 返还 ${refund} 金币`}</button>
          </>}
        </>}
      </aside>
    </div>
    </fieldset>
    {notice && <p role="status">{notice}</p>}
    {confirmation && <DungeonConfirmModal title="确认装备操作" message={confirmation.message} onCancel={() => setConfirmation(null)} onConfirm={() => {
      if (submitting.current) return;
      submitting.current = true;
      try {
        const service = useTrialEquipmentStore.getState();
        const result = confirmation.action === 'buy' ? service.buyItem(confirmation.id) : confirmation.action === 'upgrade' ? service.upgradeItem(confirmation.id) : service.dismantleItem(confirmation.id);
        setNotice(result.ok ? '操作成功，金币与装备已保存。' : result.reason || '操作失败，未改变金币或装备。');
        if (result.ok) setConfirmation(null);
        if (!result.ok) { setConfirmation({ ...confirmation, message: `${confirmation.message}\n操作未完成：${result.reason || '保存失败，请稍后再试。'}` }); submitting.current = false; }
      } catch { setNotice('保存失败，请稍后再试。'); submitting.current = false; }
    }} />}
  </section>;
}
