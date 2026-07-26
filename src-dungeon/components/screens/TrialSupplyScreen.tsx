import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';

const ITEMS = [
  { id: 'hint-ticket' as const, icon: '💡', name: '知识提示券', cost: 18, description: '战斗答题前查看一次解题方向。' },
  { id: 'healing-potion' as const, icon: '🧪', name: '修复药剂', cost: 24, description: '战斗中立即恢复 35 点生命。' },
  { id: 'title-data-scout' as const, icon: '🏷️', name: '数据侦察员', cost: 90, description: '试炼场专属称号，可在此装备。' },
  { id: 'frame-crystal' as const, icon: '◈', name: '晶体头像框', cost: 120, description: '试炼场专属头像框，可在此装备。' },
];

export default function TrialSupplyScreen() {
  const navigate = useNavigate();
  const player = useDungeonStore(s => s.player);
  const inventory = useDungeonStore(s => s.trialInventory);
  const buy = useDungeonStore(s => s.buyTrialItem);
  const equip = useDungeonStore(s => s.equipTrialCosmetic);

  const amountFor = (id: string) => id === 'hint-ticket' ? inventory.hintTickets : id === 'healing-potion' ? inventory.healingPotions : 0;
  const equippedFor = (id: string) => id === 'title-data-scout' ? inventory.equippedTitle === id : id === 'frame-crystal' ? inventory.equippedAvatarFrame === id : false;

  return (
    <div
      className="dungeon-page-bg dungeon-subpage"
      style={{
        minHeight: '100vh',
        padding: '20px',
        backgroundImage: 'linear-gradient(180deg, rgba(4, 12, 20, 0.74), rgba(8, 14, 22, 0.93) 50%, rgba(7, 8, 12, 0.98)), url("/dungeon-art-v2/dungeon-08-bg.webp")',
      }}
    >
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        <button className="pixel-btn" onClick={() => navigate('/map')} style={{ marginBottom: '18px', fontSize: '12px' }}>← 返回地图</button>
        <div className="pixel-card pixel-border-gold" style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--pixel-font)', fontSize: '16px' }}>试炼补给站</h2>
              <p style={{ margin: '8px 0 0', color: 'var(--text-dim)', fontSize: '12px' }}>用试炼场金币准备下一场战斗，也能收藏专属外观。</p>
            </div>
            <div style={{ color: 'var(--gold-coin)', fontWeight: 700, fontSize: '18px' }}>💰 {player.gold}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {ITEMS.map((item) => {
            const cosmetic = item.id === 'title-data-scout' || item.id === 'frame-crystal';
            const owned = cosmetic && inventory.ownedCosmetics.includes(item.id);
            const equipped = equippedFor(item.id);
            return (
              <div key={item.id} className="pixel-card" style={{ borderColor: equipped ? '#2dd4bf' : 'var(--border-pixel)', minHeight: '180px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '34px' }}>{item.icon}</div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '8px' }}>{item.name}</div>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.55, flex: 1 }}>{item.description}</p>
                {!cosmetic && <div style={{ fontSize: '11px', color: '#2dd4bf', marginBottom: '8px' }}>持有：{amountFor(item.id)}</div>}
                {owned ? (
                  <button className="pixel-btn" disabled={equipped} onClick={() => equip(item.id)} style={{ fontSize: '11px' }}>
                    {equipped ? '已装备' : '装备'}
                  </button>
                ) : (
                  <button className="pixel-btn primary" disabled={player.gold < item.cost} onClick={() => buy(item.id)} style={{ fontSize: '11px' }}>
                    购买 {item.cost} 金币
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
