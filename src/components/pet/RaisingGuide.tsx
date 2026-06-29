import { usePetStore, getLevelMilestone, FOODS } from '../../stores/petStore';
import { TIER_PRICES } from '../../types/pet';

export default function RaisingGuide() {
  const activePet = usePetStore(s => s.ownedPets.find(p => p.petId === s.activePetId));
  const expPool = usePetStore(s => s.expPool);
  const coins = usePetStore(s => s.coins);
  const campActive = usePetStore(s => s.trainingCampActive);

  const ms = activePet ? getLevelMilestone(activePet.level) : getLevelMilestone(1);

  return (
    <div style={{ padding: '0 4px', maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
      {/* Status bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 110, background: '#1e293b', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>🪙 {coins}g</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>金币</div>
        </div>
        <div style={{ flex: 1, minWidth: 110, background: '#1e293b', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#818cf8' }}>📦 {expPool}exp</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>经验池</div>
        </div>
        <div style={{ flex: 1, minWidth: 110, background: '#1e293b', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: campActive ? '#34d399' : '#94a3b8' }}>{campActive ? '🏕️ 1.5x' : '—'}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>集训状态</div>
        </div>
      </div>

      {/* Guide sections */}
      <Section title="📈 经验 & 升级" icon="📈">
        <p>完成课程验证、每周任务获得经验。</p>
        <p><strong>30%</strong> 直接给活跃智子，<strong>70%</strong> 存入经验池，可分配给任意智子。</p>
        <p>智子<strong>心情 ≥ 80</strong> 时经验 ×1.2，<strong>心情 ≤ 20</strong> 时 ×0.8。</p>
        <LevelTable />
      </Section>

      <Section title="💛 心情 & 好感度" icon="💛">
        <p>喂食、获得经验可提升心情。饥饿时（饱食 ≤ 20）心情会下降。</p>
      </Section>

      <Section title="🍖 食物" icon="🍖">
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '2px 4px' }}>食物</th>
              <th>价格</th>
              <th>饱食</th>
              <th>效果</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(FOODS).map(([id, f]) => (
              <tr key={id} style={{ borderTop: '1px solid #334155' }}>
                <td style={{ padding: '3px 4px' }}>{f.icon} {f.name}</td>
                <td>{f.price}g</td>
                <td>+{f.hunger}</td>
                <td style={{ fontSize: 10, color: '#94a3b8' }}>
                  {id === 'premium' ? '心情+5' : id === 'deluxe' ? '心情+10' : id === 'basic' ? '—' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="🎰 抽卡" icon="🎰">
        <p>单抽 <strong>200g</strong>，每日限 5 次。</p>
        <p>传说 1% · 稀有 10% · 保底 <strong>{ms.pityThreshold}</strong> 抽必出传说。</p>
        <p>达成<strong>化神</strong>（Lv.15）后保底减半至 50 抽。</p>
      </Section>

      <Section title="⭐ 稀有度 & 价格" icon="⭐">
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '2px 4px' }}>稀有度</th>
              <th>价格</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {(['legendary', 'rare', 'common'] as const).map(t => (
              <tr key={t} style={{ borderTop: '1px solid #334155' }}>
                <td style={{ padding: '3px 4px' }}>
                  {t === 'legendary' ? '👑 传说' : t === 'rare' ? '✨ 稀有' : '⭐ 普通'}
                </td>
                <td>{TIER_PRICES[t]}g</td>
                <td style={{ fontSize: 10, color: '#94a3b8' }}>
                  {t === 'legendary' ? '万中无一的传说智子' : t === 'rare' ? '百里挑一的稀有智子' : '基础智子伙伴'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="🎁 收集奖励" icon="🎁">
        <p>🌈 集齐地火风水<strong>四系</strong>各 1 只 → +200g + 改名卡</p>
        <p>⭐ 拥有 <strong>8 只</strong> → +150g</p>
      </Section>

      <Section title="🏕️ 集训模式" icon="🏕️">
        <p>教师发放激活码 → 在<strong>设置页</strong>输入 → 12 天内所有奖励 <strong>×1.5</strong>。</p>
        <p>集训期间每日可领取 3 份普通食物。</p>
        <p>适合暑期集训、考前冲刺等密集学习场景。</p>
      </Section>

      <Section title="📅 签到" icon="📅">
        <p>每周签到 <strong>+50g</strong>，连续第 4 周 +100g，第 8 周 +200g + 改名卡。</p>
        <p>断签不重置，只暂停累计。</p>
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12, background: '#1e293b', borderRadius: 10, padding: '10px 12px', border: '1px solid #334155' }}>
      <h4 style={{ margin: 0, marginBottom: 6, fontSize: 13, color: '#e2e8f0' }}>{icon} {title}</h4>
      <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function LevelTable() {
  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 4 }}>
      <thead>
        <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
          <th style={{ padding: '2px 4px' }}>等级</th>
          <th>称号</th>
          <th>解锁</th>
        </tr>
      </thead>
      <tbody>
        {[1, 5, 10, 15].map(lv => {
          const m = getLevelMilestone(lv);
          return (
            <tr key={lv} style={{ borderTop: '1px solid #334155' }}>
              <td style={{ padding: '3px 4px', fontWeight: 600 }}>Lv.{lv}</td>
              <td style={{ color: lv >= 15 ? '#f59e0b' : lv >= 10 ? '#3b82f6' : lv >= 5 ? '#22c55e' : '#94a3b8' }}>{m.title}</td>
              <td style={{ fontSize: 10, color: '#94a3b8' }}>
                {lv === 1 ? '—' : lv === 5 ? '新称号「金丹」' : lv === 10 ? '每周自动 +20g' : '保底减半至 50 抽'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
