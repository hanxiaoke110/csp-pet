import { useRef, useState } from 'react';
import { useTrialEquipmentStore } from '../../stores/trialEquipmentStore';
import { ELEMENT_NAMES, EQUIPMENT_ELEMENTS, SOUL_FRAGMENTS_PER_CRYSTAL } from '../../data/equipmentCatalog';
import type { EquipmentElement } from '../../types/exploration';
import DungeonConfirmModal from '../shared/DungeonConfirmModal';

export default function EquipmentMaterialExchange({ ready, initialElement = 'wind' }: { ready: boolean; initialElement?: EquipmentElement }) {
  const fragments = useTrialEquipmentStore(s => s.soulFragments);
  const [element, setElement] = useState(initialElement);
  const [quantity, setQuantity] = useState('1');
  const [notice, setNotice] = useState('');
  const [order, setOrder] = useState<{ element: EquipmentElement; quantity: number } | null>(null);
  const submitting = useRef(false);
  const amount = Number(quantity);
  const maxQuantity = Math.floor(fragments / SOUL_FRAGMENTS_PER_CRYSTAL);
  const valid = Number.isSafeInteger(amount) && amount > 0 && amount <= maxQuantity;
  return <section className="equipment-exchange" aria-label="器魂兑换晶石">
    <h3>◈ 器魂兑换晶石 <span>持有 {fragments} 碎片</span></h3>
    <p className="equipment-muted">重复装备会化为器魂碎片。{SOUL_FRAGMENTS_PER_CRYSTAL} 碎片兑换 1 个自选属性晶石，用于强化同属性武器、防具。</p>
    <fieldset disabled={!ready} className="equipment-controls">
      <label>兑换属性 <select value={element} onChange={e => setElement(e.target.value as EquipmentElement)}>{EQUIPMENT_ELEMENTS.map(value => <option key={value} value={value}>{ELEMENT_NAMES[value]}晶石</option>)}</select></label>
      <label>晶石数量 <input type="number" min="1" max={maxQuantity || 1} step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
      <button className="pixel-btn primary" disabled={!valid} onClick={() => {
        submitting.current = false;
        setOrder({ element, quantity: amount });
        setNotice('');
      }}>{valid ? `兑换 · ${amount * SOUL_FRAGMENTS_PER_CRYSTAL} 碎片` : maxQuantity < 1 ? '器魂碎片不足' : '请填写有效数量'}</button>
    </fieldset>
    <p className="equipment-muted">当前最多可兑换 {maxQuantity} 个；不花金币。晶石不可出售，分解装备不返还晶石。</p>
    {notice && <p role="status">{notice}</p>}
    {order && <DungeonConfirmModal title="确认兑换晶石" confirmLabel="确认兑换" message={`消耗 ${order.quantity * SOUL_FRAGMENTS_PER_CRYSTAL} 个器魂碎片，兑换 ${order.quantity} 个${ELEMENT_NAMES[order.element]}晶石？兑换后不可撤销，不扣金币。`} onCancel={() => setOrder(null)} onConfirm={() => {
      if (submitting.current) return;
      submitting.current = true;
      const result = useTrialEquipmentStore.getState().exchangeSoulFragments(order.element, order.quantity);
      setNotice(result.ok ? `已获得${ELEMENT_NAMES[order.element]}晶石 ×${order.quantity}，可到“我的装备 · 强化”使用。` : result.reason || '兑换未完成，材料未改变。');
      // 一次确认只提交一次；失败后关闭本次订单，再次兑换需重新确认。
      setOrder(null);
    }} />}
  </section>;
}
