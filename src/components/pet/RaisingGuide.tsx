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
        <p>完成课程验证、每周任务、额外挑战、月度复盘、超级挑战、CSP 真题都能获得经验。</p>
        <p>老师发放的<strong>优秀码</strong>直接加经验；<strong>补偿码</strong>的金币直接到账，经验存入经验池。</p>
        <p><strong>30%</strong> 直接给活跃智子，<strong>70%</strong> 存入经验池，可在「智子页 → 经验池」自由分配给任意智子。</p>
        <p>智子<strong>心情 ≥ 80</strong> 时经验 ×1.2，<strong>心情 ≤ 20</strong> 时 ×0.8。</p>
        <LevelTable />
      </Section>

      <Section title="💛 心情 & 好感度" icon="💛">
        <p>初始：心情 <strong>80</strong>、好感 <strong>50</strong>（上限 100）。</p>
        <p>🍖 喂食：心情 <strong>+5</strong>、好感 <strong>+3</strong>。</p>
        <p>📈 获得经验：心情 <strong>+3</strong>。</p>
        <p>✅ 完成课程验证：好感 <strong>+10</strong>（阶段毕业 +20）。</p>
        <p>😵 饱食 ≤ 20 时，心情每次下降 <strong>-1</strong>。</p>
        <p>好感达到 100 可解锁成就「心有灵犀」💕</p>
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

      <Section title="🛒 商城道具" icon="🛒">
        <p>🧪 经验胶囊 <strong>400g</strong>：向经验池注入 120 EXP（每日限购 3 次）</p>
        <p>💠 进阶经验核心 <strong>1000g</strong>：向经验池注入 360 EXP（每日限购 1 次）</p>
        <p>🤖 自动喂食器 <strong>1500g</strong>：饱食低于 40 时自动使用背包食物（永久道具）</p>
      </Section>

      <Section title="👥 多智子（第二 / 第三只）" icon="👥">
        <p>同一桌面可以带 <strong>2~3 只</strong>智子一起学习、一起成长～</p>
        <p>第 2 个伴生槽 <strong>2500g</strong>，第 3 个 <strong>5000g</strong>，在智子页解锁后即可在桌面同时展示。</p>
        <p style={{ color: '#fbbf24' }}>
          ⚠️ 温馨提示（认真脸）：每多一只智子，桌宠窗口就多一个，电脑要稍微多出一点点力。
          <strong>请务必确认你的电脑设备足够硬核</strong>，再购买/更新多智子！
          如果因为硬件太老导致电脑卡死、死机、甚至重装软件，本店概不退还损失，只能抱抱你 🫂。
          （当然，设备给力的话，两只三只围着你转真的很香～）
        </p>
      </Section>

      <Section title="🎰 抽卡" icon="🎰">
        <p>单抽 <strong>150g</strong>，每日限 5 次。</p>
        <p>传说 4% · 稀有 8% · 保底 <strong>{ms.pityThreshold}</strong> 抽必出传说。</p>
        <p>奖池包含精灵、普通/高级食物、许愿票、改名卡。</p>
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

      <Section title="🏆 成就奖励" icon="🏆">
        <p>完成课程、周常、超级挑战、签到等目标会解锁成就，在「成就」页<strong>手动领取</strong>金币/改名卡奖励。</p>
        <p>💎 完美通关（超级挑战全对）：+200g + 1 张改名卡</p>
        <p>🏅 双料冠军（超级完美 + 周常完美）：+300g + 2 张改名卡</p>
        <p>🎓 百炼成钢（累计答对 100 道课程验证）：+200g + 1 张改名卡</p>
        <p>🐾 拥有 8 只智子：+150g</p>
        <p>每周任务 5/5 全对、超级挑战全对都能解锁成就，别漏领啦~</p>
      </Section>

      <Section title="🎁 神秘代码" icon="🎁">
        <p>在「神秘代码」入口输入老师发放的兑换码。</p>
        <p>补偿码 <strong>CMP-</strong>：每码全局只能兑换一次，金币直接到账，经验存入经验池。</p>
        <p>优秀码 <strong>EXC-</strong>：仅当天有效、每设备限兑一次，金币与经验直接到账。</p>
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
        {[1, 5, 10, 15, 20].map(lv => {
          const m = getLevelMilestone(lv);
          return (
            <tr key={lv} style={{ borderTop: '1px solid #334155' }}>
              <td style={{ padding: '3px 4px', fontWeight: 600 }}>Lv.{lv}</td>
              <td style={{ color: lv >= 20 ? '#dc2626' : lv >= 15 ? '#f59e0b' : lv >= 10 ? '#3b82f6' : lv >= 5 ? '#22c55e' : '#94a3b8' }}>{m.title}</td>
              <td style={{ fontSize: 10, color: '#94a3b8' }}>
                {lv === 1 ? '—' : lv === 5 ? '新称号「金丹」' : lv === 10 ? '每周自动 +20g' : lv === 15 ? '保底减半至 50 抽 · 每周 +20g' : '每周自动 +32g · 修行圆满 🎉'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
