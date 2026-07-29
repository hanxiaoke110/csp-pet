import { useState, useEffect } from 'react';
import { usePetStore } from '../../stores/petStore';
import { useHatchStore } from '../../stores/hatchStore';
import { setWorkshopElement, type PetElement } from '../../types/pet';
import type { HatchRarity } from '../../stores/hatchStore';
import { BaseDirectory, writeFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import HatchConfirmModal from './HatchConfirmModal';

const WORKSHOP_API = 'https://api.cspstudy.top';

export function WorkshopShop() {
  const coins = usePetStore(s => s.coins);
  const spendCoins = usePetStore(s => s.spendCoins);
  const isOwned = usePetStore(s => s.isOwned);
  const addEgg = useHatchStore(s => s.addEgg);
  const startHatching = useHatchStore(s => s.startHatching);
  const [pets, setPets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [pendingHatch, setPendingHatch] = useState<{ pet: any; rarity: HatchRarity; eggId: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'rare' | 'legendary'>('all');
  const hasClassCode = !!(localStorage.getItem('csp_class_code'));
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPets = (cursor?: string | null) => {
    const isLoadMore = !!cursor;
    if (isLoadMore) setLoadingMore(true); else setLoading(true);
    let url = WORKSHOP_API + '/api/workshop/pets?limit=30';
    if (cursor) url += '&cursor=' + encodeURIComponent(cursor);
    fetch(url)
      .then(r => r.json()).then(d => {
        const items = Array.isArray(d) ? d : (d.items || []);
        if (isLoadMore) setPets(prev => [...prev, ...items]);
        else setPets(items);
        // Cache and repair workshop elements. Legacy pets without nativeElement were
        // created while every workshop pet was incorrectly treated as fire.
        items.forEach((pet: any) => { if (pet.id && pet.element) setWorkshopElement(pet.id, pet.element); });
        const elementById = new Map<string, PetElement>(items
          .filter((pet: any) => pet.id && ['earth', 'fire', 'wind', 'water', 'light'].includes(pet.element))
          .map((pet: any) => [`workshop-${pet.id}`, pet.element as PetElement]));
        if (elementById.size) {
          const state = usePetStore.getState();
          let changed = false;
          const ownedPets = state.ownedPets.map(owned => {
            const nativeElement = elementById.get(owned.speciesId);
            if (!nativeElement || owned.nativeElement) return owned;
            changed = true;
            return {
              ...owned,
              nativeElement,
              // A legacy pet never had an intentional reforge, so repair its displayed element too.
              element: owned.freeElementChangeUsed ? owned.element : nativeElement,
            };
          });
          if (changed) {
            usePetStore.setState({ ownedPets });
            usePetStore.getState().save();
          }
        }
        if (!Array.isArray(d)) { setHasMore(!!d.hasMore); setNextCursor(d.nextCursor); }
      })
      .catch(() => {}).finally(() => { setLoading(false); setLoadingMore(false); });
  };

  useEffect(() => { loadPets(); }, []);

  const handleBuy = async (pet: any) => {
    if (buyingId) return; // Prevent double-click
    if (isOwned('workshop-' + pet.id)) { alert('已经拥有这只精灵了'); return; }
    if (coins < (pet.price || 200)) { alert('金币不足'); return; }
    setBuyingId(pet.id);
    try {
    if (!await downloadSprites(pet)) return;
    const cost = pet.price || 200;
    if (!spendCoins(cost)) return;
    const rarity: HatchRarity = pet.tier === 'legendary' ? 'legendary' : pet.tier === 'rare' ? 'rare' : 'common';
    const egg = addEgg('workshop-' + pet.id, pet.name, rarity, cost);
    setPendingHatch({ pet, rarity, eggId: egg.eggId });
    } finally { setBuyingId(null); }
  };

  const downloadSprites = async (pet: any): Promise<boolean> => {
    try {
      if (!pet.spritesheet_url) throw new Error('精灵素材缺失');
      if (!await exists('pet-sprites/2d', { baseDir: BaseDirectory.AppData })) {
        await mkdir('pet-sprites/2d', { baseDir: BaseDirectory.AppData, recursive: true });
      }
      const ssUrl = WORKSHOP_API + '/api/workshop/image?key=' + encodeURIComponent(pet.spritesheet_url);
      const resp = await fetch(ssUrl);
      if (!resp.ok) throw new Error('素材下载失败（' + resp.status + '），请联系老师重新上传精灵');
      const buf = new Uint8Array(await resp.arrayBuffer());
      const petId = pet.id; // pet.id already has ws- prefix from API
      await writeFile('pet-sprites/2d/' + petId + '.png', buf, { baseDir: BaseDirectory.AppData });
      let pj: any = { frameWidth: 192, frameHeight: 208, maxFrames: 8, anims: { idle: 6 }, animOrder: ['idle'], durations: { idle: 1100 } };
      try { if (pet.pet_json) pj = JSON.parse(pet.pet_json); } catch {}
      pj.element = pet.element || 'fire';
      await writeFile('pet-sprites/2d/' + petId + '.json', new TextEncoder().encode(JSON.stringify(pj)), { baseDir: BaseDirectory.AppData });
      // Generate thumbnail from spritesheet first frame (72×78)
      try {
        const blob = new Blob([buf], { type: 'image/png' });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image(); i.onload = () => resolve(i); i.onerror = reject;
          i.src = URL.createObjectURL(blob);
        });
        const c = document.createElement('canvas');
        c.width = 72; c.height = 78;
        c.getContext('2d')!.drawImage(img, 0, 0, 192, 208, 0, 0, 72, 78);
        const dataUrl = c.toDataURL('image/png');
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const thumbBuf = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
        await writeFile('pet-sprites/2d/' + petId + '-thumb.png', thumbBuf, { baseDir: BaseDirectory.AppData });
      } catch { /* thumbnail is optional */ }
      return true;
    } catch (e: any) { alert('下载失败: ' + (e.message || '网络错误')); return false; }
  };

  if (!hasClassCode) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>请先在设置页绑定班级码</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>加入班级后才能访问工坊精灵</div>
    </div>
  );

  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🏭 智子工坊</h3>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>🪙 {coins} 金币</span>
      </div>
      <div className="shop-tabs" style={{ marginBottom: 12 }}>
        {([{ k: 'all', label: '全部' }, { k: 'rare', label: '✨ 稀有' }, { k: 'legendary', label: '👑 传说' }] as const).map(t => (
          <button key={t.k} className={`shop-tab ${filter === t.k ? 'active' : ''}`}
            onClick={() => setFilter(t.k as any)}>{t.label}</button>
        ))}
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>加载中...</div> :
       !pets.length ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>🏭 还没有老师上传精灵，敬请期待~</div> :
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {pets.filter((pet: any) => filter === 'all' || pet.tier === filter).map((pet: any) => (
          <div key={pet.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, textAlign: 'center' }}>
            <img src={WORKSHOP_API + '/api/workshop/image?key=' + encodeURIComponent(pet.thumbnail_url || pet.spritesheet_url || '')}
              style={{ width: 72, height: 78, borderRadius: 8, objectFit: 'contain', background: '#f1f5f9' }}
              onError={(e: any) => { e.target.style.display = 'none'; }} />
            <div style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>{pet.name}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{(pet.teacher_name || '?')} · {pet.element || '?'}</div>
            <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4 }}>
              {pet.tier === 'legendary' ? '👑 传说' : pet.tier === 'rare' ? '✨ 稀有' : '⭐ 普通'}
            </div>
            <button className="shop-card-buy" style={{ width: '100%' }}
              disabled={buyingId !== null || coins < (pet.price || 200) || isOwned('workshop-' + pet.id)}
              onClick={() => handleBuy(pet)}>
              {isOwned('workshop-' + pet.id) ? '已拥有' : buyingId === pet.id ? '下载中...' : '🪙 ' + (pet.price || 200)}
            </button>
          </div>
        ))}
      </div>}
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => loadPets(nextCursor)} disabled={loadingMore} style={{
            padding: '10px 32px', fontSize: 13, fontWeight: 600,
            background: loadingMore ? '#f1f5f9' : '#fff',
            color: loadingMore ? '#94a3b8' : '#FF8C00',
            border: `1px solid ${loadingMore ? '#e2e8f0' : '#fed7aa'}`,
            borderRadius: 10, cursor: loadingMore ? 'not-allowed' : 'pointer',
          }}>
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
      {pendingHatch && <HatchConfirmModal
        petName={pendingHatch.pet.name}
        rarity={pendingHatch.rarity}
        onStart={(customName) => {
          useHatchStore.setState(s => ({
            eggs: s.eggs.map(egg => egg.eggId === pendingHatch.eggId ? { ...egg, petName: customName } : egg),
          }));
          useHatchStore.getState().save();
          startHatching(pendingHatch.eggId);
          setPendingHatch(null);
          window.dispatchEvent(new CustomEvent('switch-pet-tab', { detail: 'hatch' }));
        }}
        onLater={(customName) => {
          useHatchStore.setState(s => ({
            eggs: s.eggs.map(egg => egg.eggId === pendingHatch.eggId ? { ...egg, petName: customName } : egg),
          }));
          useHatchStore.getState().save();
          setPendingHatch(null);
        }}
        onClose={() => {
          setPendingHatch(null);
        }}
      />}
    </div>
  );
}
