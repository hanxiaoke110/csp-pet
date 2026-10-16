import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/App.css';
import PartnerAccessoryPanel from '../../src/components/pet/PartnerAccessoryPanel';
import PartnerAccessoryLayers from '../../src/components/pet/PartnerAccessoryLayers';
import PetSprite from '../../src/components/pet/PetSprite';
import { usePetStore } from '../../src/stores/petStore';
import { usePartnerAccessoryStore } from '../../src/stores/partnerAccessoryStore';
import { BUILTIN_ACCESSORY_CATALOG, defaultAccessorySnapshot } from '../../src/data/partnerAccessories';
import type { OwnedPet } from '../../src/types/pet';

// This preview uses an in-memory Storage facade before mounting application
// components. Neither fixtures nor purchase/equip tests touch the real profile.
const memory = new Map<string, string>();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  get length() { return memory.size; }, key: (i: number) => [...memory.keys()][i] ?? null,
  getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key), clear: () => memory.clear(),
} });
function Preview() {
  const [ready, setReady] = useState(false); const [moving, setMoving] = useState(false); const [sleeping, setSleeping] = useState(false);
  const [paused, setPaused] = useState(false); const [reduced, setReduced] = useState(false);
  const [size, setSize] = useState(140); const [dark, setDark] = useState(true);
  const fixture = () => {
    const pet = { petId: 'fixture-one', speciesId: 'capi', petName: '卡皮 · 一号', modelPath: '/pet-sprites/2d/capi.json', renderType: '2d', level: 10, element: 'earth' } as OwnedPet;
    const pets = [pet, { ...pet, petId: 'fixture-two', petName: '卡皮 · 二号' }];
    localStorage.setItem('csp_pet_data', JSON.stringify({ coins: 2000, ownedPets: pets, activePetId: pet.petId }));
    usePetStore.setState({ loaded: true, coins: 2000, ownedPets: pets, activePetId: pet.petId });
    usePartnerAccessoryStore.setState({ loaded: true, busy: false, error: '', snapshot: defaultAccessorySnapshot(), catalog: BUILTIN_ACCESSORY_CATALOG });
    setReady(true);
  };
  return <main style={{ maxWidth: 1060, margin: 'auto', padding: 30, background: '#f6f8f1', minHeight: '100vh' }}>
    <h2>智子配饰 · 本地验收</h2><p>独立内存存档。点击装载后可测试购买与两位同种智子的独立搭配，刷新即清空。</p>
    <button onClick={fixture}>装载临时样例（2000 金币 / 两位卡皮）</button>
    {ready && <><PartnerAccessoryPanel /><hr />
      <section className="accessory-size-gallery"><h2>六件配饰 · 桌面实际尺寸</h2><p>光环不再缩成小图标；环绕从身前转到身后；移动时尾迹沿路留下，停下后消散。</p>
        <label>桌宠尺寸 <select aria-label="桌宠尺寸" value={size} onChange={e => setSize(Number(e.target.value))}><option value="110">小 · 110px</option><option value="140">中 · 140px</option><option value="170">大 · 170px</option></select></label>
        <label><input type="checkbox" checked={dark} onChange={e => setDark(e.target.checked)} />深色桌面</label>
        <div className={`accessory-gallery-grid ${dark ? 'dark' : 'light'}`}>{BUILTIN_ACCESSORY_CATALOG.items.map(item => <article key={item.id}><div className="accessory-gallery-stage"><div className={moving && !reduced && !sleeping ? 'gallery-walking' : ''} style={{ position: 'relative', width: size, height: size }}><PetSprite modelPath="/pet-sprites/2d/capi.json" canvasSize={size} exposeGlobals={false} /><PartnerAccessoryLayers petId="fixture-one" preview={{ [item.slot]: item.id }} moving={moving} sleeping={sleeping} paused={paused} /></div></div><b>{item.name}</b><small>{size}px · {item.slot === 'trail' ? '勾选下方移动预览' : '常驻显示'}</small></article>)}</div>
      </section><p>运动与状态验收 · 以下仅模拟真实移动状态，不写入配饰装备。</p>
      <label><input type="checkbox" checked={moving} onChange={e => setMoving(e.target.checked)} />模拟位置移动</label>
      <label><input type="checkbox" checked={sleeping} onChange={e => setSleeping(e.target.checked)} />睡眠</label>
      <label><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} />暂停/隐藏</label>
      <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} />简化动画</label>
      <div className={reduced ? 'accessory-preview-reduced' : ''} style={{ position: 'relative', width: 200, height: 200, margin: '30px auto' }}><PetSprite modelPath="/pet-sprites/2d/capi.json" canvasSize={200} exposeGlobals={false} /><PartnerAccessoryLayers petId="fixture-one" moving={moving} sleeping={sleeping} paused={paused} /></div>
    </>}
    <style>{`body{background:#e4ece7!important}.accessory-preview-reduced .partner-accessory-layers *{animation:none!important}.accessory-preview-reduced .partner-accessory-trail{display:none}.accessory-size-gallery{margin:32px 0}.accessory-size-gallery p{color:#587880;font-size:13px}.accessory-size-gallery label{margin-right:20px}.accessory-gallery-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}.accessory-gallery-grid article{border:1px solid #45687366;border-radius:16px;padding:12px;text-align:center;overflow:hidden}.accessory-gallery-grid.dark article{background:radial-gradient(ellipse at 50% 80%,#20495a,#071927);color:#e6f5f6}.accessory-gallery-grid.light article{background:linear-gradient(130deg,#fff,#dce9e4);color:#163d4b}.accessory-gallery-stage{height:220px;display:flex;align-items:center;justify-content:center}.accessory-gallery-grid small{display:block;margin:8px;color:#819fa8}.gallery-walking{animation:gallery-walk 2.4s ease-in-out infinite}@keyframes gallery-walk{0%,100%{transform:translateX(-36px)}50%{transform:translateX(36px)}}@media(max-width:700px){.accessory-gallery-grid{grid-template-columns:repeat(2,1fr)}}`}</style>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
