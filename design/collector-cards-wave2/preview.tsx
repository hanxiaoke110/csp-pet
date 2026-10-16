import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import HoloCardViewer from '../../src/components/cards/HoloCardViewer';
import type { CollectorCardDefinition } from '../../src/types/collectorCard';
import '../../src/components/cards/collectorCards.css';
import './preview.css';

function Preview() {
  const [cards, setCards] = useState<CollectorCardDefinition[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const catalogUrl = new URL('./preview-catalog.json', window.location.href);
    fetch(catalogUrl).then(r => { if (!r.ok) throw new Error('目录读取失败'); return r.json(); })
      .then(data => setCards(data.cards.map((card: CollectorCardDefinition) => ({...card, assets:Object.fromEntries(Object.entries(card.assets).map(([key,path])=>[key,new URL(path,catalogUrl).href]))}))))
      .catch(e=>setError(String(e)));
  }, []);
  const card = cards[selected];
  return <main className="wave-preview collector-page">
    <header><span className="collector-kicker">ASTRAL COLLECTION · WAVE II</span><h1>第二期典藏 · 九位新伙伴</h1><p>角色、场景、铭文独立分层 · 沿用桌宠赏卡引擎 · 已在线上架</p></header>
    {error && <p role="alert">{error}</p>}
    {card && <section className="wave-stage"><HoloCardViewer key={card.id} card={card} assets={{...card.assets,source:'remote'}}/><aside><small>NO. {card.number} · 传说</small><h2>{card.name}</h2><h3>{card.title}</h3><p>{card.description}</p><blockquote>{card.quote}</blockquote><p>拟定价格：{card.price} 金币</p><p>鼠标移到卡片上试试，也可以翻面或自动赏卡。此页面不购买、不扣金币、不改存档。</p></aside></section>}
    <nav aria-label="选择典藏卡" className="wave-picker">{cards.map((c,i)=><button type="button" className={selected===i?'selected':''} key={c.id} onClick={()=>setSelected(i)}><img src={c.assets.thumbnail} alt=""/><span>{c.number} · {c.name}</span></button>)}</nav>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
