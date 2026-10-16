import { useEffect, useRef, useState } from 'react';
import { usePetStore } from '../../stores/petStore';
import { usePartnerAccessoryStore } from '../../stores/partnerAccessoryStore';
import { supportedAccessory } from '../../data/partnerAccessories';
import type { PartnerAccessorySlot } from '../../types/partnerAccessory';
import PartnerAccessoryLayers, { AccessoryMark, usePartnerAccessories } from './PartnerAccessoryLayers';
import PetSprite from './PetSprite';
import ConfirmModal from './ConfirmModal';
const slots: Record<PartnerAccessorySlot, string> = { halo: '光环', orbit: '环绕', trail: '尾迹' };
export default function PartnerAccessoryPanel({ petId, onToast }: { petId?: string; onToast?: (message: string) => void }) {
  usePartnerAccessories();
  const pets = usePetStore(s => s.ownedPets); const coins = usePetStore(s => s.coins);
  const active = usePetStore(s => s.activePetId);
  const [selectedPet, selectPet] = useState(petId || active || pets[0]?.petId || '');
  const actualId = petId || (pets.some(p => p.petId === selectedPet) ? selectedPet : active || pets[0]?.petId || ''); const pet = pets.find(p => p.petId === actualId);
  const { snapshot, catalog, busy, error, purchase, equip } = usePartnerAccessoryStore();
  const [previewId, setPreviewId] = useState('halo-prism'); const [message, setMessage] = useState('');
  const [pendingBuy, setPendingBuy] = useState<{ id: string; price: number; name: string } | null>(null);
  const confirming = useRef(false);
  const [sleeping, setSleeping] = useState(false);
  const [previewMoving, setPreviewMoving] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  const motionTimer = useRef<number | null>(null);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference?.matches || false);
    preference?.addEventListener('change', update);
    return () => preference?.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    setPreviewMoving(false);
    return () => { if (motionTimer.current !== null) window.clearTimeout(motionTimer.current); motionTimer.current = null; };
  }, [previewId, actualId, sleeping, reducedMotion]);
  const simulateMovement = () => {
    if (previewMoving || reducedMotion || sleeping) return;
    setPreviewMoving(true);
    motionTimer.current = window.setTimeout(() => { setPreviewMoving(false); motionTimer.current = null; }, 1800);
  };
  const item = catalog.items.find(i => i.id === previewId);
  const loadout = snapshot.equippedByPet[actualId] || {};
  const preview = item && supportedAccessory(item) ? { ...loadout, [item.slot]: item.id } : loadout;
  const act = async (job: Promise<{ message: string }>) => { const result = await job; setMessage(result.message); onToast?.(result.message); };
  return <section className="partner-atelier" aria-label="智子配饰">
    <header><div><small>PARTNER / STAR ATLAS</small><h3>给同行者，一点星光</h3><p>一次收藏，永久拥有。每位智子都有自己的搭配。</p></div><strong>{coins}<small> 可用金币</small></strong></header>
    {!pet ? <p>先领养一位智子，再来开启星图衣橱。</p> : <div className="partner-atelier-body">
      <aside className="partner-fitting">
        {!petId && <label>正在为谁搭配<select value={actualId} onChange={e => selectPet(e.target.value)}>{pets.map(p => <option key={p.petId} value={p.petId}>{p.petName}</option>)}</select></label>}
        <div className="partner-fitting-stage"><div className="partner-coordinate">01 / COSMIC FITTING</div><div className={`partner-preview-actor ${previewMoving ? 'moving' : ''}`}><PetSprite modelPath={pet.modelPath} canvasSize={200} exposeGlobals={false} onAnimationChange={animation => setSleeping(animation === 'sleep')} /><PartnerAccessoryLayers petId={actualId} preview={preview} sleeping={sleeping} moving={previewMoving} /></div><span className="partner-stage-axis" /></div>
        <div className="partner-preview-caption"><b>{item?.name || '当前搭配'}</b><span>试穿预览 · 尾迹在实际移动时出现</span></div>
        {item?.slot === 'trail' && supportedAccessory(item) && <button className="partner-preview-movement" disabled={previewMoving || sleeping || reducedMotion} onClick={simulateMovement}>{reducedMotion ? '已简化动画' : previewMoving ? '移动预览中…' : '模拟移动 · 试穿尾迹'}</button>}
        <div className="partner-loadout">{(Object.keys(slots) as PartnerAccessorySlot[]).map(slot => <div key={slot}><span>{slots[slot]}</span><b>{catalog.items.find(i => i.id === loadout[slot])?.name || '未装备'}</b><button disabled={busy || !loadout[slot]} onClick={() => void act(equip(actualId, slot, null))}>卸下</button></div>)}</div>
      </aside>
      <div className="partner-accessory-catalog">{catalog.items.map(i => {
        const owned = snapshot.ownedIds.includes(i.id); const equipped = loadout[i.slot] === i.id; const supported = supportedAccessory(i);
        return <article key={i.id} className={`partner-accessory-card ${previewId === i.id ? 'selected' : ''}`}>
          <button className="partner-accessory-art" disabled={!supported} style={{ color: i.visual.color }} onClick={() => setPreviewId(i.id)} aria-label={supported ? `预览${i.name}` : `${i.name}需要更新`}><AccessoryMark item={i} /><span>{slots[i.slot]} / {supported ? i.visual.primitive.toUpperCase() : '需要更新'}</span></button>
          <div className="partner-accessory-copy"><small>{equipped ? '已装备' : owned ? '永久拥有' : i.price === 0 ? '免费赠礼' : `${i.price} 金币`}</small><h4>{i.name}</h4><p>{i.description}</p><div><button disabled={!supported} onClick={() => setPreviewId(i.id)}>试穿</button><button disabled={busy || equipped || !supported} onClick={() => { setPreviewId(i.id); if (!owned && i.price) setPendingBuy({ id: i.id, price: i.price, name: i.name }); else void act(owned ? equip(actualId, i.slot, i.id) : purchase(i.id, i.price)); }}>{!supported ? '需要更新' : equipped ? '已装备' : owned ? '装备' : i.price ? `收藏 · ${i.price}` : '免费领取'}</button></div></div>
        </article>;
      })}</div>
    </div>}
    <p role="status" className="partner-accessory-message">{message || error || '纯外观配饰，不改变战斗属性。'}</p>
    {pendingBuy && <ConfirmModal icon="✦" title={`收藏「${pendingBuy.name}」`} price={pendingBuy.price} coins={coins} desc={`永久拥有，所有智子均可使用。\n购买后余额：${Math.max(0, coins - pendingBuy.price)} 金币\n收藏后可自行装备。`} confirmText={busy ? '正在保存…' : '确认收藏'} onCancel={() => { if (!busy) setPendingBuy(null); }} onConfirm={() => { if (confirming.current) return; confirming.current = true; void act(purchase(pendingBuy.id, pendingBuy.price)).finally(() => { confirming.current = false; setPendingBuy(null); }); }} />}
  </section>;
}
