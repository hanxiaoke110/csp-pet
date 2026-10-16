import { useEffect, useRef, useState } from 'react';
import type { OwnedPet, PetTier } from '../../types/pet';
import { usePetStore } from '../../stores/petStore';
import { usePartnerGrowthStore } from '../../stores/partnerGrowthStore';
import { useDungeonStore } from '../../../src-dungeon/stores/dungeonStore';
import { ascensionOffer, partnerTrialStats, QUALITY_LABELS, resolvePartnerQuality } from '../../utils/partnerQuality';
import ConfirmModal from './ConfirmModal';
import { safeListen } from '../../lib/tauriEvents';

export default function PartnerAscensionPanel({ pet }: { pet: OwnedPet }) {
  const petLoaded = usePetStore(s => s.loaded);
  const coins = usePetStore(s => s.coins);
  const { loaded, snapshot, error, load, ascend } = usePartnerGrowthStore();
  const dungeonLevel = useDungeonStore(s => s.player.playerLevel || 1);
  const [confirmation, setConfirmation] = useState<{ petId: string; quality: PetTier } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  useEffect(() => { if (petLoaded) void load(); }, [petLoaded, load]);
  useEffect(() => {
    const refresh = () => { usePartnerGrowthStore.getState().refresh(); void usePetStore.getState().load(); };
    const stopGrowth = safeListen('partner-growth-sync', () => { usePartnerGrowthStore.getState().refresh(); });
    const stopPet = safeListen('pet-data-sync', () => { void usePetStore.getState().load(); });
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { stopGrowth(); stopPet(); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => { setConfirmation(null); setMessage(''); }, [pet.petId]);
  if (!petLoaded || !loaded) return <section className="partner-ascension" aria-label="伙伴升华"><p role="status">{error || '正在恢复升华资料…'}</p>{error && <button className="mode-btn" onClick={() => void load()}>重试</button>}</section>;
  const quality = resolvePartnerQuality(pet);
  const offer = ascensionOffer(quality);
  const sand = snapshot?.starSand ?? 0;
  const before = partnerTrialStats(pet, dungeonLevel);
  const after = offer ? partnerTrialStats({ ...pet, quality: offer.target }, dungeonLevel) : before;
  const eligible = offer && coins >= offer.coins && sand >= offer.sand && pet.level >= offer.level && pet.affection >= offer.affection;
  return <section className="partner-ascension" aria-label="伙伴升华" style={{ border: '1px solid #c7d2fe', borderRadius: 12, padding: 14, marginTop: 14, background: '#f5f7ff' }}>
    <h4 style={{ margin: '0 0 8px' }}>✨ 伙伴升华 · {QUALITY_LABELS[quality]}{offer && ` → ${QUALITY_LABELS[offer.target]}`}</h4>
    <p style={{ fontSize: 12, margin: '6px 0' }}>金币 {coins} · 星砂 {sand}</p>
    {offer ? <>
      <p style={{ fontSize: 12, lineHeight: 1.7 }}>需要 {offer.coins} 金币 + {offer.sand} 星砂<br />等级 {pet.level}/{offer.level} · 亲密度 {pet.affection}/{offer.affection} · 成功率 100%</p>
      <p style={{ fontSize: 12 }}>升华后余额：金币 {coins} → {Math.max(0, coins - offer.coins)} · 星砂 {sand} → {Math.max(0, sand - offer.sand)}{coins < offer.coins || sand < offer.sand ? '（材料不足）' : ''}</p>
      <p style={{ fontSize: 12 }}>当前试炼 Lv.{dungeonLevel} 属性预览</p>
      <table style={{ width: '100%', fontSize: 12, textAlign: 'left' }}><thead><tr><th>属性</th><th>当前</th><th>升华后</th></tr></thead><tbody>
        {([['生命', 'maxHp'], ['攻击', 'attack'], ['防御', 'defense'], ['速度', 'speed']] as const).map(([label, key]) => <tr key={key}><td>{label}</td><td>{before[key]}</td><td>{after[key]}{after[key] > before[key] && ` (+${after[key] - before[key]})`}</td></tr>)}
      </tbody></table>
      <button className="mode-btn" style={{ marginTop: 12 }} disabled={!eligible || busy} onClick={() => setConfirmation({ petId: pet.petId, quality })}>{busy ? '正在升华…' : `升华为${QUALITY_LABELS[offer.target]}`}</button>
    </> : <p style={{ fontSize: 12 }}>已达传说品质，继续陪伴与成长吧。</p>}
    <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>每首次答对 20 道不同题目获得 1 星砂；每张迷宫首次完成获得 1 星砂。星砂独立于装备晶石。拆解时返还实际升华金币的 80%，星砂不返还。</p>
    {(message || error) && <p role="status" style={{ fontSize: 12 }}>{message || error}</p>}
    {confirmation && offer && <ConfirmModal icon="✨" title={`升华「${pet.petName}」`} price={offer.coins} coins={coins}
      desc={`消耗 ${offer.sand} 星砂，升华为${QUALITY_LABELS[offer.target]}。\n金币余额 ${coins} → ${coins - offer.coins}；星砂余额 ${sand} → ${sand - offer.sand}。\n成功率 100%，伙伴等级与亲密度保留。`} confirmText="确认升华"
      onCancel={() => { if (!locked.current) setConfirmation(null); }} onConfirm={() => {
        if (locked.current || confirmation.petId !== pet.petId) return;
        locked.current = true; setBusy(true);
        try { const result = ascend(confirmation.petId, confirmation.quality); setMessage(result.message); setConfirmation(null); }
        finally { locked.current = false; setBusy(false); }
      }} />}
  </section>;
}
