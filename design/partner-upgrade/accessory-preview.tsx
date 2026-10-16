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
    {ready && <><PartnerAccessoryPanel /><hr /><p>运动与状态验收 · 以下仅模拟真实移动状态，不写入配饰装备。</p>
      <label><input type="checkbox" checked={moving} onChange={e => setMoving(e.target.checked)} />模拟位置移动</label>
      <label><input type="checkbox" checked={sleeping} onChange={e => setSleeping(e.target.checked)} />睡眠</label>
      <label><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} />暂停/隐藏</label>
      <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} />简化动画</label>
      <div className={reduced ? 'accessory-preview-reduced' : ''} style={{ position: 'relative', width: 200, height: 200, margin: '30px auto' }}><PetSprite modelPath="/pet-sprites/2d/capi.json" canvasSize={200} exposeGlobals={false} /><PartnerAccessoryLayers petId="fixture-one" moving={moving} sleeping={sleeping} paused={paused} /></div>
    </>}
    <style>{`body{background:#e4ece7!important}.accessory-preview-reduced .partner-accessory-layers *{animation:none!important}.accessory-preview-reduced .partner-accessory-trail{display:none}`}</style>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
